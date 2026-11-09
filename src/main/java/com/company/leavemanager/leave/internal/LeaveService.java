package com.company.leavemanager.leave.internal;

import com.company.leavemanager.audit.api.AuditRecorder;
import com.company.leavemanager.identity.api.EmployeeDirectory;
import com.company.leavemanager.identity.api.EmployeeDirectory.EmployeeView;
import com.company.leavemanager.leave.api.dto.BalanceResponse;
import com.company.leavemanager.leave.api.dto.LeaveRequestResponse;
import com.company.leavemanager.leave.api.dto.PageResponse;
import com.company.leavemanager.leave.api.dto.PreviewResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Deque;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * The leave use cases and the business rules behind them (BR-5 … BR-11).
 *
 * <p>Every rule is checked here, never in a controller: the controller only turns the outcome into a
 * response (docs/security.md). "Today" always comes from the injected {@link Clock} read in the
 * business zone, so no test waits for a date and no rule depends on the machine's time zone.
 */
@Service
public class LeaveService {

    static final int DEFAULT_PAGE_SIZE = 20;
    static final int MAX_PAGE_SIZE = 100;

    private final LeaveRepository requests;
    private final LeaveAdjustmentRepository adjustments;
    private final PublicHolidayRepository holidays;
    private final EmployeeDirectory employees;
    private final AuditRecorder audit;
    private final Clock clock;

    public LeaveService(LeaveRepository requests,
                        LeaveAdjustmentRepository adjustments,
                        PublicHolidayRepository holidays,
                        EmployeeDirectory employees,
                        AuditRecorder audit,
                        Clock clock) {
        this.requests = requests;
        this.adjustments = adjustments;
        this.holidays = holidays;
        this.employees = employees;
        this.audit = audit;
        this.clock = clock;
    }

    // ------------------------------------------------------------------ create

    @Transactional
    public LeaveResult<LeaveRequestResponse> create(UUID actorId,
                                                    LeaveType type,
                                                    LocalDate startDate,
                                                    LocalDate endDate,
                                                    String reason) {
        LocalDate today = today();
        Optional<EmployeeView> found = employees.find(actorId);
        if (found.isEmpty()) {
            return LeaveResult.error(LeaveError.NOT_FOUND);
        }
        EmployeeView employee = found.get();
        if (employee.managerId() == null) {
            // The spec: an employee with no manager cannot request leave; HR connects the tree first.
            return LeaveResult.error(LeaveError.NO_MANAGER);
        }
        if (type == null || startDate == null || endDate == null) {
            return LeaveResult.error(LeaveError.INVALID_RANGE);
        }
        if (endDate.isBefore(startDate)) {
            return LeaveResult.error(LeaveError.INVALID_RANGE);
        }
        if (startDate.isBefore(today)) {
            return LeaveResult.error(LeaveError.PAST_DATE);   // BR-11
        }
        int businessDays = calendar().workingDays(startDate, endDate);
        if (businessDays == 0) {
            return LeaveResult.error(LeaveError.NO_WORKING_DAY);
        }

        List<LeaveRequest> active = activeRequests(employee.id());
        if (active.stream().anyMatch(request -> request.overlaps(startDate, endDate))) {
            return LeaveResult.error(LeaveError.OVERLAP);     // BR-6
        }
        if (type.consumesBalance()) {
            LeaveBalance balance = balanceOf(employee, active);
            if (balance.remaining() < businessDays) {
                return LeaveResult.error(LeaveError.BALANCE_EXCEEDED);  // BR-5 at request time
            }
        }

        LeaveRequest request = LeaveRequest.create(
                employee.id(), type, startDate, endDate, businessDays, reason, clock.instant());
        requests.save(request);
        audit.leaveRequested(actorId, employee.id(), request.getId(), type.name(), businessDays);
        return LeaveResult.ok(response(request, employee.displayName(), null, today));
    }

    // ----------------------------------------------------------------- decide

    @Transactional
    public LeaveResult<LeaveRequestResponse> approve(UUID actorId, UUID requestId, String note) {
        return decide(actorId, requestId, note, true);
    }

    @Transactional
    public LeaveResult<LeaveRequestResponse> reject(UUID actorId, UUID requestId, String note) {
        return decide(actorId, requestId, note, false);
    }

    private LeaveResult<LeaveRequestResponse> decide(UUID actorId, UUID requestId, String note, boolean approve) {
        Optional<LeaveRequest> found = requests.findById(requestId);
        if (found.isEmpty()) {
            return LeaveResult.error(LeaveError.NOT_FOUND);
        }
        LeaveRequest request = found.get();
        Optional<EmployeeView> actor = employees.find(actorId);
        if (actor.isEmpty()) {
            return LeaveResult.error(LeaveError.NOT_FOUND);
        }
        Optional<EmployeeView> target = employees.find(request.getEmployeeId());
        if (target.isEmpty()) {
            return LeaveResult.error(LeaveError.NOT_FOUND);
        }
        EmployeeView employee = target.get();
        LeaveResult<LeaveRequestResponse> refusal = authorizeDecision(actor.get(), request, employee);
        if (refusal != null) {
            return refusal;
        }
        if (request.getStatus() != LeaveRequestStatus.PENDING) {
            return LeaveResult.error(LeaveError.NOT_PENDING);
        }
        if (request.getType().consumesBalance()) {
            // BR-5 at approval time: the state may have changed since the request was created.
            // The pending request already counts against the balance, so "remaining < 0" means the
            // approval itself would leave the employee below zero.
            LeaveBalance balance = balanceOf(employee, activeRequests(employee.id()));
            if (balance.remaining() < 0) {
                return LeaveResult.error(LeaveError.BALANCE_EXCEEDED);
            }
        }
        if (!approve && (note == null || note.isBlank())) {
            return LeaveResult.error(LeaveError.INVALID_PARAMETER);
        }

        LeaveRequestStatus before = request.getStatus();
        if (approve) {
            request.approve(actorId, note, clock.instant());
        } else {
            request.reject(actorId, note, clock.instant());
        }
        requests.save(request);
        audit.leaveDecided(approve ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
                actorId, employee.id(), request.getId(), before.name(), request.getStatus().name());
        return LeaveResult.ok(response(request, employee.displayName(), actor.get().displayName(), today()));
    }

    /**
     * BR-7: only the direct manager decides. HR and the CEO never approve — even if the org tree
     * points at one of them — and nobody approves their own request.
     */
    private LeaveResult<LeaveRequestResponse> authorizeDecision(EmployeeView actor,
                                                                LeaveRequest request,
                                                                EmployeeView employee) {
        if (actor.isHr() || actor.isCeo()) {
            return LeaveResult.error(LeaveError.NOT_MANAGER);
        }
        if (actor.id().equals(request.getEmployeeId())) {
            return LeaveResult.error(LeaveError.NOT_MANAGER);
        }
        if (!"MANAGER".equals(actor.role())) {
            return LeaveResult.error(LeaveError.NOT_MANAGER);
        }
        if (!actor.id().equals(employee.managerId())) {
            return LeaveResult.error(LeaveError.NOT_MANAGER);
        }
        return null;
    }

    // ----------------------------------------------------------------- cancel

    @Transactional
    public LeaveResult<LeaveRequestResponse> cancel(UUID actorId, UUID requestId) {
        Optional<LeaveRequest> found = requests.findById(requestId);
        if (found.isEmpty()) {
            return LeaveResult.error(LeaveError.NOT_FOUND);
        }
        LeaveRequest request = found.get();
        if (!actorId.equals(request.getEmployeeId())) {
            return LeaveResult.error(LeaveError.NOT_OWNER);
        }
        if (request.getStatus() != LeaveRequestStatus.APPROVED) {
            return LeaveResult.error(LeaveError.NOT_APPROVED);
        }
        if (request.hasStarted(today())) {
            // BR-8: a started request is corrected by a recorded HR adjustment, not by a cancellation.
            return LeaveResult.error(LeaveError.ALREADY_STARTED);
        }
        LeaveRequestStatus before = request.getStatus();
        request.cancel(clock.instant());
        requests.save(request);
        audit.leaveCancelled(actorId, request.getEmployeeId(), request.getId(), before.name());
        Optional<EmployeeView> employee = employees.find(request.getEmployeeId());
        return LeaveResult.ok(response(request,
                employee.map(EmployeeView::displayName).orElse(null),
                null, today()));
    }

    // --------------------------------------------------------------- balance

    public LeaveResult<BalanceResponse> balance(UUID actorId, UUID employeeId) {
        Optional<EmployeeView> actor = employees.find(actorId);
        if (actor.isEmpty()) {
            return LeaveResult.error(LeaveError.NOT_FOUND);
        }
        EmployeeView target = employeeId == null ? actor.get() : employees.find(employeeId).orElse(null);
        if (target == null) {
            return LeaveResult.error(LeaveError.NOT_FOUND);
        }
        if (!target.id().equals(actorId) && !actor.get().isHr() && !actor.get().isCeo()) {
            return LeaveResult.error(LeaveError.NOT_AUTHORIZED);
        }
        return LeaveResult.ok(balanceResponse(target, balanceOf(target)));
    }

    @Transactional
    public LeaveResult<BalanceResponse> adjust(UUID actorId, UUID employeeId, int days, String reason) {
        Optional<EmployeeView> operator = employees.find(actorId);
        if (operator.isEmpty()) {
            return LeaveResult.error(LeaveError.NOT_FOUND);
        }
        if (!operator.get().isHr()) {
            return LeaveResult.error(LeaveError.NOT_AUTHORIZED);
        }
        Optional<EmployeeView> found = employees.find(employeeId);
        if (found.isEmpty()) {
            return LeaveResult.error(LeaveError.NOT_FOUND);
        }
        if (days == 0 || reason == null || reason.isBlank()) {
            return LeaveResult.error(LeaveError.INVALID_ADJUSTMENT);
        }
        EmployeeView employee = found.get();
        LeaveBalance before = balanceOf(employee);
        LeaveBalance after = new LeaveBalance(
                before.entitlement(), before.carryover(), before.adjustments() + days,
                before.approved(), before.pending());
        if (after.remaining() < 0) {
            // The domain invariant: a balance is never negative (docs/domain.md).
            return LeaveResult.error(LeaveError.ADJUSTMENT_NOT_ALLOWED);
        }
        adjustments.save(LeaveAdjustment.of(employeeId, days, reason, actorId, clock.instant()));
        audit.leaveBalanceAdjusted(actorId, employeeId, days, before.remaining(), after.remaining(), reason);
        return LeaveResult.ok(balanceResponse(employee, after));
    }

    // ------------------------------------------------------------------ list

    public LeaveResult<PageResponse<LeaveRequestResponse>> list(UUID actorId,
                                                               String status,
                                                               int page,
                                                               int size) {
        LeaveResult<PageResponse<LeaveRequestResponse>> invalid = validatePaging(page, size);
        if (invalid != null) {
            return invalid;
        }
        Optional<EmployeeView> actor = employees.find(actorId);
        if (actor.isEmpty()) {
            return LeaveResult.error(LeaveError.NOT_FOUND);
        }
        LeaveRequestStatus filter;
        String normalized = status == null ? "" : status.trim();
        if (normalized.isEmpty() || "ALL".equalsIgnoreCase(normalized)) {
            filter = null;
        } else {
            try {
                filter = LeaveRequestStatus.valueOf(normalized.toUpperCase(Locale.ROOT));
            } catch (IllegalArgumentException unknown) {
                return LeaveResult.error(LeaveError.INVALID_PARAMETER);
            }
        }
        PageRequest pageable = PageRequest.of(page - 1, size);
        Page<LeaveRequest> result;
        if (actor.get().isHr() || actor.get().isCeo()) {
            result = filter == null
                    ? requests.findAllByOrderByStartDateDesc(pageable)
                    : requests.findByStatusOrderByStartDateDesc(filter, pageable);
        } else {
            List<UUID> scope = actor.get().isManager() ? subtree(actorId) : List.of(actorId);
            result = filter == null
                    ? requests.findByEmployeeIdInOrderByStartDateDesc(scope, pageable)
                    : requests.findByEmployeeIdInAndStatusOrderByStartDateDesc(scope, filter, pageable);
        }
        return LeaveResult.ok(new PageResponse<>(
                responses(result.getContent()),
                page,
                size,
                result.getTotalElements(),
                result.getTotalPages()));
    }

    /** The manager queue: pending requests of the direct reports, earliest start first. */
    public LeaveResult<List<LeaveRequestResponse>> queue(UUID actorId) {
        Optional<EmployeeView> actor = employees.find(actorId);
        if (actor.isEmpty()) {
            return LeaveResult.error(LeaveError.NOT_FOUND);
        }
        if (!actor.get().isManager()) {
            return LeaveResult.error(LeaveError.NOT_AUTHORIZED);
        }
        List<UUID> reports = employees.directReports(actorId).stream().map(EmployeeView::id).toList();
        if (reports.isEmpty()) {
            return LeaveResult.ok(List.of());
        }
        List<LeaveRequest> pending =
                requests.findByEmployeeIdInAndStatusOrderByStartDateAsc(reports, LeaveRequestStatus.PENDING);
        return LeaveResult.ok(responses(pending));
    }

    // --------------------------------------------------------------- preview

    /** The working-day count and the balance left after it, for the form's summary before sending. */
    public LeaveResult<PreviewResponse> preview(UUID actorId, LeaveType type, LocalDate startDate, LocalDate endDate) {
        Optional<EmployeeView> employee = employees.find(actorId);
        if (employee.isEmpty()) {
            return LeaveResult.error(LeaveError.NOT_FOUND);
        }
        if (startDate == null || endDate == null || endDate.isBefore(startDate)) {
            return LeaveResult.error(LeaveError.INVALID_RANGE);
        }
        int businessDays = calendar().workingDays(startDate, endDate);
        LeaveBalance balance = balanceOf(employee.get());
        int consumed = type != null && type.consumesBalance() ? businessDays : 0;
        return LeaveResult.ok(new PreviewResponse(businessDays, balance.remaining() - consumed));
    }

    // --------------------------------------------------------------- helpers

    private LeaveBalance balanceOf(EmployeeView employee) {
        return balanceOf(employee, activeRequests(employee.id()));
    }

    private LeaveBalance balanceOf(EmployeeView employee, Collection<LeaveRequest> active) {
        LeaveEntitlement entitlement = LeaveEntitlement.of(employee.hireDate(), today());
        int adjustmentDays = adjustments.findByEmployeeId(employee.id()).stream()
                .mapToInt(LeaveAdjustment::getDays)
                .sum();
        return LeaveBalance.of(entitlement, adjustmentDays, new ArrayList<>(active));
    }

    private BalanceResponse balanceResponse(EmployeeView employee, LeaveBalance balance) {
        LeaveEntitlement entitlement = LeaveEntitlement.of(employee.hireDate(), today());
        String managerName = employee.managerId() == null
                ? null
                : employees.find(employee.managerId()).map(EmployeeView::displayName).orElse(null);
        return new BalanceResponse(
                balance.entitlement(),
                balance.carryover(),
                balance.adjustments(),
                balance.approved(),
                balance.pending(),
                balance.remaining(),
                entitlement.periodStart(),
                entitlement.periodEnd(),
                employee.hireDate(),
                entitlement.defaulted(),
                entitlement.completedYears(),
                employee.managerId() != null,
                managerName);
    }

    private List<LeaveRequest> activeRequests(UUID employeeId) {
        return requests.findByEmployeeIdAndStatusIn(employeeId, LeaveRequestStatus.active());
    }

    private List<UUID> subtree(UUID managerId) {
        Map<UUID, List<UUID>> children = new HashMap<>();
        for (EmployeeView employee : employees.findAll()) {
            if (employee.managerId() != null) {
                children.computeIfAbsent(employee.managerId(), key -> new ArrayList<>()).add(employee.id());
            }
        }
        Set<UUID> visited = new LinkedHashSet<>();
        Deque<UUID> queue = new ArrayDeque<>(List.of(managerId));
        while (!queue.isEmpty()) {
            UUID id = queue.poll();
            if (!visited.add(id)) {
                continue;   // a malformed cycle must not loop forever
            }
            queue.addAll(children.getOrDefault(id, List.of()));
        }
        return List.copyOf(visited);
    }

    private List<LeaveRequestResponse> responses(List<LeaveRequest> page) {
        Map<UUID, String> names = new HashMap<>();
        for (EmployeeView employee : employees.findAll()) {
            names.put(employee.id(), employee.displayName());
        }
        LocalDate today = today();
        List<LeaveRequestResponse> responses = new ArrayList<>(page.size());
        for (LeaveRequest request : page) {
            responses.add(response(request,
                    names.get(request.getEmployeeId()),
                    request.getDecidedBy() == null ? null : names.get(request.getDecidedBy()),
                    today));
        }
        return responses;
    }

    private LeaveRequestResponse response(LeaveRequest request, String employeeName, String decidedByName, LocalDate today) {
        return new LeaveRequestResponse(
                request.getId(),
                request.getEmployeeId(),
                employeeName,
                request.getType().name(),
                request.getStartDate(),
                request.getEndDate(),
                request.getBusinessDays(),
                request.getStatus().name(),
                request.getReason(),
                request.getDecidedBy(),
                decidedByName,
                request.getDecidedAt(),
                request.getDecisionNote(),
                request.getCreatedAt(),
                request.getStatus() == LeaveRequestStatus.APPROVED && !request.hasStarted(today));
    }

    private BusinessCalendar calendar() {
        return new BusinessCalendar(holidays.findAll().stream().map(PublicHoliday::getDay).toList());
    }

    private LocalDate today() {
        return BusinessCalendar.today(clock);
    }

    private static LeaveResult<PageResponse<LeaveRequestResponse>> validatePaging(int page, int size) {
        if (page < 1 || size < 1 || size > MAX_PAGE_SIZE) {
            return LeaveResult.error(LeaveError.INVALID_PARAMETER);
        }
        return null;
    }

    private static boolean blank(String value) {
        return value == null || value.isBlank();
    }
}

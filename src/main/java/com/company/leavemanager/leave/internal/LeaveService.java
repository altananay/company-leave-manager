package com.company.leavemanager.leave.internal;

import com.company.leavemanager.audit.api.AuditRecorder;
import com.company.leavemanager.identity.api.EmployeeDirectory;
import com.company.leavemanager.identity.api.EmployeeDirectory.EmployeeView;
import com.company.leavemanager.leave.api.dto.BalanceResponse;
import com.company.leavemanager.leave.api.dto.LeaveDayResponse;
import com.company.leavemanager.leave.api.dto.LeaveRequestResponse;
import com.company.leavemanager.leave.api.dto.PageResponse;
import com.company.leavemanager.leave.api.dto.PreviewResponse;
import jakarta.persistence.EntityManager;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
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
 *
 * <p><strong>Write serialisation (L-07).</strong> Every write path first takes a row lock on the
 * employee's account ({@code SELECT … FOR UPDATE} through {@link EmployeeDirectory#lock}), and works
 * from the row it returns — a view read <em>after</em> the lock, refreshed from the database (M-03).
 * Two concurrent requests for the same employee therefore run one after the other: the second one
 * sees the first one's row, and a hire-date or manager edit that committed while it waited, so an
 * overlapping, over-balance or stale-org request cannot slip through the gap between check and insert.
 *
 * <p><strong>Authorisation before loading (L-22).</strong> A manager's approve/reject only ever
 * loads a request through a query scoped to their own reports, and cancel only loads the caller's
 * own row. A request outside that scope answers exactly like a missing one.
 */
@Service
public class LeaveService {

    static final int DEFAULT_PAGE_SIZE = 20;
    static final int MAX_PAGE_SIZE = 100;

    /** BR-10's excuse leave is bounded in phase A: five business days at most (L-02). */
    static final int EXCUSE_MAX_BUSINESS_DAYS = 5;

    /** D15: a half day is exactly half of a working day, stored in the decimal day unit. */
    static final BigDecimal HALF_DAY_DAYS = new BigDecimal("0.5");

    /** D16: HR may correct a balance by half days, no further than ±365 days in one row. */
    static final BigDecimal MAX_ADJUSTMENT_DAYS = BigDecimal.valueOf(365);

    /** D16: the adjustment step is half a day, so a finer correction is a data-entry error. */
    static final BigDecimal ADJUSTMENT_STEP = new BigDecimal("0.5");

    /** D20: "izinli günlerim" opens on the next 90 days when the caller gives no range. */
    static final int DEFAULT_DAYS_WINDOW = 90;

    private final LeaveRepository requests;
    private final LeaveAdjustmentRepository adjustments;
    private final PublicHolidayRepository holidays;
    private final EmployeeDirectory employees;
    private final AuditRecorder audit;
    private final Clock clock;
    private final EntityManager entityManager;

    public LeaveService(LeaveRepository requests,
                        LeaveAdjustmentRepository adjustments,
                        PublicHolidayRepository holidays,
                        EmployeeDirectory employees,
                        AuditRecorder audit,
                        Clock clock,
                        EntityManager entityManager) {
        this.requests = requests;
        this.adjustments = adjustments;
        this.holidays = holidays;
        this.employees = employees;
        this.audit = audit;
        this.clock = clock;
        this.entityManager = entityManager;
    }

    // ------------------------------------------------------------------ create

    /** Creates the caller's own request; {@code employeeId} is the HR path (BR-11's exception). */
    @Transactional
    public LeaveResult<LeaveRequestResponse> create(UUID actorId,
                                                    UUID employeeId,
                                                    LeaveType type,
                                                    LocalDate startDate,
                                                    LocalDate endDate,
                                                    HalfDay halfDay,
                                                    Kinship kinship,
                                                    String reason) {
        LocalDate today = today();
        Optional<EmployeeView> actor = employees.find(actorId);
        if (actor.isEmpty()) {
            return LeaveResult.error(LeaveError.NOT_FOUND);
        }
        if (employeeId != null && !employeeId.equals(actorId) && !actor.get().isHr()) {
            // Only HR records a request on someone else's behalf; a manager approves, never creates.
            return LeaveResult.error(LeaveError.NOT_AUTHORIZED);
        }
        UUID targetId = employeeId == null ? actorId : employeeId;
        Optional<EmployeeView> found = employees.find(targetId);
        if (found.isEmpty()) {
            return LeaveResult.error(LeaveError.NOT_FOUND);
        }
        EmployeeView employee = found.get();

        if (type == null || startDate == null || endDate == null) {
            return LeaveResult.error(LeaveError.INVALID_RANGE);
        }
        if (!BusinessCalendar.isSupported(startDate) || !BusinessCalendar.isSupported(endDate)) {
            // M-07: a date outside the calendar's years is a data-entry error. The bound is checked
            // before any date arithmetic, so an extreme value answers 400 instead of overflowing.
            return LeaveResult.error(LeaveError.INVALID_RANGE);
        }
        if (endDate.isBefore(startDate)) {
            return LeaveResult.error(LeaveError.INVALID_RANGE);
        }
        // L-03: a year plus its leap day is the longest span the business has. Anything longer is a
        // data-entry error, and accepting it would make the working-day count and the balance
        // meaningless rather than merely slow.
        if (startDate.plusDays(BusinessCalendar.MAX_RANGE_DAYS - 1L).isBefore(endDate)) {
            return LeaveResult.error(LeaveError.RANGE_TOO_LONG);
        }

        boolean retroactive = false;
        if (startDate.isBefore(today)) {
            if (!actor.get().isHr()) {
                return LeaveResult.error(LeaveError.PAST_DATE);   // BR-11
            }
            if (blank(reason)) {
                // BR-11's only exception: HR's own recorded request, and only with its reason.
                return LeaveResult.error(LeaveError.RETROACTIVE_REASON_REQUIRED);
            }
            retroactive = true;
        }

        // From here on the employee row is ours: a concurrent create/cancel/decide waits for it.
        // M-03: the view above was read before the lock, so every rule that depends on the org data
        // is decided again on the row the lock returned — a hire-date edit that committed while this
        // request waited must not be overruled by the stale snapshot.
        EmployeeView locked = employees.lock(employee.id()).orElse(employee);
        Optional<EmployeeView> manager = locked.managerId() == null
                ? Optional.empty()
                : employees.find(locked.managerId());
        // L-12: the approver must be an active MANAGER. A link to a deactivated account, an
        // employee or an HR/CEO user would leave the request without anyone who could decide it.
        // M-05: a link to the account itself is the same defect and is refused here too.
        if (locked.managerId() == null
                || locked.managerId().equals(locked.id())
                || manager.isEmpty()
                || !manager.get().active()
                || !manager.get().isManager()) {
            // The spec: an employee with no manager cannot request leave; HR connects the tree first.
            return LeaveResult.error(LeaveError.NO_MANAGER);
        }
        if (locked.hireDate() != null && startDate.isBefore(locked.hireDate())) {
            // M-06: leave cannot start before the employment did — HR's retroactive record included.
            return LeaveResult.error(LeaveError.INVALID_RANGE);
        }
        if (type.consumesBalance() && locked.hireDate() == null) {
            // L-05: without a hire date the seniority is unknown, and the rule is not to guess 14.
            return LeaveResult.error(LeaveError.NO_HIRE_DATE);
        }

        // D15: a half day is one working day of ANNUAL or EXCUSE. A range or another type cannot
        // carry one; the count is 0,5 when the single day is a working day and zero otherwise.
        HalfDay effectiveHalfDay = halfDay == null ? HalfDay.NONE : halfDay;
        if (effectiveHalfDay != HalfDay.NONE
                && (!startDate.equals(endDate) || !type.allowsHalfDay())) {
            return LeaveResult.error(LeaveError.HALF_DAY_INVALID);
        }
        BigDecimal businessDays = businessDaysOf(startDate, endDate, effectiveHalfDay);
        if (businessDays.signum() == 0) {
            return LeaveResult.error(LeaveError.NO_WORKING_DAY);
        }
        if (type == LeaveType.EXCUSE) {
            // L-02: phase A carries no special-leave durations; the excuse type is bounded so it
            // cannot stand in for a second annual entitlement. Phase B opens BR-10's six types.
            if (blank(reason)) {
                return LeaveResult.error(LeaveError.REASON_REQUIRED);
            }
            if (businessDays.compareTo(BigDecimal.valueOf(EXCUSE_MAX_BUSINESS_DAYS)) > 0) {
                return LeaveResult.error(LeaveError.EXCUSE_TOO_LONG);
            }
        }

        List<LeaveRequest> active = activeRequests(locked.id());
        // BR-10/D19's type rules run before the overlap and balance gates (the plan's fixed error
        // precedence): their own codes name what the request got wrong, and the quota needs the
        // active requests anyway. ANNUAL and EXCUSE pass through every call.
        Optional<LeaveError> special = specialLeaveRefusal(
                type, startDate, endDate, businessDays, kinship, locked, active);
        if (special.isPresent()) {
            return LeaveResult.error(special.get());
        }
        if (active.stream().anyMatch(request -> request.overlaps(startDate, endDate))) {
            return LeaveResult.error(LeaveError.OVERLAP);     // BR-6
        }
        if (type.consumesBalance()) {
            LeaveBalance balance = balanceOf(locked, active);
            if (balance.remaining().compareTo(businessDays) < 0) {
                return LeaveResult.error(LeaveError.BALANCE_EXCEEDED);  // BR-5 at request time
            }
        }

        LeaveRequest request = LeaveRequest.create(
                locked.id(), type, startDate, endDate, effectiveHalfDay, businessDays, kinship, reason,
                retroactive, clock.instant());
        requests.save(request);
        if (retroactive) {
            audit.leaveRetroactiveRequested(actorId, locked.id(), request.getId(),
                    type.name(), businessDays, reason);
        } else {
            audit.leaveRequested(actorId, locked.id(), request.getId(), type.name(), businessDays);
        }
        return LeaveResult.ok(response(request, locked.displayName(), null, today));
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
        Optional<EmployeeView> actor = employees.find(actorId);
        if (actor.isEmpty()) {
            return LeaveResult.error(LeaveError.NOT_FOUND);
        }
        // BR-7: HR and the CEO never decide — even if the org tree points at one of them — and an
        // account without the MANAGER role cannot be an approver at all. These two gates need no
        // request to answer, so the request is not loaded for them (L-22) and deleting one of the
        // other gates (scope, self, role) still fails a test.
        if (actor.get().isHr() || actor.get().isCeo() || !actor.get().isManager()) {
            return LeaveResult.error(LeaveError.NOT_MANAGER);
        }

        List<UUID> reportIds = reports(actorId);
        if (reportIds.isEmpty()) {
            return LeaveResult.error(LeaveError.NOT_FOUND);
        }
        Optional<LeaveRequest> scoped = requests.findByIdAndEmployeeIdIn(requestId, reportIds);
        if (scoped.isEmpty()) {
            // Not the request's manager, or no such request: one answer, and it is the same one.
            return LeaveResult.error(LeaveError.NOT_FOUND);
        }
        LeaveRequest request = scoped.get();
        if (actorId.equals(request.getEmployeeId())) {
            return LeaveResult.error(LeaveError.NOT_MANAGER);   // nobody approves their own request
        }
        Optional<EmployeeView> target = employees.find(request.getEmployeeId());
        if (target.isEmpty()) {
            return LeaveResult.error(LeaveError.NOT_FOUND);
        }
        EmployeeView employee = target.get();

        // The employee's row is the lock: the request we read above may have changed while we were
        // waiting for it, so it is re-read under the lock (L-07). The employee is re-read with it
        // (M-03): the balance below reads the hire date, and that may have been edited meanwhile.
        EmployeeView locked = employees.lock(employee.id()).orElse(employee);
        entityManager.refresh(request);

        if (request.getStatus() != LeaveRequestStatus.PENDING) {
            return LeaveResult.error(LeaveError.NOT_PENDING);
        }
        if (approve) {
            // BR-11 at approval time: the request may have been created before its start and is only
            // being decided after it. HR's recorded retroactive request is the documented exception.
            if (request.getStartDate().isBefore(today()) && !request.isRetroactive()) {
                return LeaveResult.error(LeaveError.PAST_DATE);
            }
            List<LeaveRequest> active = activeRequests(locked.id());
            // BR-6 at approval time: state can change between the request and the decision. The
            // request itself is pending and overlaps its own range, so it is excluded by id.
            boolean overlaps = active.stream()
                    .filter(other -> !other.getId().equals(request.getId()))
                    .anyMatch(other -> other.overlaps(request.getStartDate(), request.getEndDate()));
            if (overlaps) {
                return LeaveResult.error(LeaveError.OVERLAP);
            }
            // D19 at approval time: another request of the same type may have taken the quota while
            // this one waited. The request under approval is excluded, so its own days do not count
            // twice; rejection stays free of this gate.
            Optional<LeaveError> quota = SpecialLeavePolicy.checkQuota(
                    request.getType(), request.getStartDate(), request.getBusinessDays(),
                    locked.birthDate(), active, request.getId());
            if (quota.isPresent()) {
                return LeaveResult.error(quota.get());
            }
        }
        if (request.getType().consumesBalance()) {
            // BR-5 at approval time: the pending request already counts against the balance, so
            // "remaining < 0" means the approval itself would leave the employee below zero.
            LeaveBalance balance = balanceOf(locked, activeRequests(locked.id()));
            if (balance.remaining().signum() < 0) {
                return LeaveResult.error(LeaveError.BALANCE_EXCEEDED);
            }
        }
        if (!approve && blank(note)) {
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
                actorId, locked.id(), request.getId(), before.name(), request.getStatus().name());
        return LeaveResult.ok(response(request, locked.displayName(), actor.get().displayName(), today()));
    }

    // ----------------------------------------------------------------- cancel

    @Transactional
    public LeaveResult<LeaveRequestResponse> cancel(UUID actorId, UUID requestId) {
        Optional<EmployeeView> actor = employees.find(actorId);
        if (actor.isEmpty()) {
            return LeaveResult.error(LeaveError.NOT_FOUND);
        }
        // The caller's row under the lock (M-03): a concurrent edit is answered about, not ignored.
        EmployeeView caller = employees.lock(actorId).orElse(actor.get());
        // Scoped by owner: another employee's request is indistinguishable from a missing one.
        Optional<LeaveRequest> found = requests.findByIdAndEmployeeId(requestId, actorId);
        if (found.isEmpty()) {
            return LeaveResult.error(LeaveError.NOT_FOUND);
        }
        LeaveRequest request = found.get();
        if (request.getStatus() != LeaveRequestStatus.APPROVED) {
            return LeaveResult.error(LeaveError.NOT_APPROVED);
        }
        if (request.hasStarted(today())) {
            // BR-8: a started request is corrected by a recorded HR adjustment, not by a cancellation.
            return LeaveResult.error(LeaveError.ALREADY_STARTED);
        }
        LeaveRequestStatus before = request.getStatus();
        request.cancel(actorId, clock.instant());
        requests.save(request);
        audit.leaveCancelled(actorId, request.getEmployeeId(), request.getId(), before.name());
        return LeaveResult.ok(response(request, caller.displayName(), null, today()));
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
        if (!target.id().equals(actorId) && !actor.get().isHr() && !actor.get().isCeo()
                && !(actor.get().isManager() && subtree(actorId).contains(target.id()))) {
            // Out of scope: answering 403 here would confirm that the account exists (L-22).
            return LeaveResult.error(LeaveError.NOT_FOUND);
        }
        return LeaveResult.ok(balanceResponse(target, balanceOf(target)));
    }

    @Transactional
    public LeaveResult<BalanceResponse> adjust(UUID actorId, UUID employeeId, BigDecimal days, String reason) {
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
        if (days == null || days.signum() == 0 || blank(reason)
                || !isHalfDayStep(days)
                || days.abs().compareTo(MAX_ADJUSTMENT_DAYS) > 0) {
            // D16: the correction is a nonzero multiple of 0,5 within ±365 days; anything finer or
            // larger is a data-entry error, not a balance move.
            return LeaveResult.error(LeaveError.INVALID_ADJUSTMENT);
        }
        BigDecimal correction = days.setScale(1, RoundingMode.UNNECESSARY);
        // The row under the lock (M-03): the balance this adjustment is judged by reads the hire
        // date, so it must be the one the lock returned, not the snapshot taken before it.
        EmployeeView employee = employees.lock(employeeId).orElse(found.get());
        LeaveBalance before = balanceOf(employee);
        LeaveBalance after = new LeaveBalance(
                before.entitlement(), before.carryover(), before.adjustments().add(correction),
                before.approved(), before.pending());
        if (after.remaining().signum() < 0) {
            // The domain invariant: a balance is never negative (docs/domain.md).
            return LeaveResult.error(LeaveError.ADJUSTMENT_NOT_ALLOWED);
        }
        adjustments.save(LeaveAdjustment.of(employeeId, correction, reason, actorId, clock.instant()));
        audit.leaveBalanceAdjusted(actorId, employeeId, correction,
                before.remaining(), after.remaining(), reason);
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
                responses(result.getContent(), kinshipScope(actor.get(), actorId)),
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
        // The queue is the direct reports' queue: every row's kinship belongs to this manager (D18).
        return LeaveResult.ok(responses(pending, null));
    }

    // --------------------------------------------------------------- preview

    /** The working-day count and the balance left after it, for the form's summary before sending. */
    public LeaveResult<PreviewResponse> preview(UUID actorId,
                                                LeaveType type,
                                                LocalDate startDate,
                                                LocalDate endDate,
                                                HalfDay halfDay) {
        Optional<EmployeeView> employee = employees.find(actorId);
        if (employee.isEmpty()) {
            return LeaveResult.error(LeaveError.NOT_FOUND);
        }
        if (startDate == null || endDate == null || endDate.isBefore(startDate)) {
            return LeaveResult.error(LeaveError.INVALID_RANGE);
        }
        if (!BusinessCalendar.isSupported(startDate) || !BusinessCalendar.isSupported(endDate)) {
            // M-07: the preview answers like create does — the same bound, the same code, never a 500.
            return LeaveResult.error(LeaveError.INVALID_RANGE);
        }
        if (startDate.plusDays(BusinessCalendar.MAX_RANGE_DAYS - 1L).isBefore(endDate)) {
            return LeaveResult.error(LeaveError.RANGE_TOO_LONG);
        }
        // D15: the preview applies the same half-day rule as create, so the form's "0,5 gün" is the
        // number the request will store, not a second calculation.
        HalfDay effectiveHalfDay = halfDay == null ? HalfDay.NONE : halfDay;
        if (effectiveHalfDay != HalfDay.NONE
                && (!startDate.equals(endDate) || type == null || !type.allowsHalfDay())) {
            return LeaveResult.error(LeaveError.HALF_DAY_INVALID);
        }
        BigDecimal businessDays = businessDaysOf(startDate, endDate, effectiveHalfDay);
        LeaveBalance balance = balanceOf(employee.get());
        BigDecimal consumed = type != null && type.consumesBalance()
                ? businessDays
                : LeaveBalance.zero();
        return LeaveResult.ok(new PreviewResponse(businessDays, balance.remaining().subtract(consumed)));
    }

    // ------------------------------------------------------------ mine days

    /**
     * "İzinli günlerim" (D20): the caller's own <strong>approved</strong> leave days inside
     * {@code [from, to]}, expanded against the <em>current</em> holiday calendar.
     *
     * <p>The endpoint takes no employee id: the answer is always derived from the session, so a
     * manager or HR cannot read somebody else's day list through it. Pending and cancelled requests
     * are not days off — they stay on the request list. Defaults: today … today + 90 days; the same
     * 366-calendar-day cap as create/preview, applied before any expansion.
     */
    public LeaveResult<List<LeaveDayResponse>> days(UUID actorId, LocalDate from, LocalDate to) {
        Optional<EmployeeView> employee = employees.find(actorId);
        if (employee.isEmpty()) {
            return LeaveResult.error(LeaveError.NOT_FOUND);
        }
        LocalDate effectiveFrom = from == null ? today() : from;
        if (!BusinessCalendar.isSupported(effectiveFrom)) {
            return LeaveResult.error(LeaveError.INVALID_RANGE);
        }
        LocalDate effectiveTo = to == null ? effectiveFrom.plusDays(DEFAULT_DAYS_WINDOW) : to;
        if (!BusinessCalendar.isSupported(effectiveTo) || effectiveTo.isBefore(effectiveFrom)) {
            return LeaveResult.error(LeaveError.INVALID_RANGE);
        }
        if (effectiveFrom.plusDays(BusinessCalendar.MAX_RANGE_DAYS - 1L).isBefore(effectiveTo)) {
            return LeaveResult.error(LeaveError.RANGE_TOO_LONG);
        }
        BusinessCalendar calendar = calendar();
        List<LeaveDayResponse> days = new ArrayList<>();
        for (LeaveRequest request : requests
                .findByEmployeeIdAndStatusAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByStartDateAsc(
                        employee.get().id(), LeaveRequestStatus.APPROVED, effectiveTo, effectiveFrom)) {
            LocalDate day = request.getStartDate().isBefore(effectiveFrom)
                    ? effectiveFrom
                    : request.getStartDate();
            LocalDate last = request.getEndDate().isAfter(effectiveTo)
                    ? effectiveTo
                    : request.getEndDate();
            for (; !day.isAfter(last); day = day.plusDays(1)) {
                if (calendar.isWorkingDay(day)) {
                    days.add(new LeaveDayResponse(day, request.getType().name(),
                            request.getHalfDay(), request.getId()));
                }
            }
        }
        days.sort(Comparator.comparing(LeaveDayResponse::date)
                .thenComparing(LeaveDayResponse::requestId));
        return LeaveResult.ok(days);
    }

    // ------------------------------------------------------------ org-edit facts

    /**
     * The balance this employee would have with {@code hireDate} (spec 0004 review round 2, M-01):
     * the identity module asks before it commits an org-data edit, so HR cannot shrink a hire date
     * into a negative balance. Empty when the account does not exist. The remainder is the decimal
     * day unit (D16): a half day can leave {@code 0.5}, which the old {@code OptionalInt} could not
     * represent.
     */
    public Optional<BigDecimal> remainingIfHiredOn(UUID employeeId, LocalDate hireDate) {
        Optional<EmployeeView> employee = employees.find(employeeId);
        if (employee.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(balanceOf(withHireDate(employee.get(), hireDate)).remaining());
    }

    /** Whether the account still has a pending request its current manager must decide (M-02). */
    public boolean hasPendingRequests(UUID employeeId) {
        return requests.existsByEmployeeIdAndStatus(employeeId, LeaveRequestStatus.PENDING);
    }

    /**
     * Whether an active request starts before {@code hireDate} (spec 0004 review round 3, N-01): the
     * key invariant "izin işe girişten önce başlayamaz" ({@code docs/domain.md}) must hold after an
     * org edit, not only when a request is created. The identity module asks before it stores a new
     * hire date; the request state is this module's to read, so the question is answered here.
     */
    public boolean hasActiveLeaveStartingBefore(UUID employeeId, LocalDate hireDate) {
        return hireDate != null && requests.existsByEmployeeIdAndStatusInAndStartDateBefore(
                employeeId, LeaveRequestStatus.active(), hireDate);
    }

    private static EmployeeView withHireDate(EmployeeView employee, LocalDate hireDate) {
        return new EmployeeView(
                employee.id(),
                employee.email(),
                employee.displayName(),
                employee.role(),
                employee.managerId(),
                hireDate,
                employee.birthDate(),
                employee.hasSchoolAgeChild(),
                employee.active());
    }

    // --------------------------------------------------------------- helpers

    private LeaveBalance balanceOf(EmployeeView employee) {
        return balanceOf(employee, activeRequests(employee.id()));
    }

    private LeaveBalance balanceOf(EmployeeView employee, Collection<LeaveRequest> active) {
        LeaveEntitlement entitlement = LeaveEntitlement.of(employee.hireDate(), today());
        BigDecimal adjustmentDays = adjustments.findByEmployeeId(employee.id()).stream()
                .map(LeaveAdjustment::getDays)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        return LeaveBalance.of(entitlement, adjustmentDays, new ArrayList<>(active), entitlement.periodStart());
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

    /** The accounts that report to this manager, active or not: a departure still leaves a queue. */
    private List<UUID> reports(UUID managerId) {
        return employees.findAll().stream()
                .filter(employee -> managerId.equals(employee.managerId()))
                .map(EmployeeView::id)
                .toList();
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

    /**
     * The employees whose kinship this actor may read (D18/AC-15): HR reads every request, a manager
     * reads their <strong>direct</strong> reports and themselves, and everybody else — the CEO
     * included — reads only their own. The list scope itself stays BR-12's subtree; only the
     * bereavement kinship is narrowed, so a grand-manager sees the row without its sensitive field.
     */
    private Set<UUID> kinshipScope(EmployeeView actor, UUID actorId) {
        if (actor.isHr()) {
            return null;   // null means "every row"
        }
        Set<UUID> visible = new LinkedHashSet<>();
        visible.add(actorId);
        if (actor.isManager()) {
            // The same relation decide() uses: a departed report still has a direct manager, so that
            // manager keeps the kinship of the request they may still decide (I-1, re-review).
            visible.addAll(reports(actorId));
        }
        return visible;
    }

    private List<LeaveRequestResponse> responses(List<LeaveRequest> page, Set<UUID> visibleKinship) {
        Map<UUID, String> names = new HashMap<>();
        for (EmployeeView employee : employees.findAll()) {
            names.put(employee.id(), employee.displayName());
        }
        LocalDate today = today();
        List<LeaveRequestResponse> responses = new ArrayList<>(page.size());
        for (LeaveRequest request : page) {
            boolean kinshipVisible = visibleKinship == null
                    || visibleKinship.contains(request.getEmployeeId());
            responses.add(response(request,
                    names.get(request.getEmployeeId()),
                    request.getDecidedBy() == null ? null : names.get(request.getDecidedBy()),
                    request.getCancelledBy() == null ? null : names.get(request.getCancelledBy()),
                    kinshipVisible,
                    today));
        }
        return responses;
    }

    private LeaveRequestResponse response(LeaveRequest request, String employeeName, String decidedByName, LocalDate today) {
        return response(request, employeeName, decidedByName, null, true, today);
    }

    private LeaveRequestResponse response(LeaveRequest request,
                                          String employeeName,
                                          String decidedByName,
                                          String cancelledByName,
                                          boolean kinshipVisible,
                                          LocalDate today) {
        return new LeaveRequestResponse(
                request.getId(),
                request.getEmployeeId(),
                employeeName,
                request.getType().name(),
                kinshipVisible && request.getKinship() != null ? request.getKinship().name() : null,
                request.getStartDate(),
                request.getEndDate(),
                request.getHalfDay(),
                request.getBusinessDays(),
                request.getStatus().name(),
                request.getReason(),
                request.getDecidedBy(),
                decidedByName,
                request.getDecidedAt(),
                request.getDecisionNote(),
                request.getCreatedAt(),
                request.getStatus() == LeaveRequestStatus.APPROVED && !request.hasStarted(today),
                request.getCancelledAt(),
                request.getCancelledBy(),
                cancelledByName,
                request.isRetroactive());
    }

    private BusinessCalendar calendar() {
        return new BusinessCalendar(holidays.findAll().stream().map(PublicHoliday::getDay).toList());
    }

    /**
     * The frozen working-day count (BR-4, D15): a Decimal at one place. A half day on its single
     * working day is {@code 0.5}; a range with no working day is {@code 0} and the caller answers
     * {@link LeaveError#NO_WORKING_DAY}.
     */
    private BigDecimal businessDaysOf(LocalDate startDate, LocalDate endDate, HalfDay halfDay) {
        int workingDays = calendar().workingDays(startDate, endDate);
        if (workingDays == 0) {
            return LeaveBalance.zero();
        }
        if (halfDay != HalfDay.NONE) {
            return HALF_DAY_DAYS;
        }
        return BigDecimal.valueOf(workingDays).setScale(LeaveBalance.SCALE, RoundingMode.UNNECESSARY);
    }

    /** D16: a correction is a nonzero multiple of 0,5 — no finer unit exists. */
    private static boolean isHalfDayStep(BigDecimal days) {
        return days.remainder(ADJUSTMENT_STEP).signum() == 0;
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

    /**
     * BR-10/D19's type rules in the plan's fixed order: duration/one-day, kinship, school-age child,
     * birth date, birthday window, quota. Each step answers only for its own types, so the six
     * special types and the phase A pair share one path.
     */
    private static Optional<LeaveError> specialLeaveRefusal(LeaveType type,
                                                            LocalDate startDate,
                                                            LocalDate endDate,
                                                            BigDecimal businessDays,
                                                            Kinship kinship,
                                                            EmployeeView employee,
                                                            List<LeaveRequest> active) {
        if (type == null) {
            return Optional.empty();
        }
        return SpecialLeavePolicy.checkOneDay(type, startDate, endDate, businessDays)
                .or(() -> SpecialLeavePolicy.checkDuration(type, businessDays))
                .or(() -> SpecialLeavePolicy.checkKinship(type, kinship))
                .or(() -> SpecialLeavePolicy.checkSchoolAgeChild(type, employee.hasSchoolAgeChild()))
                .or(() -> SpecialLeavePolicy.checkBirthDate(type, employee.birthDate()))
                .or(() -> SpecialLeavePolicy.checkBirthdayWindow(type, employee.birthDate(), startDate))
                .or(() -> SpecialLeavePolicy.checkQuota(
                        type, startDate, businessDays, employee.birthDate(), active, null));
    }
}

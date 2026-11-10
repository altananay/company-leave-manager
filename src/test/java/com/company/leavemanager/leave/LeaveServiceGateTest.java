package com.company.leavemanager.leave;

import com.company.leavemanager.audit.api.AuditRecorder;
import com.company.leavemanager.identity.api.EmployeeDirectory;
import com.company.leavemanager.identity.api.EmployeeDirectory.EmployeeView;
import com.company.leavemanager.leave.internal.HalfDay;
import com.company.leavemanager.leave.internal.LeaveAdjustmentRepository;
import com.company.leavemanager.leave.internal.LeaveError;
import com.company.leavemanager.leave.internal.LeaveRepository;
import com.company.leavemanager.leave.internal.LeaveResult;
import com.company.leavemanager.leave.internal.LeaveService;
import com.company.leavemanager.leave.internal.PublicHolidayRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * L-11's independent gates: the role/scope checks live in the service, not only in the path rules of
 * {@code SecurityConfig}. Each test below drives the service directly and asserts the refusal — with
 * the repository untouched where the rule must answer before anything is loaded (L-22). Deleting a
 * service gate fails this class even though the HTTP matrix in {@link LeaveAuthorizationMatrixIT}
 * would still answer 403 from the path rule, and vice versa.
 */
class LeaveServiceGateTest {

    private static final UUID HR = UUID.randomUUID();
    private static final UUID CEO = UUID.randomUUID();
    private static final UUID MANAGER = UUID.randomUUID();
    private static final UUID OTHER_MANAGER = UUID.randomUUID();
    private static final UUID EMPLOYEE = UUID.randomUUID();
    private static final UUID STRANGER = UUID.randomUUID();

    private LeaveRepository requests;
    private LeaveAdjustmentRepository adjustments;
    private EmployeeDirectory employees;
    private LeaveService service;

    @BeforeEach
    void setUp() {
        requests = mock(LeaveRepository.class);
        adjustments = mock(LeaveAdjustmentRepository.class);
        employees = mock(EmployeeDirectory.class);
        service = new LeaveService(
                requests,
                adjustments,
                mock(PublicHolidayRepository.class),
                employees,
                mock(AuditRecorder.class),
                Clock.fixed(Instant.parse("2026-11-09T09:00:00Z"), ZoneOffset.UTC),
                mock(EntityManager.class));
        when(employees.find(HR)).thenReturn(Optional.of(view(HR, "HR", null)));
        when(employees.find(CEO)).thenReturn(Optional.of(view(CEO, "CEO", null)));
        when(employees.find(MANAGER)).thenReturn(Optional.of(view(MANAGER, "MANAGER", null)));
        when(employees.find(EMPLOYEE)).thenReturn(Optional.of(view(EMPLOYEE, "EMPLOYEE", MANAGER)));
        when(employees.find(STRANGER)).thenReturn(Optional.of(view(STRANGER, "EMPLOYEE", OTHER_MANAGER)));
        when(employees.findAll()).thenReturn(List.of(
                view(MANAGER, "MANAGER", null),
                view(EMPLOYEE, "EMPLOYEE", MANAGER),
                view(STRANGER, "EMPLOYEE", OTHER_MANAGER)));
    }

    @Test
    void shouldRefuseTheQueueToAnEmployeeBeforeReadingIt() {
        LeaveResult<?> result = service.queue(EMPLOYEE);

        assertThat(result.error()).isEqualTo(LeaveError.NOT_AUTHORIZED);
        assertThat(result.value()).isNull();
        verifyNoInteractions(requests);
    }

    @Test
    void shouldRefuseTheQueueToHr() {
        assertThat(service.queue(HR).error()).isEqualTo(LeaveError.NOT_AUTHORIZED);
        verifyNoInteractions(requests);
    }

    @Test
    void shouldRefuseAnAdjustmentFromANonHrActorBeforeWritingAnything() {
        LeaveResult<?> manager = service.adjust(MANAGER, EMPLOYEE, new BigDecimal("1"), "düzeltme");
        LeaveResult<?> ceo = service.adjust(CEO, EMPLOYEE, new BigDecimal("1"), "düzeltme");

        assertThat(manager.error()).isEqualTo(LeaveError.NOT_AUTHORIZED);
        assertThat(ceo.error()).isEqualTo(LeaveError.NOT_AUTHORIZED);
        verifyNoInteractions(adjustments);
    }

    @Test
    void shouldRefuseHrAndEmployeeDecisionsBeforeLoadingTheRequest() {
        UUID requestId = UUID.randomUUID();

        assertThat(service.approve(HR, requestId, null).error()).isEqualTo(LeaveError.NOT_MANAGER);
        assertThat(service.approve(CEO, requestId, null).error()).isEqualTo(LeaveError.NOT_MANAGER);
        assertThat(service.approve(EMPLOYEE, requestId, null).error()).isEqualTo(LeaveError.NOT_MANAGER);
        assertThat(service.reject(EMPLOYEE, requestId, "x").error()).isEqualTo(LeaveError.NOT_MANAGER);
        verify(requests, never()).findById(any(UUID.class));
        verify(requests, never()).findByIdAndEmployeeIdIn(any(UUID.class), any());
    }

    @Test
    void shouldLoadAManagersDecisionOnlyThroughTheScopedQuery() {
        UUID requestId = UUID.randomUUID();
        when(requests.findByIdAndEmployeeIdIn(requestId, List.of(EMPLOYEE))).thenReturn(Optional.empty());

        LeaveResult<?> result = service.approve(MANAGER, requestId, null);

        assertThat(result.error()).isEqualTo(LeaveError.NOT_FOUND);
        verify(requests).findByIdAndEmployeeIdIn(requestId, List.of(EMPLOYEE));
        // The unscoped read is the thing L-22 removed; it must never come back.
        verify(requests, never()).findById(any(UUID.class));
    }

    @Test
    void shouldRefuseCreatingForSomeoneElseUnlessTheActorIsHr() {
        LocalDate monday = LocalDate.of(2026, 11, 16);

        LeaveResult<?> result = service.create(EMPLOYEE, STRANGER, com.company.leavemanager.leave.internal.LeaveType.ANNUAL,
                monday, monday, HalfDay.NONE, null, "izin");

        assertThat(result.error()).isEqualTo(LeaveError.NOT_AUTHORIZED);
        verifyNoInteractions(requests);
    }

    @Test
    void shouldLoadACancellationOnlyThroughTheOwnersQuery() {
        UUID requestId = UUID.randomUUID();
        when(requests.findByIdAndEmployeeId(requestId, EMPLOYEE)).thenReturn(Optional.empty());

        LeaveResult<?> result = service.cancel(EMPLOYEE, requestId);

        assertThat(result.error()).isEqualTo(LeaveError.NOT_FOUND);
        verify(requests).findByIdAndEmployeeId(requestId, EMPLOYEE);
        verify(requests, never()).findById(any(UUID.class));
    }

    @Test
    void shouldAnswerNotFoundForABalanceOutsideTheCallersScope() {
        LeaveResult<?> result = service.balance(EMPLOYEE, STRANGER);

        // The employee and the stranger share a manager, but scope is self + a manager's subtree:
        // a peer is not in it, and the refusal does not confirm that the account exists.
        assertThat(result.error()).isEqualTo(LeaveError.NOT_FOUND);
    }

    private static EmployeeView view(UUID id, String role, UUID managerId) {
        return new EmployeeView(id, id + "@acme.test", "Person " + id, role, managerId,
                LocalDate.of(2020, 3, 15), null, false, true);
    }
}

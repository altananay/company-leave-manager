package com.company.leavemanager.leave;

import com.company.leavemanager.leave.internal.HalfDay;
import com.company.leavemanager.leave.internal.LeaveRequest;
import com.company.leavemanager.leave.internal.LeaveRequestStatus;
import com.company.leavemanager.leave.internal.LeaveType;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** BR-8: the state machine refuses every transition the lifecycle does not allow. */
class LeaveRequestTest {

    private static final LocalDate START = LocalDate.of(2026, 11, 16);
    private static final UUID MANAGER = UUID.randomUUID();

    @Test
    void shouldCreateAPendingRequest() {
        LeaveRequest request = request();

        assertThat(request.getStatus()).isEqualTo(LeaveRequestStatus.PENDING);
        assertThat(request.getDecidedBy()).isNull();
        assertThat(request.getHalfDay()).isEqualTo(HalfDay.NONE);
        assertThat(request.getBusinessDays()).isEqualByComparingTo("3");
    }

    @Test
    void shouldApproveAPendingRequest() {
        LeaveRequest request = request();
        Instant now = Instant.parse("2026-11-09T08:00:00Z");

        request.approve(MANAGER, "uygun", now);

        assertThat(request.getStatus()).isEqualTo(LeaveRequestStatus.APPROVED);
        assertThat(request.getDecidedBy()).isEqualTo(MANAGER);
        assertThat(request.getDecidedAt()).isEqualTo(now);
        assertThat(request.getDecisionNote()).isEqualTo("uygun");
    }

    @Test
    void shouldRejectAPendingRequest() {
        LeaveRequest request = request();

        request.reject(MANAGER, "dönem yoğun", Instant.now());

        assertThat(request.getStatus()).isEqualTo(LeaveRequestStatus.REJECTED);
        assertThat(request.getDecisionNote()).isEqualTo("dönem yoğun");
    }

    @Test
    void shouldCancelAnApprovedRequestWithoutOverwritingTheDecision() {
        LeaveRequest request = request();
        Instant decidedAt = Instant.parse("2026-11-01T08:00:00Z");
        Instant cancelledAt = Instant.parse("2026-11-02T09:00:00Z");
        UUID employee = UUID.randomUUID();
        request.approve(MANAGER, "uygun", decidedAt);

        request.cancel(employee, cancelledAt);

        assertThat(request.getStatus()).isEqualTo(LeaveRequestStatus.CANCELLED);
        // L-17: the withdrawal is its own record; the manager's decision stays readable.
        assertThat(request.getCancelledBy()).isEqualTo(employee);
        assertThat(request.getCancelledAt()).isEqualTo(cancelledAt);
        assertThat(request.getDecidedBy()).isEqualTo(MANAGER);
        assertThat(request.getDecidedAt()).isEqualTo(decidedAt);
    }

    @Test
    void shouldRefuseToCancelAPendingRequest() {
        LeaveRequest request = request();

        assertThatThrownBy(() -> request.cancel(MANAGER, Instant.now()))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void shouldCarryTheRetroactiveMarker() {
        LeaveRequest ordinary = request();
        LeaveRequest retroactive = LeaveRequest.create(UUID.randomUUID(), LeaveType.ANNUAL, START,
                START.plusDays(2), HalfDay.NONE, new BigDecimal("3"), null, "geçmiş kayıt", true, Instant.now());

        assertThat(ordinary.isRetroactive()).isFalse();
        assertThat(retroactive.isRetroactive()).isTrue();
    }

    @Test
    void shouldRefuseToDecideAnAlreadyDecidedRequest() {
        LeaveRequest request = request();
        request.approve(MANAGER, null, Instant.now());

        assertThatThrownBy(() -> request.approve(MANAGER, null, Instant.now()))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> request.reject(MANAGER, "geç", Instant.now()))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void shouldDetectOverlappingRanges() {
        LeaveRequest request = request();

        // Endpoints are inclusive: a request that ends the day before another starts does not
        // overlap it, but one that ends where it starts does.
        assertThat(request.overlaps(START.minusDays(5), START.minusDays(1))).isFalse();
        assertThat(request.overlaps(START.minusDays(5), START)).isTrue();
        assertThat(request.overlaps(START, START)).isTrue();
        assertThat(request.overlaps(START.plusDays(2), START.plusDays(6))).isTrue();
        assertThat(request.overlaps(START.minusDays(5), START.plusDays(6))).isTrue();
        assertThat(request.overlaps(START.plusDays(3), START.plusDays(6))).isFalse();
    }

    @Test
    void shouldReportWhetherTheRequestHasStarted() {
        LeaveRequest request = request();

        assertThat(request.hasStarted(START.minusDays(1))).isFalse();
        assertThat(request.hasStarted(START)).isTrue();
        assertThat(request.hasStarted(START.plusDays(1))).isTrue();
    }

    private static LeaveRequest request() {
        return LeaveRequest.create(UUID.randomUUID(), LeaveType.ANNUAL, START, START.plusDays(2),
                HalfDay.NONE, new BigDecimal("3"), null, "aile ziyareti", Instant.parse("2026-11-08T08:00:00Z"));
    }
}

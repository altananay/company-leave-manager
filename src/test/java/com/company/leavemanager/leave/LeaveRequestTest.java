package com.company.leavemanager.leave;

import com.company.leavemanager.leave.internal.LeaveRequest;
import com.company.leavemanager.leave.internal.LeaveRequestStatus;
import com.company.leavemanager.leave.internal.LeaveType;
import org.junit.jupiter.api.Test;

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
    void shouldCancelAnApprovedRequest() {
        LeaveRequest request = request();
        request.approve(MANAGER, null, Instant.now());

        request.cancel(Instant.now());

        assertThat(request.getStatus()).isEqualTo(LeaveRequestStatus.CANCELLED);
    }

    @Test
    void shouldRefuseToCancelAPendingRequest() {
        LeaveRequest request = request();

        assertThatThrownBy(() -> request.cancel(Instant.now()))
                .isInstanceOf(IllegalStateException.class);
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
                3, "aile ziyareti", Instant.parse("2026-11-08T08:00:00Z"));
    }
}

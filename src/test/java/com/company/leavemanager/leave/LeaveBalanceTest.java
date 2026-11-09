package com.company.leavemanager.leave;

import com.company.leavemanager.leave.internal.LeaveBalance;
import com.company.leavemanager.leave.internal.LeaveEntitlement;
import com.company.leavemanager.leave.internal.LeaveRequest;
import com.company.leavemanager.leave.internal.LeaveType;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** BR-5, BR-8 and BR-9 at the balance: approved and pending annual days subtract, nothing else does. */
class LeaveBalanceTest {

    private static final LocalDate START = LocalDate.of(2026, 11, 16);
    private static final LeaveEntitlement ENTITLEMENT = LeaveEntitlement.of(LocalDate.of(2020, 3, 15), START);

    @Test
    void shouldAddEntitlementCarryoverAndAdjustments() {
        LeaveBalance balance = LeaveBalance.of(ENTITLEMENT, 3, List.of());

        assertThat(balance.entitlement()).isEqualTo(ENTITLEMENT.currentPeriodDays());
        assertThat(balance.carryover()).isEqualTo(ENTITLEMENT.carryoverDays());
        assertThat(balance.adjustments()).isEqualTo(3);
        assertThat(balance.remaining()).isEqualTo(ENTITLEMENT.totalDays() + 3);
    }

    @Test
    void shouldSubtractApprovedAndPendingAnnualDays() {
        LeaveRequest approved = request(LeaveType.ANNUAL, 3);
        approved.approve(UUID.randomUUID(), null, Instant.now());
        LeaveRequest pending = request(LeaveType.ANNUAL, 2);

        LeaveBalance balance = LeaveBalance.of(ENTITLEMENT, 0, List.of(approved, pending));

        assertThat(balance.approved()).isEqualTo(3);
        assertThat(balance.pending()).isEqualTo(2);
        assertThat(balance.remaining()).isEqualTo(ENTITLEMENT.totalDays() - 5);
    }

    @Test
    void shouldIgnoreExcuseLeave() {
        // BR-9: only annual leave consumes the balance.
        LeaveRequest excuse = request(LeaveType.EXCUSE, 4);
        excuse.approve(UUID.randomUUID(), null, Instant.now());

        LeaveBalance balance = LeaveBalance.of(ENTITLEMENT, 0, List.of(excuse));

        assertThat(balance.approved()).isZero();
        assertThat(balance.remaining()).isEqualTo(ENTITLEMENT.totalDays());
    }

    @Test
    void shouldIgnoreRejectedAndCancelledRequests() {
        LeaveRequest rejected = request(LeaveType.ANNUAL, 4);
        rejected.reject(UUID.randomUUID(), "yoğunluk", Instant.now());
        LeaveRequest approvedThenCancelled = request(LeaveType.ANNUAL, 3);
        approvedThenCancelled.approve(UUID.randomUUID(), null, Instant.now());
        approvedThenCancelled.cancel(Instant.now());

        LeaveBalance balance = LeaveBalance.of(ENTITLEMENT, 0, List.of(rejected, approvedThenCancelled));

        assertThat(balance.approved()).isZero();
        assertThat(balance.pending()).isZero();
        assertThat(balance.remaining()).isEqualTo(ENTITLEMENT.totalDays());
    }

    @Test
    void shouldSubtractANegativeAdjustment() {
        LeaveBalance balance = LeaveBalance.of(ENTITLEMENT, -5, List.of());

        assertThat(balance.remaining()).isEqualTo(ENTITLEMENT.totalDays() - 5);
    }

    private static LeaveRequest request(LeaveType type, int businessDays) {
        return LeaveRequest.create(UUID.randomUUID(), type, START, START.plusDays(businessDays - 1L),
                businessDays, null, Instant.now());
    }
}

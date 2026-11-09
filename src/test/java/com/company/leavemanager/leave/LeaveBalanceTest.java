package com.company.leavemanager.leave;

import com.company.leavemanager.leave.internal.HalfDay;
import com.company.leavemanager.leave.internal.LeaveBalance;
import com.company.leavemanager.leave.internal.LeaveEntitlement;
import com.company.leavemanager.leave.internal.LeaveRequest;
import com.company.leavemanager.leave.internal.LeaveType;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * BR-5, BR-8 and BR-9 at the balance: approved and pending annual days subtract, nothing else does.
 *
 * <p>Phase B1 (D16) moves every amount to the decimal day unit; the assertions compare by value
 * ({@code isEqualByComparingTo}), because {@code 14} and {@code 14.0} are the same number of days
 * even though {@link BigDecimal#equals(Object)} says otherwise.
 */
class LeaveBalanceTest {

    private static final LocalDate START = LocalDate.of(2026, 11, 16);
    private static final LeaveEntitlement ENTITLEMENT = LeaveEntitlement.of(LocalDate.of(2020, 3, 15), START);

    @Test
    void shouldAddEntitlementCarryoverAndAdjustments() {
        LeaveBalance balance = LeaveBalance.of(ENTITLEMENT, new BigDecimal("3"), List.of());

        assertThat(balance.entitlement()).isEqualByComparingTo(days(ENTITLEMENT.currentPeriodDays()));
        assertThat(balance.carryover()).isEqualByComparingTo(days(ENTITLEMENT.carryoverDays()));
        assertThat(balance.adjustments()).isEqualByComparingTo("3");
        assertThat(balance.remaining()).isEqualByComparingTo(days(ENTITLEMENT.totalDays() + 3));
    }

    @Test
    void shouldSubtractApprovedAndPendingAnnualDays() {
        LeaveRequest approved = request(LeaveType.ANNUAL, "3");
        approved.approve(UUID.randomUUID(), null, Instant.now());
        LeaveRequest pending = request(LeaveType.ANNUAL, "2");

        LeaveBalance balance = LeaveBalance.of(ENTITLEMENT, BigDecimal.ZERO, List.of(approved, pending));

        assertThat(balance.approved()).isEqualByComparingTo("3");
        assertThat(balance.pending()).isEqualByComparingTo("2");
        assertThat(balance.remaining()).isEqualByComparingTo(days(ENTITLEMENT.totalDays() - 5));
    }

    @Test
    void shouldSubtractHalfADayFromTheBalance() {
        // D15/D16: a half-day request is 0,5 whether it is already approved or still pending.
        LeaveRequest approvedHalf = request(LeaveType.ANNUAL, "0.5", HalfDay.AM);
        approvedHalf.approve(UUID.randomUUID(), null, Instant.now());
        LeaveRequest pendingHalf = request(LeaveType.ANNUAL, "0.5", HalfDay.PM);

        LeaveBalance balance = LeaveBalance.of(ENTITLEMENT, BigDecimal.ZERO,
                List.of(approvedHalf, pendingHalf));

        assertThat(balance.approved()).isEqualByComparingTo("0.5");
        assertThat(balance.pending()).isEqualByComparingTo("0.5");
        assertThat(balance.remaining()).isEqualByComparingTo(days(ENTITLEMENT.totalDays() - 1));
        // The unit stays one decimal place; no binary floating point sneaks in.
        assertThat(balance.remaining().scale()).isEqualTo(1);
    }

    @Test
    void shouldSubtractAFractionalEarlierUsageFromTheNetCarryover() {
        // L-19's net carryover with the decimal unit: half a day taken in 2025 is half a day less
        // carried over, and it is not offered a second time.
        LeaveRequest earlier = LeaveRequest.create(UUID.randomUUID(), LeaveType.ANNUAL,
                LocalDate.of(2025, 6, 2), LocalDate.of(2025, 6, 2), HalfDay.AM,
                new BigDecimal("0.5"), null, null, Instant.now());
        earlier.approve(UUID.randomUUID(), null, Instant.now());

        LeaveBalance balance = LeaveBalance.of(ENTITLEMENT, BigDecimal.ZERO, List.of(earlier));

        assertThat(balance.carryover()).isEqualByComparingTo(new BigDecimal(ENTITLEMENT.carryoverDays())
                .subtract(new BigDecimal("0.5")));
        assertThat(balance.approved()).isZero();
        assertThat(balance.remaining()).isEqualByComparingTo(
                new BigDecimal(ENTITLEMENT.currentPeriodDays()).add(balance.carryover()));
    }

    @Test
    void shouldAddAHalfDayAdjustment() {
        // D16: HR corrects the balance in half days too.
        LeaveBalance balance = LeaveBalance.of(ENTITLEMENT, new BigDecimal("0.5"), List.of());

        assertThat(balance.adjustments()).isEqualByComparingTo("0.5");
        assertThat(balance.remaining()).isEqualByComparingTo(
                new BigDecimal(ENTITLEMENT.totalDays()).add(new BigDecimal("0.5")));
    }

    @Test
    void shouldRefuseAFinerUnitThanADayTenth() {
        // Exactly one decimal place is the contract (D16); a constructor may not silently round.
        assertThatThrownBy(() -> new LeaveBalance(
                new BigDecimal("14"), BigDecimal.ZERO, new BigDecimal("0.25"),
                BigDecimal.ZERO, BigDecimal.ZERO))
                .isInstanceOf(ArithmeticException.class);
    }

    @Test
    void shouldIgnoreExcuseLeave() {
        // BR-9: only annual leave consumes the balance.
        LeaveRequest excuse = request(LeaveType.EXCUSE, "4");
        excuse.approve(UUID.randomUUID(), null, Instant.now());

        LeaveBalance balance = LeaveBalance.of(ENTITLEMENT, BigDecimal.ZERO, List.of(excuse));

        assertThat(balance.approved()).isZero();
        assertThat(balance.remaining()).isEqualByComparingTo(days(ENTITLEMENT.totalDays()));
    }

    @Test
    void shouldIgnoreRejectedAndCancelledRequests() {
        LeaveRequest rejected = request(LeaveType.ANNUAL, "4");
        rejected.reject(UUID.randomUUID(), "yoğunluk", Instant.now());
        LeaveRequest approvedThenCancelled = request(LeaveType.ANNUAL, "3");
        approvedThenCancelled.approve(UUID.randomUUID(), null, Instant.now());
        approvedThenCancelled.cancel(UUID.randomUUID(), Instant.now());

        LeaveBalance balance = LeaveBalance.of(ENTITLEMENT, BigDecimal.ZERO,
                List.of(rejected, approvedThenCancelled));

        assertThat(balance.approved()).isZero();
        assertThat(balance.pending()).isZero();
        assertThat(balance.remaining()).isEqualByComparingTo(days(ENTITLEMENT.totalDays()));
    }

    @Test
    void shouldCarryOverOnlyWhatWasNotUsedInTheEarlierPeriods() {
        // L-19: the gross entitlement before the current period is 76; five of those days were taken
        // in 2025. The net carryover is 71, and the day is not offered a second time.
        LeaveRequest earlier = LeaveRequest.create(UUID.randomUUID(), LeaveType.ANNUAL,
                LocalDate.of(2025, 6, 2), LocalDate.of(2025, 6, 6), HalfDay.NONE,
                new BigDecimal("5"), null, null, Instant.now());
        earlier.approve(UUID.randomUUID(), null, Instant.now());

        LeaveBalance balance = LeaveBalance.of(ENTITLEMENT, BigDecimal.ZERO, List.of(earlier));

        assertThat(ENTITLEMENT.carryoverDays()).isEqualTo(76);
        assertThat(balance.carryover()).isEqualByComparingTo("71");
        assertThat(balance.approved()).isZero();
        assertThat(balance.remaining()).isEqualByComparingTo(days(ENTITLEMENT.currentPeriodDays() + 71));
    }

    @Test
    void shouldCountAnEarlierPendingDayAgainstTheCarryoverToo() {
        // A pending request in an earlier period already holds its day: approving it later must not
        // free a second one, so the net carryover reserves it now.
        LeaveRequest earlierPending = LeaveRequest.create(UUID.randomUUID(), LeaveType.ANNUAL,
                LocalDate.of(2025, 6, 2), LocalDate.of(2025, 6, 3), HalfDay.NONE,
                new BigDecimal("2"), null, null, Instant.now());

        LeaveBalance balance = LeaveBalance.of(ENTITLEMENT, BigDecimal.ZERO, List.of(earlierPending));

        assertThat(balance.carryover()).isEqualByComparingTo("74");
        assertThat(balance.pending()).isZero();
        assertThat(balance.remaining()).isEqualByComparingTo(days(ENTITLEMENT.totalDays() - 2));
    }

    @Test
    void shouldSubtractANegativeAdjustment() {
        LeaveBalance balance = LeaveBalance.of(ENTITLEMENT, new BigDecimal("-5"), List.of());

        assertThat(balance.remaining()).isEqualByComparingTo(days(ENTITLEMENT.totalDays() - 5));
    }

    private static BigDecimal days(long value) {
        return BigDecimal.valueOf(value);
    }

    private static LeaveRequest request(LeaveType type, String businessDays) {
        return request(type, businessDays, HalfDay.NONE);
    }

    private static LeaveRequest request(LeaveType type, String businessDays, HalfDay halfDay) {
        // The balance only reads the start date; the end date is irrelevant to these assertions.
        return LeaveRequest.create(UUID.randomUUID(), type, START, START, halfDay,
                new BigDecimal(businessDays), null, null, Instant.now());
    }
}

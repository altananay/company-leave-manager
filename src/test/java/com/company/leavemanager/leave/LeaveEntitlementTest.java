package com.company.leavemanager.leave;

import com.company.leavemanager.leave.internal.LeaveEntitlement;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

/** BR-1 (14/20/26 by seniority), BR-2 (anniversary period) and BR-3 (full carryover). */
class LeaveEntitlementTest {

    private static final LocalDate HIRE = LocalDate.of(2020, 3, 15);

    @Test
    void shouldNotGrantEntitlementBeforeTheFirstYear() {
        // BR-2: the first entitlement needs one full year of actual work.
        LeaveEntitlement entitlement = LeaveEntitlement.of(HIRE, LocalDate.of(2021, 3, 14));

        assertThat(entitlement.currentPeriodDays()).isZero();
        assertThat(entitlement.carryoverDays()).isZero();
        assertThat(entitlement.completedYears()).isZero();
        assertThat(entitlement.periodStart()).isEqualTo(LocalDate.of(2021, 3, 15));
        assertThat(entitlement.defaulted()).isFalse();
    }

    @Test
    void shouldStartTheFirstPeriodOnTheFirstAnniversary() {
        LeaveEntitlement entitlement = LeaveEntitlement.of(HIRE, LocalDate.of(2021, 3, 15));

        assertThat(entitlement.currentPeriodDays()).isEqualTo(14);
        assertThat(entitlement.periodStart()).isEqualTo(LocalDate.of(2021, 3, 15));
        assertThat(entitlement.periodEnd()).isEqualTo(LocalDate.of(2022, 3, 15));
    }

    @Test
    void shouldUseThe14DayTierUntilTheFifthAnniversary() {
        // 14 March 2025 is one day before the fifth anniversary: still the 1–5 year tier.
        LeaveEntitlement entitlement = LeaveEntitlement.of(HIRE, LocalDate.of(2025, 3, 14));

        assertThat(entitlement.completedYears()).isEqualTo(4);
        assertThat(entitlement.currentPeriodDays()).isEqualTo(14);
    }

    @Test
    void shouldUseThe20DayTierFromTheFifthAnniversary() {
        LeaveEntitlement entitlement = LeaveEntitlement.of(HIRE, LocalDate.of(2025, 3, 15));

        assertThat(entitlement.completedYears()).isEqualTo(5);
        assertThat(entitlement.currentPeriodDays()).isEqualTo(20);
    }

    @Test
    void shouldUseThe26DayTierFromTheFifteenthAnniversary() {
        LeaveEntitlement entitlement = LeaveEntitlement.of(HIRE, LocalDate.of(2035, 3, 15));

        assertThat(entitlement.completedYears()).isEqualTo(15);
        assertThat(entitlement.currentPeriodDays()).isEqualTo(26);
    }

    @Test
    void shouldCarryOverEveryDayOfTheEarlierPeriodsWithNoCap() {
        // Six completed years: four 14-day periods and one 20-day period are all still available.
        LeaveEntitlement entitlement = LeaveEntitlement.of(HIRE, LocalDate.of(2026, 3, 15));

        assertThat(entitlement.currentPeriodDays()).isEqualTo(20);
        assertThat(entitlement.carryoverDays()).isEqualTo(14 + 14 + 14 + 14 + 20);
        assertThat(entitlement.totalDays()).isEqualTo(20 + 76);
    }

    @Test
    void shouldGrantNoEntitlementWhenTheHireDateIsUnknown() {
        // L-05 (rule change): an account without a hire date has no known seniority, and the rule is
        // not to invent one. Annual leave is refused with LEAVE_NO_HIRE_DATE until HR fills the date.
        LeaveEntitlement entitlement = LeaveEntitlement.of(null, LocalDate.of(2026, 11, 9));

        assertThat(entitlement.currentPeriodDays()).isZero();
        assertThat(entitlement.carryoverDays()).isZero();
        assertThat(entitlement.defaulted()).isTrue();
        assertThat(entitlement.totalDays()).isZero();
        assertThat(entitlement.periodStart()).isNull();
        assertThat(entitlement.periodEnd()).isNull();
    }

    @Test
    void shouldPlaceTheCurrentPeriodOnTheLatestAnniversary() {
        LeaveEntitlement entitlement = LeaveEntitlement.of(HIRE, LocalDate.of(2026, 11, 9));

        assertThat(entitlement.periodStart()).isEqualTo(LocalDate.of(2026, 3, 15));
        assertThat(entitlement.periodEnd()).isEqualTo(LocalDate.of(2027, 3, 15));
    }

    @Test
    void shouldMapEveryTierBoundary() {
        assertThat(LeaveEntitlement.daysForYears(0)).isZero();
        assertThat(LeaveEntitlement.daysForYears(1)).isEqualTo(14);
        assertThat(LeaveEntitlement.daysForYears(4)).isEqualTo(14);
        assertThat(LeaveEntitlement.daysForYears(5)).isEqualTo(20);
        assertThat(LeaveEntitlement.daysForYears(14)).isEqualTo(20);
        assertThat(LeaveEntitlement.daysForYears(15)).isEqualTo(26);
        assertThat(LeaveEntitlement.daysForYears(40)).isEqualTo(26);
    }
}

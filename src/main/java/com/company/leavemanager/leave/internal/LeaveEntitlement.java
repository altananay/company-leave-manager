package com.company.leavemanager.leave.internal;

import java.time.LocalDate;

/**
 * Annual-leave entitlement by seniority (BR-1), the entitlement period (BR-2) and full carryover
 * (BR-3).
 *
 * <p>The model is cumulative, as {@code docs/domain.md} defines the balance ("Dönemsel değil,
 * kümülatif"): every completed service year adds that year's entitlement, and nothing expires. The
 * current period is the 12 months that started on the latest hire anniversary; the periods before it
 * are the carryover. So the arithmetic is exactly
 * {@code dönem hakkı + devir + düzeltmeler − onaylı − bekleyen}.
 *
 * <p>An account without a hire date (every account V2 created) cannot know its seniority: the plan's
 * risk decision is the 1–5 year default of 14 days, flagged so the screen can say so.
 */
public record LeaveEntitlement(
        int currentPeriodDays,
        int carryoverDays,
        LocalDate periodStart,
        LocalDate periodEnd,
        long completedYears,
        boolean defaulted) {

    /** The 1–5 year tier: also the documented default while the hire date is unknown. */
    public static final int DEFAULT_DAYS = 14;

    public static LeaveEntitlement of(LocalDate hireDate, LocalDate today) {
        if (hireDate == null) {
            return new LeaveEntitlement(DEFAULT_DAYS, 0, null, null, 0, true);
        }
        long years = completedYears(hireDate, today);
        LocalDate periodStart = hireDate.plusYears(years);
        LocalDate periodEnd = periodStart.plusYears(1);
        if (years < 1) {
            // BR-2: the first entitlement needs a full year of actual work. Until then the balance is
            // zero and the screen shows the period that will start.
            return new LeaveEntitlement(0, 0, hireDate.plusYears(1), hireDate.plusYears(2), 0, false);
        }
        int carryover = 0;
        for (long year = 1; year < years; year++) {
            carryover += daysForYears(year);
        }
        return new LeaveEntitlement(daysForYears(years), carryover, periodStart, periodEnd, years, false);
    }

    /** BR-1: 1–5 years 14, 5–15 years 20, 15 years and over 26 business days. */
    public static int daysForYears(long years) {
        if (years >= 15) {
            return 26;
        }
        if (years >= 5) {
            return 20;
        }
        if (years >= 1) {
            return 14;
        }
        return 0;
    }

    /** Completed service years: the anniversary is reached, not approximated. */
    public static long completedYears(LocalDate hireDate, LocalDate today) {
        if (today.isBefore(hireDate)) {
            return 0;
        }
        return java.time.temporal.ChronoUnit.YEARS.between(hireDate, today);
    }

    public int totalDays() {
        return currentPeriodDays + carryoverDays;
    }
}

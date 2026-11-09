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
 * <p>An account without a hire date knows no seniority, and the rule is not to guess: its
 * entitlement is <strong>zero</strong> and an annual request is refused with
 * {@code LEAVE_NO_HIRE_DATE} (spec 0004 review round 1, L-05 — the earlier 14-day default was a
 * deliberate rule change). {@code defaulted} tells the screen which state it is showing.
 */
public record LeaveEntitlement(
        int currentPeriodDays,
        int carryoverDays,
        LocalDate periodStart,
        LocalDate periodEnd,
        long completedYears,
        boolean defaulted) {

    public static LeaveEntitlement of(LocalDate hireDate, LocalDate today) {
        if (hireDate == null) {
            // No hire date, no seniority, no entitlement. The screen shows the state and HR fills
            // the date in (one account at a time, no bulk migration).
            return new LeaveEntitlement(0, 0, null, null, 0, true);
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

    /** The gross entitlement of every period: what the employee earned, before any usage. */
    public int totalDays() {
        return currentPeriodDays + carryoverDays;
    }
}

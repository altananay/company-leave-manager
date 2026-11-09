package com.company.leavemanager.leave.api.dto;

import java.time.LocalDate;

/**
 * The balance of one employee (AC-3): current-period entitlement, carryover, HR adjustments, annual
 * days approved and pending, and what remains. {@code entitlementDefaulted} is true while the hire
 * date is unknown, so the screen can show the documented warning instead of a silent 14 days.
 */
public record BalanceResponse(
        int entitlement,
        int carryover,
        int adjustments,
        int approved,
        int pending,
        int remaining,
        LocalDate periodStart,
        LocalDate periodEnd,
        LocalDate hireDate,
        boolean entitlementDefaulted,
        long completedYears,
        boolean hasManager,
        String managerName) {
}

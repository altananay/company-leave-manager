package com.company.leavemanager.leave.api.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * The balance of one employee (AC-3): current-period entitlement, carryover, HR adjustments, annual
 * days approved and pending, and what remains. Every day amount is the decimal unit (D16) so a
 * {@code 0.5}-day request is visible in the numbers. {@code entitlementDefaulted} is true while the
 * hire date is unknown, so the screen can show the documented warning instead of a silent 14 days.
 */
public record BalanceResponse(
        BigDecimal entitlement,
        BigDecimal carryover,
        BigDecimal adjustments,
        BigDecimal approved,
        BigDecimal pending,
        BigDecimal remaining,
        LocalDate periodStart,
        LocalDate periodEnd,
        LocalDate hireDate,
        boolean entitlementDefaulted,
        long completedYears,
        boolean hasManager,
        String managerName) {
}

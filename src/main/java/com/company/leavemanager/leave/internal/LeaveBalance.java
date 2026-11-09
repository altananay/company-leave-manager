package com.company.leavemanager.leave.internal;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;

/**
 * The balance of one employee (BR-5, BR-9): the entitlement plus carryover plus HR adjustments
 * minus the annual days already approved and the annual days still pending.
 *
 * <p>Only {@link LeaveType#ANNUAL} takes part: an excuse request is recorded but never moves a day
 * (BR-9). A rejected or cancelled request is not active, so it never takes part either (BR-8).
 *
 * <p>The carryover is <strong>net</strong> (spec 0004 review round 1, L-19): the entitlement of the
 * periods before the current one minus the annual days already used there. A day consumed in an
 * earlier period cannot be offered again, and a day never consumed stays available with no cap
 * (BR-3). "Used" is dated by the request's start date; a request that spans the period boundary
 * belongs to the period it starts in, which is how the leave was taken.
 *
 * <p>Every amount is a {@link BigDecimal} at <strong>one decimal place</strong> (D16, phase B1): a
 * half day is {@code 0.5}, and the arithmetic is exact — no floating point, no rounding in the
 * middle. The entitlement itself stays an integer (BR-1's 14/20/26 tiers); it is converted to the
 * decimal unit here, at the balance boundary, so there is still exactly one unit everywhere.
 *
 * <p>{@code approved} and {@code pending} are the current period's days: the earlier period's usage
 * is already reflected in the net carryover, so counting it again here would subtract it twice.
 */
public record LeaveBalance(
        BigDecimal entitlement,
        BigDecimal carryover,
        BigDecimal adjustments,
        BigDecimal approved,
        BigDecimal pending) {

    /** The one decimal place every day amount carries (D16). */
    static final int SCALE = 1;

    public LeaveBalance {
        entitlement = scale(entitlement);
        carryover = scale(carryover);
        adjustments = scale(adjustments);
        approved = scale(approved);
        pending = scale(pending);
    }

    public BigDecimal remaining() {
        return entitlement.add(carryover).add(adjustments).subtract(approved).subtract(pending);
    }

    public static LeaveBalance of(LeaveEntitlement entitlement, BigDecimal adjustments, List<LeaveRequest> requests) {
        return of(entitlement, adjustments, requests, entitlement.periodStart());
    }

    public static LeaveBalance of(LeaveEntitlement entitlement,
                                  BigDecimal adjustments,
                                  List<LeaveRequest> requests,
                                  LocalDate periodStart) {
        BigDecimal approved = zero();
        BigDecimal pending = zero();
        BigDecimal usedBefore = zero();
        for (LeaveRequest request : requests) {
            if (!request.getType().consumesBalance()) {
                continue;
            }
            boolean beforePeriod = periodStart != null && request.getStartDate().isBefore(periodStart);
            switch (request.getStatus()) {
                case APPROVED -> {
                    if (beforePeriod) {
                        usedBefore = usedBefore.add(request.getBusinessDays());
                    } else {
                        approved = approved.add(request.getBusinessDays());
                    }
                }
                case PENDING -> {
                    if (beforePeriod) {
                        usedBefore = usedBefore.add(request.getBusinessDays());
                    } else {
                        pending = pending.add(request.getBusinessDays());
                    }
                }
                default -> {
                    // REJECTED and CANCELLED never count (BR-8).
                }
            }
        }
        return new LeaveBalance(
                BigDecimal.valueOf(entitlement.currentPeriodDays()),
                BigDecimal.valueOf(entitlement.carryoverDays()).subtract(usedBefore),
                adjustments,
                approved,
                pending);
    }

    static BigDecimal zero() {
        return BigDecimal.ZERO.setScale(SCALE);
    }

    /** The exact decimal day unit: a whole number becomes {@code n.0}, a half day stays {@code 0.5}. */
    static BigDecimal scale(BigDecimal days) {
        return days.setScale(SCALE, RoundingMode.UNNECESSARY);
    }
}

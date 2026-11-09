package com.company.leavemanager.leave.internal;

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
 * <p>{@code approved} and {@code pending} are the current period's days: the earlier period's usage
 * is already reflected in the net carryover, so counting it again here would subtract it twice.
 */
public record LeaveBalance(
        int entitlement,
        int carryover,
        int adjustments,
        int approved,
        int pending) {

    public int remaining() {
        return entitlement + carryover + adjustments - approved - pending;
    }

    public static LeaveBalance of(LeaveEntitlement entitlement, int adjustments, List<LeaveRequest> requests) {
        return of(entitlement, adjustments, requests, entitlement.periodStart());
    }

    public static LeaveBalance of(LeaveEntitlement entitlement,
                                  int adjustments,
                                  List<LeaveRequest> requests,
                                  LocalDate periodStart) {
        int approved = 0;
        int pending = 0;
        int usedBefore = 0;
        for (LeaveRequest request : requests) {
            if (!request.getType().consumesBalance()) {
                continue;
            }
            boolean beforePeriod = periodStart != null && request.getStartDate().isBefore(periodStart);
            switch (request.getStatus()) {
                case APPROVED -> {
                    if (beforePeriod) {
                        usedBefore += request.getBusinessDays();
                    } else {
                        approved += request.getBusinessDays();
                    }
                }
                case PENDING -> {
                    if (beforePeriod) {
                        usedBefore += request.getBusinessDays();
                    } else {
                        pending += request.getBusinessDays();
                    }
                }
                default -> {
                    // REJECTED and CANCELLED never count (BR-8).
                }
            }
        }
        return new LeaveBalance(
                entitlement.currentPeriodDays(),
                entitlement.carryoverDays() - usedBefore,
                adjustments,
                approved,
                pending);
    }
}

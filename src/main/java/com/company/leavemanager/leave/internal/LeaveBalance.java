package com.company.leavemanager.leave.internal;

import java.util.List;

/**
 * The balance of one employee (BR-5, BR-9): the entitlement plus carryover plus HR adjustments
 * minus the annual days already approved and the annual days still pending.
 *
 * <p>Only {@link LeaveType#ANNUAL} takes part: an excuse request is recorded but never moves a day
 * (BR-9). A rejected or cancelled request is not active, so it never takes part either (BR-8).
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
        int approved = 0;
        int pending = 0;
        for (LeaveRequest request : requests) {
            if (!request.getType().consumesBalance()) {
                continue;
            }
            switch (request.getStatus()) {
                case APPROVED -> approved += request.getBusinessDays();
                case PENDING -> pending += request.getBusinessDays();
                default -> {
                    // REJECTED and CANCELLED never count (BR-8).
                }
            }
        }
        return new LeaveBalance(
                entitlement.currentPeriodDays(),
                entitlement.carryoverDays(),
                adjustments,
                approved,
                pending);
    }
}

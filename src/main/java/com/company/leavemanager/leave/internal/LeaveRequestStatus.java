package com.company.leavemanager.leave.internal;

import java.util.Collection;
import java.util.List;

/** The single state a request holds (BR-8). */
public enum LeaveRequestStatus {

    PENDING,
    APPROVED,
    REJECTED,
    CANCELLED;

    /** Active requests take part in the overlap rule (BR-6) and in the balance (BR-5). */
    public boolean isActive() {
        return this == PENDING || this == APPROVED;
    }

    public static Collection<LeaveRequestStatus> active() {
        return List.of(PENDING, APPROVED);
    }
}

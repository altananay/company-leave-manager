package com.company.leavemanager.leave.internal;

/** The leave types of phase A. Every other type is phase B or its own spec. */
public enum LeaveType {

    /** Annual leave: the only type that consumes the balance (BR-9). */
    ANNUAL,

    /** Excuse leave: no balance is consumed (BR-9, BR-10). */
    EXCUSE;

    public boolean consumesBalance() {
        return this == ANNUAL;
    }
}

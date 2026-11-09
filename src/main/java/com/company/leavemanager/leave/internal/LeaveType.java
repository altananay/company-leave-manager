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

    /**
     * Whether the type can be taken as a half day (D15): only annual leave and excuse leave, and only
     * on a single working day. Every type phase B's BR-10 adds is a full-day type.
     */
    public boolean allowsHalfDay() {
        return this == ANNUAL || this == EXCUSE;
    }
}

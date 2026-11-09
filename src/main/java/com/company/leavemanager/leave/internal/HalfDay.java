package com.company.leavemanager.leave.internal;

/**
 * Half-day selection of a single-day request (phase B). Phase A always stores {@code NONE}; the
 * column and this enum exist now so phase B changes no schema and no migration history.
 */
public enum HalfDay {
    NONE,
    AM,
    PM
}

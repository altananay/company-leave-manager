package com.company.leavemanager.leave.internal;

/**
 * Half-day selection of a single-day request (D15). Phase B1 stores it: {@code AM} or {@code PM}
 * on one working day of an {@code ANNUAL} or {@code EXCUSE} request counts as 0,5 business days.
 * A whole-day request keeps {@code NONE}.
 */
public enum HalfDay {
    NONE,
    AM,
    PM
}

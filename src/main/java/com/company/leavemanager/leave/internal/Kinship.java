package com.company.leavemanager.leave.internal;

/**
 * The kinship BR-10's bereavement leave covers (D17): spouse, child, parent or sibling. The enum is
 * deliberately only these four values — a relative's identity is never collected, only this code
 * (docs/security.md, KVKK minimal set).
 */
public enum Kinship {

    SPOUSE,
    CHILD,
    PARENT,
    SIBLING
}

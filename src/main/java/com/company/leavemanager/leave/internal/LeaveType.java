package com.company.leavemanager.leave.internal;

/**
 * The leave types. {@code ANNUAL} and {@code EXCUSE} are phase A's two; the other six are BR-10's
 * special types (spec 0004, phase B2).
 *
 * <p>The metadata below is BR-10/D19 as data, so the service and its tests read one table instead of
 * repeating the numbers: a duration is an <strong>upper bound</strong> in business days, the three
 * one-day types are exactly one business day, the school types carry a calendar-year quota, and
 * birthday leave carries a 180-day window. Every special type is balance-free ({@link
 * #consumesBalance()} is false for all six, BR-9).
 */
public enum LeaveType {

    /** Annual leave: the only type that consumes the balance (BR-9). */
    ANNUAL,

    /** Excuse leave: no balance is consumed (BR-9, BR-10). */
    EXCUSE,

    /** BR-10: marriage leave, at most five business days. */
    MARRIAGE,

    /** BR-10: bereavement leave, at most five business days; the request carries the kinship. */
    BEREAVEMENT,

    /** BR-10: leave for the spouse's birth, at most five business days. */
    SPOUSE_BIRTH,

    /** BR-10: school report day, exactly one business day; needs a school-age child. */
    SCHOOL_REPORT,

    /** BR-10: birthday leave, exactly one business day inside the 180-day window. */
    BIRTHDAY,

    /** BR-10: the child's first school day, exactly one business day; needs a school-age child. */
    FIRST_SCHOOL_DAY;

    public boolean consumesBalance() {
        return this == ANNUAL;
    }

    /**
     * Whether the type can be taken as a half day (D15): only annual leave and excuse leave, and only
     * on a single working day. Every type BR-10 adds is a full-day type.
     */
    public boolean allowsHalfDay() {
        return this == ANNUAL || this == EXCUSE;
    }

    /**
     * BR-10's "Süre" as an upper bound in business days (D19), or {@code 0} when the type has no
     * special bound of its own ({@code ANNUAL}/{@code EXCUSE}).
     */
    public int maxBusinessDays() {
        return switch (this) {
            case MARRIAGE, BEREAVEMENT, SPOUSE_BIRTH -> 5;
            case SCHOOL_REPORT, BIRTHDAY, FIRST_SCHOOL_DAY -> 1;
            case ANNUAL, EXCUSE -> 0;
        };
    }

    /** D19: the three types that are exactly one business day, not merely capped at one. */
    public boolean singleDay() {
        return maxBusinessDays() == 1;
    }

    /** D19: only bereavement records the kinship of the deceased (BR-10). */
    public boolean requiresKinship() {
        return this == BEREAVEMENT;
    }

    /** BR-10: the two school types need the employee's school-age-child flag. */
    public boolean requiresSchoolAgeChild() {
        return this == SCHOOL_REPORT || this == FIRST_SCHOOL_DAY;
    }

    /** BR-10: birthday leave needs the employee's birth date to place its window. */
    public boolean requiresBirthDate() {
        return this == BIRTHDAY;
    }

    /**
     * D19: the calendar-year quota in days for the school types, or {@code 0} when the type has no
     * yearly quota. Birthday leave has a per-window quota instead ({@link #birthdayWindowDays()}).
     */
    public int yearlyQuotaDays() {
        return requiresSchoolAgeChild() ? 1 : 0;
    }

    /** D19: BR-10's birthday window in days after the most recent birthday, or {@code 0}. */
    public int birthdayWindowDays() {
        return requiresBirthDate() ? 180 : 0;
    }
}

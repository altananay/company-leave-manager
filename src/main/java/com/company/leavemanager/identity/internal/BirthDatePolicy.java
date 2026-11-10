package com.company.leavemanager.identity.internal;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;

/**
 * The sane range of a birth date, one validator for both HR entry points (spec 0004, phase B2,
 * D17/D18): creation and the org-data edit, exactly like {@link HireDatePolicy} does for the hire
 * date (N-03/N-06).
 *
 * <p>The lower bound is 1900-01-01. Anyone employed today was born after it, so an earlier date is a
 * typo — and BR-10's birthday window would place it in a year no leave can reach. The upper bound is
 * <strong>today in the business zone</strong>: a birth date in the future describes nobody.
 *
 * <p>A null date is allowed: the field is optional, and the leave module refuses birthday leave with
 * its own code ({@code LEAVE_NO_BIRTH_DATE}) until HR fills it in.
 */
final class BirthDatePolicy {

    /** {@code docs/conventions.md}, Data rules: the business calendar is Europe/Istanbul. */
    static final ZoneId BUSINESS_ZONE = ZoneId.of("Europe/Istanbul");

    static final LocalDate EARLIEST_BIRTH_DATE = LocalDate.of(1900, 1, 1);

    private BirthDatePolicy() {
    }

    /** Whether this date (or no date at all) may be stored as the employee's birth date. */
    static boolean isSane(LocalDate birthDate, Clock clock) {
        return birthDate == null
                || (!birthDate.isBefore(EARLIEST_BIRTH_DATE) && !birthDate.isAfter(today(clock)));
    }

    /** Today as HR means it: the business zone, never the UTC clock directly. */
    static LocalDate today(Clock clock) {
        return LocalDate.now(clock.withZone(BUSINESS_ZONE));
    }
}

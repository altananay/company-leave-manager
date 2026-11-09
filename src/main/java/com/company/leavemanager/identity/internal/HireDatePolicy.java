package com.company.leavemanager.identity.internal;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;

/**
 * The sane range of a hire date, one validator for both entry points (spec 0004 review round 3,
 * N-03/N-06): creation and the org-data edit.
 *
 * <p>The lower bound is 1950. Anyone still employed today was born well after it, so an earlier
 * date is a typo, not a career — 1900 alone would grant ~3,168 business days of entitlement.
 *
 * <p>The upper bound is <strong>today in the business zone</strong>. {@code docs/conventions.md}
 * fixes the business calendar at Europe/Istanbul while the injected clock is UTC
 * ({@code Application.clock}), so reading "today" in UTC would refuse a legitimate Istanbul date for
 * the three hours after local midnight — that was the reason for the old {@code +1 day} slack, and
 * it also let a genuinely future date through. Reading the clock in the business zone needs no slack
 * and no exception: a hire date is the day the employment started, and a future one can describe no
 * employment at all.
 */
final class HireDatePolicy {

    /** {@code docs/conventions.md}, Data rules: the business calendar is Europe/Istanbul. */
    static final ZoneId BUSINESS_ZONE = ZoneId.of("Europe/Istanbul");

    static final LocalDate EARLIEST_HIRE_DATE = LocalDate.of(1950, 1, 1);

    private HireDatePolicy() {
    }

    /** Whether this date (or no date at all) may be stored as the hired date. */
    static boolean isSane(LocalDate hireDate, Clock clock) {
        return hireDate == null || (!hireDate.isBefore(EARLIEST_HIRE_DATE) && !hireDate.isAfter(today(clock)));
    }

    /** Today as HR means it: the business zone, never the UTC clock directly. */
    static LocalDate today(Clock clock) {
        return LocalDate.now(clock.withZone(BUSINESS_ZONE));
    }
}

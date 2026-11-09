package com.company.leavemanager.testing;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.Collection;

/**
 * Calendar-aware date helpers for the integration tests (spec 0004 review round 3, N-02).
 *
 * <p>The round-2 tests asked the calendar for dates — "seven days ago", "the next Monday" — and then
 * asserted a business-day count. That is true only while the date is a working day: a Saturday, or
 * the Monday of Kurban Bayramı, silently changes the count and fails a test on a day nobody touched.
 * CI runs every day, so the helpers know both the weekend and the {@code public_holiday} rows the
 * database seeds (BR-4) instead of assuming a plain Monday-to-Friday week.
 *
 * <p>The holiday set is passed in, never hard-coded: the tests read the same rows the production
 * calendar reads, so a changed seed changes the fixtures with it.
 */
public final class WorkingDays {

    /** How far ahead {@link #holidayFreeMonday} looks before it gives up (ten years of Mondays). */
    private static final int MAX_WEEKS_AHEAD = 520;

    private WorkingDays() {
    }

    /** Whether BR-4 counts this day: a weekday the holiday table does not mark. */
    public static boolean isWorkingDay(LocalDate day, Collection<LocalDate> holidays) {
        DayOfWeek weekday = day.getDayOfWeek();
        return weekday != DayOfWeek.SATURDAY
                && weekday != DayOfWeek.SUNDAY
                && !holidays.contains(day);
    }

    /**
     * The latest working day at or before {@code day}: a test that needs "a week ago" gets a day the
     * business calendar counts, so a weekend or a holiday cannot turn a one-day request into zero.
     */
    public static LocalDate previousWorkingDay(LocalDate day, Collection<LocalDate> holidays) {
        LocalDate candidate = day;
        while (!isWorkingDay(candidate, holidays)) {
            candidate = candidate.minusDays(1);
        }
        return candidate;
    }

    /**
     * The first Monday at or after {@code from} whose {@code weeks} Monday-based weeks hold no public
     * holiday — the week before it included, because a range may start on the Friday before. A range
     * that starts there and stays inside it counts exactly five business days per whole week, which is
     * what the fixed business-day assertions of the integration tests rely on.
     */
    public static LocalDate holidayFreeMonday(LocalDate from, int weeks, Collection<LocalDate> holidays) {
        LocalDate monday = from;
        while (monday.getDayOfWeek() != DayOfWeek.MONDAY) {
            monday = monday.plusDays(1);
        }
        for (int attempt = 0; attempt < MAX_WEEKS_AHEAD; attempt++) {
            if (holdsNoHoliday(monday.minusWeeks(1), monday.plusWeeks(weeks).minusDays(1), holidays)) {
                return monday;
            }
            monday = monday.plusWeeks(1);
        }
        throw new IllegalStateException("no holiday-free " + weeks + "-week window at or after " + from);
    }

    private static boolean holdsNoHoliday(LocalDate start, LocalDate end, Collection<LocalDate> holidays) {
        return holidays.stream().noneMatch(day -> !day.isBefore(start) && !day.isAfter(end));
    }
}

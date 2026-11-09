package com.company.leavemanager.leave.internal;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.Collection;
import java.util.Set;

/**
 * The business calendar (BR-4): a working day is a weekday that is not a public holiday.
 *
 * <p>Holidays are data — the {@code public_holiday} table, maintained by HR — never a hard-coded
 * list. The count is fixed when a request is created and stored with it, so adding next year's
 * holidays cannot rewrite a past request.
 */
public final class BusinessCalendar {

    /** The business calendar is Europe/Istanbul (docs/conventions.md, Data rules). */
    public static final ZoneId BUSINESS_ZONE = ZoneId.of("Europe/Istanbul");

    /** The longest range the API accepts: a year plus its leap day (spec 0004, L-03). */
    public static final int MAX_RANGE_DAYS = 366;

    /**
     * The years a leave date may fall in (spec 0004 review round 2, M-07). Outside this window the
     * date is a data-entry error, and the range arithmetic ({@code plusDays}, {@code between}) would
     * overflow instead of refusing it — which must answer 400, never 500.
     */
    public static final int MIN_YEAR = 2000;

    /** @see #MIN_YEAR */
    public static final int MAX_YEAR = 2100;

    private final Set<LocalDate> holidays;

    public BusinessCalendar(Collection<LocalDate> holidays) {
        this.holidays = Set.copyOf(holidays);
    }

    /** The business date "today": the server clock read in the business zone, never UTC directly. */
    public static LocalDate today(Clock clock) {
        return LocalDate.now(clock.withZone(BUSINESS_ZONE));
    }

    public boolean isWorkingDay(LocalDate day) {
        return !isWeekend(day) && !holidays.contains(day);
    }

    /** Whether the calendar can count this date at all (M-07): inside {@link #MIN_YEAR}…{@link #MAX_YEAR}. */
    public static boolean isSupported(LocalDate day) {
        return day.getYear() >= MIN_YEAR && day.getYear() <= MAX_YEAR;
    }

    /**
     * Working days in {@code [start, end]}, both ends included. An inverted range has none; the
     * service rejects that as an invalid range before it asks.
     *
     * <p>The count is arithmetic, not a walk over every date: whole weeks contribute five days each,
     * the remaining days are counted one by one (at most six), and the holiday rows of the range are
     * subtracted. That keeps a 366-day range constant-time while the holiday set stays exact — the
     * set holds a few dozen rows, so scanning it is cheap and, unlike a day-by-day loop, does not
     * grow with the range.
     */
    public int workingDays(LocalDate start, LocalDate end) {
        if (end.isBefore(start)) {
            return 0;
        }
        long calendarDays = ChronoUnit.DAYS.between(start, end) + 1;
        long wholeWeeks = calendarDays / 7;
        int days = Math.toIntExact(wholeWeeks * 5);
        LocalDate remainderStart = start.plusDays(wholeWeeks * 7);
        for (LocalDate day = remainderStart; !day.isAfter(end); day = day.plusDays(1)) {
            if (!isWeekend(day)) {
                days++;
            }
        }
        for (LocalDate holiday : holidays) {
            if (!holiday.isBefore(start) && !holiday.isAfter(end) && !isWeekend(holiday)) {
                days--;
            }
        }
        return days;
    }

    private static boolean isWeekend(LocalDate day) {
        DayOfWeek weekday = day.getDayOfWeek();
        return weekday == DayOfWeek.SATURDAY || weekday == DayOfWeek.SUNDAY;
    }
}

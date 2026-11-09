package com.company.leavemanager.leave.internal;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
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

    /**
     * Working days in {@code [start, end]}, both ends included. An inverted range has none; the
     * service rejects that as an invalid range before it asks.
     */
    public int workingDays(LocalDate start, LocalDate end) {
        if (end.isBefore(start)) {
            return 0;
        }
        int days = 0;
        for (LocalDate day = start; !day.isAfter(end); day = day.plusDays(1)) {
            if (isWorkingDay(day)) {
                days++;
            }
        }
        return days;
    }

    private static boolean isWeekend(LocalDate day) {
        DayOfWeek weekday = day.getDayOfWeek();
        return weekday == DayOfWeek.SATURDAY || weekday == DayOfWeek.SUNDAY;
    }
}

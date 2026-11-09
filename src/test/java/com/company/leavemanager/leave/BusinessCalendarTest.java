package com.company.leavemanager.leave;

import com.company.leavemanager.leave.internal.BusinessCalendar;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** BR-4: a leave lasts its working days — weekdays minus the public holidays of the calendar. */
class BusinessCalendarTest {

    private static final LocalDate MONDAY = LocalDate.of(2026, 11, 9);

    @Test
    void shouldCountTheWeekdaysOfARangeInclusive() {
        BusinessCalendar calendar = new BusinessCalendar(List.of());

        // Monday to Friday is five; a range that starts on Friday and ends on Monday is two.
        assertThat(calendar.workingDays(MONDAY, MONDAY.plusDays(4))).isEqualTo(5);
        assertThat(calendar.workingDays(MONDAY.plusDays(4), MONDAY.plusDays(7))).isEqualTo(2);
    }

    @Test
    void shouldSubtractAPublicHoliday() {
        // 29 October 2026 is a Thursday: the week of 26–30 October keeps four working days.
        BusinessCalendar calendar = new BusinessCalendar(List.of(LocalDate.of(2026, 10, 29)));

        assertThat(calendar.workingDays(LocalDate.of(2026, 10, 26), LocalDate.of(2026, 10, 30)))
                .isEqualTo(4);
        assertThat(calendar.isWorkingDay(LocalDate.of(2026, 10, 29))).isFalse();
        assertThat(calendar.isWorkingDay(LocalDate.of(2026, 10, 30))).isTrue();
    }

    @Test
    void shouldCountASingleWorkingDayAsOne() {
        BusinessCalendar calendar = new BusinessCalendar(List.of());

        assertThat(calendar.workingDays(MONDAY, MONDAY)).isEqualTo(1);
    }

    @Test
    void shouldCountNoDaysForAWeekendOnlyRange() {
        BusinessCalendar calendar = new BusinessCalendar(List.of());

        // Saturday 14 November to Sunday 15 November 2026.
        assertThat(calendar.workingDays(LocalDate.of(2026, 11, 14), LocalDate.of(2026, 11, 15)))
                .isZero();
    }

    @Test
    void shouldCountNoDaysForAnInvertedRange() {
        BusinessCalendar calendar = new BusinessCalendar(List.of());

        assertThat(calendar.workingDays(MONDAY.plusDays(2), MONDAY)).isZero();
    }

    @Test
    void shouldCountALongRangeLikeTheDayByDayOracle() {
        // L-03: the count is whole weeks plus a remainder, not a walk over every date. A 366-day
        // range is the API's maximum, and this test is the oracle: the arithmetic must equal a plain
        // day-by-day count, holidays included, for the largest range the service accepts.
        LocalDate start = LocalDate.of(2026, 1, 1);
        LocalDate end = start.plusDays(365);   // 366 calendar days, both ends included
        List<LocalDate> holidays = List.of(
                LocalDate.of(2026, 1, 1), LocalDate.of(2026, 3, 20), LocalDate.of(2026, 3, 21),
                LocalDate.of(2026, 3, 22), LocalDate.of(2026, 4, 23), LocalDate.of(2026, 5, 1),
                LocalDate.of(2026, 5, 19), LocalDate.of(2026, 5, 27), LocalDate.of(2026, 5, 28),
                LocalDate.of(2026, 5, 29), LocalDate.of(2026, 5, 30), LocalDate.of(2026, 7, 15),
                LocalDate.of(2026, 8, 30), LocalDate.of(2026, 10, 29));
        int oracle = 0;
        for (LocalDate day = start; !day.isAfter(end); day = day.plusDays(1)) {
            if (day.getDayOfWeek() != java.time.DayOfWeek.SATURDAY
                    && day.getDayOfWeek() != java.time.DayOfWeek.SUNDAY
                    && !holidays.contains(day)) {
                oracle++;
            }
        }

        BusinessCalendar withHolidays = new BusinessCalendar(holidays);
        BusinessCalendar withoutHolidays = new BusinessCalendar(List.of());

        assertThat(withHolidays.workingDays(start, end)).isEqualTo(oracle);
        // 52 full weeks (260) plus the two weekday tail days, minus the ten holidays on weekdays.
        assertThat(withHolidays.workingDays(start, end)).isEqualTo(252);
        assertThat(withoutHolidays.workingDays(start, end)).isEqualTo(262);
    }

    @Test
    void shouldNotSubtractAHolidayThatFallsOnAWeekend() {
        // 21 March 2026 is a Saturday: it is already outside the working week, so subtracting it
        // again would count one day twice.
        BusinessCalendar calendar = new BusinessCalendar(List.of(LocalDate.of(2026, 3, 21)));

        assertThat(calendar.workingDays(LocalDate.of(2026, 3, 16), LocalDate.of(2026, 3, 22)))
                .isEqualTo(5);
    }

    @Test
    void shouldReadTodayInTheBusinessZone() {
        // 22:30 UTC on 8 November is already 9 November in Istanbul (UTC+3): the business date is
        // the one a Turkish employee sees, not the server's UTC date.
        Clock clock = Clock.fixed(Instant.parse("2026-11-08T22:30:00Z"), ZoneOffset.UTC);

        assertThat(BusinessCalendar.today(clock)).isEqualTo(LocalDate.of(2026, 11, 9));
    }
}

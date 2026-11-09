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
    void shouldReadTodayInTheBusinessZone() {
        // 22:30 UTC on 8 November is already 9 November in Istanbul (UTC+3): the business date is
        // the one a Turkish employee sees, not the server's UTC date.
        Clock clock = Clock.fixed(Instant.parse("2026-11-08T22:30:00Z"), ZoneOffset.UTC);

        assertThat(BusinessCalendar.today(clock)).isEqualTo(LocalDate.of(2026, 11, 9));
    }
}

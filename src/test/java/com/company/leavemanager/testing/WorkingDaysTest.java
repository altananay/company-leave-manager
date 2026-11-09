package com.company.leavemanager.testing;

import org.junit.jupiter.api.Test;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The helpers the integration tests date their fixtures with (spec 0004 review round 3, N-02): a bug
 * here would quietly weaken every business-day assertion that uses them, so they are pinned.
 */
class WorkingDaysTest {

    /** A Kurban-Bayramı-shaped cluster: four consecutive days, one of them a weekend day. */
    private static final Set<LocalDate> HOLIDAYS = Set.of(
            LocalDate.of(2027, 5, 16),   // Sunday
            LocalDate.of(2027, 5, 17),   // Monday — the day the old helper could pick
            LocalDate.of(2027, 5, 18),
            LocalDate.of(2027, 5, 19));

    @Test
    void shouldCountAWeekdayOutsideTheHolidayTable() {
        assertThat(WorkingDays.isWorkingDay(LocalDate.of(2027, 5, 20), HOLIDAYS)).isTrue();
        assertThat(WorkingDays.isWorkingDay(LocalDate.of(2027, 5, 17), HOLIDAYS)).isFalse();
        assertThat(WorkingDays.isWorkingDay(LocalDate.of(2027, 5, 22), HOLIDAYS)).isFalse();
        assertThat(WorkingDays.isWorkingDay(LocalDate.of(2027, 5, 17), List.of())).isTrue();
    }

    @Test
    void shouldStepBackOverAWeekendAndAHoliday() {
        // 2027-05-16 is a Sunday; walking back reaches Friday the 14th.
        assertThat(WorkingDays.previousWorkingDay(LocalDate.of(2027, 5, 16), HOLIDAYS))
                .isEqualTo(LocalDate.of(2027, 5, 14));
        // 2027-05-17 is a holiday Monday: the weekend and the holiday both have to be stepped over.
        assertThat(WorkingDays.previousWorkingDay(LocalDate.of(2027, 5, 17), HOLIDAYS))
                .isEqualTo(LocalDate.of(2027, 5, 14));
        // A working day is returned unchanged: the helper never moves a date it may keep.
        assertThat(WorkingDays.previousWorkingDay(LocalDate.of(2027, 5, 20), HOLIDAYS))
                .isEqualTo(LocalDate.of(2027, 5, 20));
    }

    @Test
    void shouldFindTheFirstMondayWhoseMonthHoldsNoHoliday() {
        LocalDate monday = WorkingDays.holidayFreeMonday(LocalDate.of(2027, 5, 10), 4, HOLIDAYS);

        assertThat(monday.getDayOfWeek()).isEqualTo(DayOfWeek.MONDAY);
        assertThat(monday).isAfterOrEqualTo(LocalDate.of(2027, 5, 10));
        // The promised window is clean …
        assertThat(inside(monday.minusWeeks(1), monday.plusWeeks(4).minusDays(1))).isFalse();
        // … and it is the first one: the Monday before it still carries the holiday inside its window.
        assertThat(inside(monday.minusWeeks(2), monday.plusWeeks(3).minusDays(1))).isTrue();
    }

    @Test
    void shouldReturnTheFirstMondayWhenTheCalendarHasNoHoliday() {
        LocalDate from = LocalDate.of(2027, 5, 12);   // a Wednesday

        assertThat(WorkingDays.holidayFreeMonday(from, 4, List.of())).isEqualTo(LocalDate.of(2027, 5, 17));
    }

    /** Whether a seeded holiday falls inside {@code [start, end]}. */
    private static boolean inside(LocalDate start, LocalDate end) {
        return HOLIDAYS.stream().anyMatch(day -> !day.isBefore(start) && !day.isAfter(end));
    }
}

package com.company.leavemanager.leave;

import com.company.leavemanager.leave.internal.HalfDay;
import com.company.leavemanager.leave.internal.Kinship;
import com.company.leavemanager.leave.internal.LeaveError;
import com.company.leavemanager.leave.internal.LeaveRequest;
import com.company.leavemanager.leave.internal.LeaveType;
import com.company.leavemanager.leave.internal.SpecialLeavePolicy;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * BR-10's durations, conditions, windows and quotas as pure rules (spec 0004, phase B2; D19). The
 * integration test proves the same codes over HTTP; this class proves the arithmetic and the
 * boundaries without a database.
 */
class SpecialLeavePolicyTest {

    private static final LocalDate MONDAY = LocalDate.of(2026, 11, 16);
    private static final LocalDate BIRTH = LocalDate.of(1990, 5, 1);
    private static final Instant NOW = Instant.parse("2026-11-09T08:00:00Z");

    // ---------------------------------------------------------------- durations

    @Test
    void shouldCapTheFiveDayTypes() {
        for (LeaveType type : List.of(LeaveType.MARRIAGE, LeaveType.BEREAVEMENT, LeaveType.SPOUSE_BIRTH)) {
            assertThat(type.maxBusinessDays()).as(type.name()).isEqualTo(5);
            assertThat(SpecialLeavePolicy.checkDuration(type, days("5"))).isEmpty();
            assertThat(SpecialLeavePolicy.checkDuration(type, days("5.5")))
                    .contains(LeaveError.SPECIAL_TOO_LONG);
            assertThat(SpecialLeavePolicy.checkDuration(type, days("6")))
                    .contains(LeaveError.SPECIAL_TOO_LONG);
        }
    }

    @Test
    void shouldKeepTheOneDayTypesToOneDay() {
        for (LeaveType type : List.of(LeaveType.SCHOOL_REPORT, LeaveType.BIRTHDAY, LeaveType.FIRST_SCHOOL_DAY)) {
            assertThat(type.maxBusinessDays()).as(type.name()).isEqualTo(1);
            assertThat(type.singleDay()).as(type.name()).isTrue();
            assertThat(SpecialLeavePolicy.checkDuration(type, days("1"))).isEmpty();
            assertThat(SpecialLeavePolicy.checkDuration(type, days("2")))
                    .contains(LeaveError.SPECIAL_TOO_LONG);

            // "tam 1 iş günü": a single calendar day whose frozen count is one. A range that only
            // happens to contain one working day is not a single day (D19).
            assertThat(SpecialLeavePolicy.checkOneDay(type, MONDAY, MONDAY, days("1"))).isEmpty();
            assertThat(SpecialLeavePolicy.checkOneDay(type, MONDAY, MONDAY.plusDays(1), days("2")))
                    .contains(LeaveError.SPECIAL_ONE_DAY);
            assertThat(SpecialLeavePolicy.checkOneDay(type, MONDAY, MONDAY, days("0.5")))
                    .contains(LeaveError.SPECIAL_ONE_DAY);
        }
        // A range, a half day and a five-day type are not one-day types.
        assertThat(SpecialLeavePolicy.checkOneDay(LeaveType.MARRIAGE, MONDAY, MONDAY, days("1"))).isEmpty();
        assertThat(SpecialLeavePolicy.checkOneDay(LeaveType.ANNUAL, MONDAY, MONDAY.plusDays(2), days("3")))
                .isEmpty();
    }

    @Test
    void shouldLeaveThePhaseATypesUnbounded() {
        for (LeaveType type : List.of(LeaveType.ANNUAL, LeaveType.EXCUSE)) {
            assertThat(type.maxBusinessDays()).as(type.name()).isZero();
            assertThat(type.singleDay()).as(type.name()).isFalse();
            assertThat(type.requiresKinship()).isFalse();
            assertThat(type.requiresSchoolAgeChild()).isFalse();
            assertThat(type.requiresBirthDate()).isFalse();
            assertThat(type.yearlyQuotaDays()).isZero();
            assertThat(type.birthdayWindowDays()).isZero();
            assertThat(SpecialLeavePolicy.checkDuration(type, days("40"))).isEmpty();
            assertThat(SpecialLeavePolicy.checkOneDay(type, MONDAY, MONDAY.plusDays(2), days("3"))).isEmpty();
            assertThat(SpecialLeavePolicy.checkKinship(type, null)).isEmpty();
            assertThat(SpecialLeavePolicy.checkSchoolAgeChild(type, false)).isEmpty();
            assertThat(SpecialLeavePolicy.checkBirthDate(type, null)).isEmpty();
            assertThat(SpecialLeavePolicy.checkBirthdayWindow(type, null, MONDAY)).isEmpty();
            assertThat(SpecialLeavePolicy.checkQuota(type, MONDAY, days("1"), null, List.of(), null)).isEmpty();
        }
    }

    // ----------------------------------------------------------------- kinds

    @Test
    void shouldRequireKinshipOnlyForBereavement() {
        assertThat(SpecialLeavePolicy.checkKinship(LeaveType.BEREAVEMENT, null))
                .contains(LeaveError.KINSHIP_REQUIRED);
        for (Kinship kinship : Kinship.values()) {
            assertThat(SpecialLeavePolicy.checkKinship(LeaveType.BEREAVEMENT, kinship)).isEmpty();
        }
        assertThat(Kinship.values()).containsExactly(
                Kinship.SPOUSE, Kinship.CHILD, Kinship.PARENT, Kinship.SIBLING);

        for (LeaveType type : LeaveType.values()) {
            if (type == LeaveType.BEREAVEMENT) {
                continue;
            }
            assertThat(SpecialLeavePolicy.checkKinship(type, null)).as(type.name()).isEmpty();
            // The database has the same rule; the service refuses it with its own 400 rather than
            // letting the insert fail as a server error.
            assertThat(SpecialLeavePolicy.checkKinship(type, Kinship.SPOUSE))
                    .as(type.name())
                    .contains(LeaveError.INVALID_PARAMETER);
        }
    }

    @Test
    void shouldRequireTheSchoolAgeChildForTheSchoolTypes() {
        for (LeaveType type : List.of(LeaveType.SCHOOL_REPORT, LeaveType.FIRST_SCHOOL_DAY)) {
            assertThat(type.requiresSchoolAgeChild()).as(type.name()).isTrue();
            assertThat(type.yearlyQuotaDays()).as(type.name()).isEqualTo(1);
            assertThat(SpecialLeavePolicy.checkSchoolAgeChild(type, false))
                    .contains(LeaveError.NO_SCHOOL_AGE_CHILD);
            assertThat(SpecialLeavePolicy.checkSchoolAgeChild(type, true)).isEmpty();
        }
        assertThat(SpecialLeavePolicy.checkSchoolAgeChild(LeaveType.BIRTHDAY, false)).isEmpty();
        assertThat(SpecialLeavePolicy.checkSchoolAgeChild(LeaveType.MARRIAGE, false)).isEmpty();
    }

    @Test
    void shouldRequireABirthDateForTheBirthday() {
        assertThat(LeaveType.BIRTHDAY.requiresBirthDate()).isTrue();
        assertThat(LeaveType.BIRTHDAY.birthdayWindowDays()).isEqualTo(180);
        assertThat(SpecialLeavePolicy.checkBirthDate(LeaveType.BIRTHDAY, null))
                .contains(LeaveError.NO_BIRTH_DATE);
        assertThat(SpecialLeavePolicy.checkBirthDate(LeaveType.BIRTHDAY, BIRTH)).isEmpty();
        assertThat(SpecialLeavePolicy.checkBirthDate(LeaveType.SCHOOL_REPORT, null)).isEmpty();
        assertThat(SpecialLeavePolicy.checkBirthDate(LeaveType.ANNUAL, null)).isEmpty();
    }

    // -------------------------------------------------------- birthday window

    @Test
    void shouldPlaceTheBirthdayWithinTheWindow() {
        LocalDate birthday = LocalDate.of(2026, 5, 1);

        assertThat(SpecialLeavePolicy.mostRecentBirthday(BIRTH, birthday.minusDays(1)))
                .isEqualTo(LocalDate.of(2025, 5, 1));
        assertThat(SpecialLeavePolicy.mostRecentBirthday(BIRTH, birthday)).isEqualTo(birthday);

        // On the birthday, +180 and +181.
        assertThat(SpecialLeavePolicy.checkBirthdayWindow(LeaveType.BIRTHDAY, BIRTH, birthday)).isEmpty();
        assertThat(SpecialLeavePolicy.checkBirthdayWindow(LeaveType.BIRTHDAY, BIRTH,
                birthday.plusDays(180))).isEmpty();
        assertThat(SpecialLeavePolicy.checkBirthdayWindow(LeaveType.BIRTHDAY, BIRTH,
                birthday.plusDays(181))).contains(LeaveError.BIRTHDAY_WINDOW);

        // Before the birthday the previous year's window decides: 2026-04-30 is long after it.
        assertThat(SpecialLeavePolicy.checkBirthdayWindow(LeaveType.BIRTHDAY, BIRTH,
                LocalDate.of(2026, 4, 30))).contains(LeaveError.BIRTHDAY_WINDOW);
        // The previous window's own boundary: 2025-05-01 + 180 = 2025-10-28.
        assertThat(SpecialLeavePolicy.checkBirthdayWindow(LeaveType.BIRTHDAY, BIRTH,
                LocalDate.of(2025, 10, 28))).isEmpty();
        assertThat(SpecialLeavePolicy.checkBirthdayWindow(LeaveType.BIRTHDAY, BIRTH,
                LocalDate.of(2025, 10, 29))).contains(LeaveError.BIRTHDAY_WINDOW);
    }

    @Test
    void shouldObserveFebruary29OnFebruary28InANonLeapYear() {
        LocalDate leapBirth = LocalDate.of(2000, 2, 29);

        // MonthDay.atYear maps 29 February to 28 February when the year has no 29th.
        assertThat(SpecialLeavePolicy.mostRecentBirthday(leapBirth, LocalDate.of(2026, 2, 27)))
                .isEqualTo(LocalDate.of(2025, 2, 28));
        assertThat(SpecialLeavePolicy.mostRecentBirthday(leapBirth, LocalDate.of(2026, 2, 28)))
                .isEqualTo(LocalDate.of(2026, 2, 28));

        // 2026-02-28 + 180 = 2026-08-27.
        assertThat(SpecialLeavePolicy.checkBirthdayWindow(LeaveType.BIRTHDAY, leapBirth,
                LocalDate.of(2026, 2, 28))).isEmpty();
        assertThat(SpecialLeavePolicy.checkBirthdayWindow(LeaveType.BIRTHDAY, leapBirth,
                LocalDate.of(2026, 8, 27))).isEmpty();
        assertThat(SpecialLeavePolicy.checkBirthdayWindow(LeaveType.BIRTHDAY, leapBirth,
                LocalDate.of(2026, 8, 28))).contains(LeaveError.BIRTHDAY_WINDOW);
    }

    // ---------------------------------------------------------------- quotas

    @Test
    void shouldCountTheCalendarYearQuota() {
        LocalDate leave = LocalDate.of(2026, 3, 2);   // a Monday in 2026
        LeaveRequest pendingSameYear = request(LeaveType.SCHOOL_REPORT, LocalDate.of(2026, 9, 7));
        LeaveRequest approvedSameYear = approved(request(LeaveType.SCHOOL_REPORT, LocalDate.of(2026, 10, 5)));
        LeaveRequest rejectedSameYear = rejected(request(LeaveType.SCHOOL_REPORT, LocalDate.of(2026, 9, 14)));
        LeaveRequest cancelledSameYear = cancelled(request(LeaveType.SCHOOL_REPORT, LocalDate.of(2026, 9, 21)));
        LeaveRequest otherYear = request(LeaveType.SCHOOL_REPORT, LocalDate.of(2027, 3, 1));
        LeaveRequest otherType = request(LeaveType.FIRST_SCHOOL_DAY, LocalDate.of(2026, 9, 7));

        assertThat(SpecialLeavePolicy.checkQuota(LeaveType.SCHOOL_REPORT, leave, days("1"), null,
                List.of(pendingSameYear), null)).contains(LeaveError.SPECIAL_QUOTA_USED);
        assertThat(SpecialLeavePolicy.checkQuota(LeaveType.SCHOOL_REPORT, leave, days("1"), null,
                List.of(approvedSameYear), null)).contains(LeaveError.SPECIAL_QUOTA_USED);
        assertThat(SpecialLeavePolicy.checkQuota(LeaveType.SCHOOL_REPORT, leave, days("1"), null,
                List.of(pendingSameYear, approvedSameYear), null)).contains(LeaveError.SPECIAL_QUOTA_USED);

        // The quota is per calendar year and per type, and only active requests count (BR-8).
        assertThat(SpecialLeavePolicy.checkQuota(LeaveType.SCHOOL_REPORT, leave, days("1"), null,
                List.of(otherYear), null)).isEmpty();
        assertThat(SpecialLeavePolicy.checkQuota(LeaveType.SCHOOL_REPORT, leave, days("1"), null,
                List.of(otherType), null)).isEmpty();
        assertThat(SpecialLeavePolicy.checkQuota(LeaveType.SCHOOL_REPORT, leave, days("1"), null,
                List.of(rejectedSameYear, cancelledSameYear), null)).isEmpty();

        // The request under approval is excluded from its own quota check.
        assertThat(SpecialLeavePolicy.checkQuota(LeaveType.SCHOOL_REPORT, leave, days("1"), null,
                List.of(pendingSameYear), pendingSameYear.getId())).isEmpty();
        assertThat(SpecialLeavePolicy.checkQuota(LeaveType.FIRST_SCHOOL_DAY, leave, days("1"), null,
                List.of(otherType), null)).contains(LeaveError.SPECIAL_QUOTA_USED);

        // The yearly quota of the two school types is independent: a karne day does not consume the
        // first-school-day quota.
        assertThat(SpecialLeavePolicy.checkQuota(LeaveType.FIRST_SCHOOL_DAY, leave, days("1"), null,
                List.of(pendingSameYear), null)).isEmpty();
    }

    @Test
    void shouldCountTheBirthdayWindowQuota() {
        LocalDate leave = LocalDate.of(2026, 6, 1);   // 2026-05-01 + 31 days: same window
        LeaveRequest pendingSameWindow = request(LeaveType.BIRTHDAY, LocalDate.of(2026, 10, 1));
        LeaveRequest approvedSameWindow = approved(request(LeaveType.BIRTHDAY, LocalDate.of(2026, 6, 15)));
        LeaveRequest nextWindow = request(LeaveType.BIRTHDAY, LocalDate.of(2027, 5, 10));
        LeaveRequest otherType = request(LeaveType.SCHOOL_REPORT, LocalDate.of(2026, 6, 15));

        assertThat(SpecialLeavePolicy.checkQuota(LeaveType.BIRTHDAY, leave, days("1"), BIRTH,
                List.of(pendingSameWindow), null)).contains(LeaveError.SPECIAL_QUOTA_USED);
        assertThat(SpecialLeavePolicy.checkQuota(LeaveType.BIRTHDAY, leave, days("1"), BIRTH,
                List.of(approvedSameWindow), null)).contains(LeaveError.SPECIAL_QUOTA_USED);
        // One day per window: the next birthday opens a new quota.
        assertThat(SpecialLeavePolicy.checkQuota(LeaveType.BIRTHDAY, leave, days("1"), BIRTH,
                List.of(nextWindow), null)).isEmpty();
        assertThat(SpecialLeavePolicy.checkQuota(LeaveType.BIRTHDAY, leave, days("1"), BIRTH,
                List.of(otherType), null)).isEmpty();
        assertThat(SpecialLeavePolicy.checkQuota(LeaveType.BIRTHDAY, leave, days("1"), BIRTH,
                List.of(pendingSameWindow), pendingSameWindow.getId())).isEmpty();
        // The window cannot be placed without a birth date; checkBirthDate owns that refusal.
        assertThat(SpecialLeavePolicy.checkQuota(LeaveType.BIRTHDAY, leave, days("1"), null,
                List.of(pendingSameWindow), null)).isEmpty();
    }

    // --------------------------------------------------------------- helpers

    private static BigDecimal days(String value) {
        return new BigDecimal(value);
    }

    private static LeaveRequest request(LeaveType type, LocalDate start) {
        return LeaveRequest.create(UUID.randomUUID(), type, start, start, HalfDay.NONE,
                new BigDecimal("1.0"), null, null, NOW);
    }

    private static LeaveRequest approved(LeaveRequest request) {
        request.approve(UUID.randomUUID(), null, NOW);
        return request;
    }

    private static LeaveRequest rejected(LeaveRequest request) {
        request.reject(UUID.randomUUID(), "yoğunluk", NOW);
        return request;
    }

    private static LeaveRequest cancelled(LeaveRequest request) {
        request.approve(UUID.randomUUID(), null, NOW);
        request.cancel(UUID.randomUUID(), NOW);
        return request;
    }
}

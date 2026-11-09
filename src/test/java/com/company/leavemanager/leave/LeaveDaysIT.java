package com.company.leavemanager.leave;

import com.company.leavemanager.testing.WorkingDays;
import org.junit.jupiter.api.Test;

import java.net.http.HttpResponse;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * AC-13 / D20: "izinli günlerim". The endpoint answers only with the caller's own
 * <strong>approved</strong> leave days, expanded to working days against the current calendar; a
 * half-day request contributes its single date with the marker. Pending, cancelled and another
 * employee's days never appear, and the session alone decides whose list is read.
 */
class LeaveDaysIT extends LeaveTestSupport {

    /** One element of the response, in the record's own order (date, type, halfDay, requestId). */
    private record Day(String date, String type, String halfDay, String requestId) {
    }

    private static final Pattern DAY = Pattern.compile(
            "\\{\"date\":\"(\\d{4}-\\d{2}-\\d{2})\",\"type\":\"([A-Z_]+)\","
                    + "\"halfDay\":\"(NONE|AM|PM)\",\"requestId\":\"([0-9a-f-]+)\"\\}");

    @Test
    void shouldListOnlyTheCallersApprovedDays() throws Exception {
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Account other = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);
        Session otherMember = signIn(other);
        Session managerSession = signIn(manager);
        LocalDate monday = nextMonday();

        HttpResponse<String> created = createLeave(member, "ANNUAL", monday, monday.plusDays(2), "aile");
        assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
        String approvedId = extract(created.body(), "id");
        assertThat(approve(managerSession, approvedId).statusCode()).isEqualTo(200);
        // A pending request and another employee's approved request must not show as days off, and a
        // cancelled approval is no longer a day off either.
        LocalDate pendingDay = monday.plusDays(7);
        String pendingId = extract(createLeave(member, "EXCUSE", pendingDay, pendingDay, "mazeret").body(), "id");
        String otherId = extract(createLeave(otherMember, "ANNUAL", monday.plusDays(14), monday.plusDays(14), "başka").body(), "id");
        assertThat(approve(managerSession, otherId).statusCode()).isEqualTo(200);
        LocalDate cancelledDay = monday.plusDays(21);
        String cancelledId = extract(createLeave(member, "ANNUAL", cancelledDay, cancelledDay, "iptal").body(), "id");
        assertThat(approve(managerSession, cancelledId).statusCode()).isEqualTo(200);
        assertThat(cancel(member, cancelledId).statusCode()).isEqualTo(200);

        List<Day> days = days(member, "?from=" + monday + "&to=" + monday.plusDays(27));

        // The three working days of the approved range, in date order, all pointing at the request.
        assertThat(days).extracting(Day::date).containsExactly(
                monday.toString(), monday.plusDays(1).toString(), monday.plusDays(2).toString());
        assertThat(days).allSatisfy(day -> {
            assertThat(day.type()).isEqualTo("ANNUAL");
            assertThat(day.halfDay()).isEqualTo("NONE");
            assertThat(day.requestId()).isEqualTo(approvedId);
        });
        // Pending, cancelled and another employee's request are absent, by date and by id.
        assertThat(days).extracting(Day::date).doesNotContain(
                pendingDay.toString(), monday.plusDays(14).toString(), cancelledDay.toString());
        assertThat(days).extracting(Day::requestId).doesNotContain(pendingId, otherId, cancelledId);
    }

    @Test
    void shouldMarkTheHalfDay() throws Exception {
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);
        Session managerSession = signIn(manager);
        LocalDate monday = nextMonday();
        HttpResponse<String> created = createLeave(member, "EXCUSE", monday, monday, "AM", "doktor");
        String requestId = extract(created.body(), "id");
        assertThat(approve(managerSession, requestId).statusCode()).isEqualTo(200);

        List<Day> days = days(member, "?from=" + monday + "&to=" + monday);

        assertThat(days).hasSize(1);
        assertThat(days.getFirst().date()).isEqualTo(monday.toString());
        assertThat(days.getFirst().type()).isEqualTo("EXCUSE");
        assertThat(days.getFirst().halfDay()).isEqualTo("AM");
        assertThat(days.getFirst().requestId()).isEqualTo(requestId);
    }

    @Test
    void shouldNotListAnotherEmployeesDays() throws Exception {
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Account other = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);
        Session otherMember = signIn(other);
        Session managerSession = signIn(manager);
        LocalDate monday = nextMonday();
        String ownId = extract(createLeave(member, "ANNUAL", monday, monday, "aile").body(), "id");
        String otherId = extract(createLeave(otherMember, "ANNUAL", monday.plusDays(2), monday.plusDays(2), "başka").body(), "id");
        assertThat(approve(managerSession, ownId).statusCode()).isEqualTo(200);
        assertThat(approve(managerSession, otherId).statusCode()).isEqualTo(200);
        String range = "?from=" + monday + "&to=" + monday.plusDays(7);

        List<Day> own = days(member, range);
        List<Day> others = days(otherMember, range);

        assertThat(own).allSatisfy(day -> assertThat(day.requestId()).isEqualTo(ownId));
        assertThat(others).allSatisfy(day -> assertThat(day.requestId()).isEqualTo(otherId));
        // There is no employeeId parameter: the manager's and HR's own lists do not borrow anybody's.
        assertThat(days(managerSession, range)).isEmpty();
        assertThat(days(session, range)).isEmpty();
    }

    @Test
    void shouldDefaultToTheNextNinetyDays() throws Exception {
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);
        Session managerSession = signIn(manager);
        LocalDate near = nextMonday();
        // The far request must be a working day too: a fixed offset can land on a public holiday,
        // which create would refuse with LEAVE_NO_WORKING_DAY (N-02). It stays beyond day 90.
        LocalDate far = WorkingDays.previousWorkingDay(nextMonday().plusDays(120), publicHolidays());
        String nearId = extract(createLeave(member, "ANNUAL", near, near, "yakın").body(), "id");
        String farId = extract(createLeave(member, "ANNUAL", far, far, "uzak").body(), "id");
        assertThat(approve(managerSession, nearId).statusCode()).isEqualTo(200);
        assertThat(approve(managerSession, farId).statusCode()).isEqualTo(200);

        List<Day> days = days(member, "");

        // today … today + 90: the near Monday is inside, the +120-day request is outside.
        assertThat(days).anySatisfy(day -> {
            assertThat(day.requestId()).isEqualTo(nearId);
            assertThat(day.date()).isEqualTo(near.toString());
        });
        assertThat(days).noneSatisfy(day -> assertThat(day.requestId()).isEqualTo(farId));
    }

    @Test
    void shouldRefuseAnInvertedOrTooLongRange() throws Exception {
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);
        LocalDate monday = nextMonday();

        HttpResponse<String> inverted = member.get("/api/leave/days?from=" + monday
                + "&to=" + monday.minusDays(1));
        assertThat(inverted.statusCode()).isEqualTo(400);
        assertThat(errorCode(inverted)).isEqualTo("LEAVE_INVALID_RANGE");

        // 366 calendar days is the cap: a 367-day window is refused before anything is expanded.
        HttpResponse<String> tooLong = member.get("/api/leave/days?from=" + monday
                + "&to=" + monday.plusDays(366));
        assertThat(tooLong.statusCode()).isEqualTo(400);
        assertThat(errorCode(tooLong)).isEqualTo("LEAVE_RANGE_TOO_LONG");
    }

    @Test
    void shouldNotListCancelledDays() throws Exception {
        // AC-13: a cancelled request is no longer a day off; only APPROVED is a day (D20).
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);
        Session managerSession = signIn(manager);
        LocalDate monday = nextMonday();
        String requestId = extract(createLeave(member, "ANNUAL", monday, monday, "aile").body(), "id");
        assertThat(approve(managerSession, requestId).statusCode()).isEqualTo(200);
        assertThat(days(member, "?from=" + monday + "&to=" + monday)).hasSize(1);

        assertThat(cancel(member, requestId).statusCode()).isEqualTo(200);

        assertThat(days(member, "?from=" + monday + "&to=" + monday)).isEmpty();
    }

    @Test
    void shouldFollowTheCurrentHolidayCalendar() throws Exception {
        // D20: the day list is expanded against the current calendar, so a holiday added later removes
        // the day from the view — while the request's frozen business_days does not move (D5). Removing
        // the holiday brings the day back.
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);
        Session managerSession = signIn(manager);
        LocalDate monday = nextMonday();
        String requestId = extract(createLeave(member, "ANNUAL", monday, monday, "aile").body(), "id");
        assertThat(approve(managerSession, requestId).statusCode()).isEqualTo(200);
        String range = "?from=" + monday + "&to=" + monday;
        assertThat(days(member, range)).hasSize(1);

        jdbc.update("insert into public_holiday (day, name) values (?, ?)", monday, "Test tatili");
        try {
            assertThat(days(member, range)).isEmpty();
            // The frozen count on the request is untouched: only the display follows the calendar.
            assertThat(decimal(member.get("/api/leave/requests").body(), "businessDays"))
                    .isEqualByComparingTo("1");
        } finally {
            jdbc.update("delete from public_holiday where day = ?", monday);
        }

        assertThat(days(member, range)).hasSize(1);
    }

    @Test
    void shouldRequireASession() throws Exception {
        Session anonymous = new Session();

        assertThat(anonymous.get("/api/leave/days").statusCode()).isEqualTo(401);
    }

    private List<Day> days(Session session, String query) throws Exception {
        HttpResponse<String> response = session.get("/api/leave/days" + query);
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        Matcher matcher = DAY.matcher(response.body());
        List<Day> days = new ArrayList<>();
        while (matcher.find()) {
            days.add(new Day(matcher.group(1), matcher.group(2), matcher.group(3), matcher.group(4)));
        }
        return days;
    }
}

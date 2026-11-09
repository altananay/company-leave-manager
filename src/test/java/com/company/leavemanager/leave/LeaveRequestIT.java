package com.company.leavemanager.leave;

import com.company.leavemanager.leave.internal.LeaveAdjustment;
import com.company.leavemanager.leave.internal.LeaveAdjustmentRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.net.http.HttpResponse;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * AC-1, AC-2, AC-3, AC-5, AC-6 and AC-11 of spec 0004 against the real endpoints and PostgreSQL:
 * business days, the request rules at request and approval time, the lifecycle, the role-aware
 * lists, pagination and the session/CSRF contract.
 */
class LeaveRequestIT extends LeaveTestSupport {

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    LeaveAdjustmentRepository adjustments;

    @Test
    void shouldCountBusinessDaysWithoutWeekendsAndHolidays() throws Exception {
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);

        // A Friday-to-Monday range holds two working days; the weekend is not leave.
        LocalDate monday = nextMonday();
        HttpResponse<String> weekend = createLeave(member, "ANNUAL",
                monday.minusDays(3), monday, "hafta sonu");
        assertThat(weekend.statusCode()).as(weekend.body()).isEqualTo(201);
        assertThat(number(weekend.body(), "businessDays")).isEqualTo(2);

        // A public holiday inside the week is subtracted too: BR-4 reads the calendar table.
        LocalDate holiday = LocalDate.of(2030, 1, 2);   // a Wednesday
        jdbc.update("insert into public_holiday (day, name) values (?, ?)", holiday, "Test tatili");
        try {
            LocalDate weekStart = holiday.minusDays(2);
            HttpResponse<String> withHoliday = createLeave(member, "EXCUSE",
                    weekStart, weekStart.plusDays(4), "resmî tatil");
            assertThat(withHoliday.statusCode()).as(withHoliday.body()).isEqualTo(201);
            assertThat(number(withHoliday.body(), "businessDays")).isEqualTo(4);
        } finally {
            jdbc.update("delete from public_holiday where day = ?", holiday);
        }
    }

    @Test
    void shouldRejectPastStart() throws Exception {
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);

        HttpResponse<String> response = createLeave(member, "ANNUAL",
                today().minusDays(1), today().plusDays(1), "geçmiş");

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(errorCode(response)).isEqualTo("LEAVE_PAST_DATE");
    }

    @Test
    void shouldRejectOverlap() throws Exception {
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);
        LocalDate monday = nextMonday();
        assertThat(createLeave(member, "ANNUAL", monday, monday.plusDays(2), "ilk").statusCode())
                .isEqualTo(201);

        // The same dates overlap; so does a range that only shares its first day (BR-6).
        assertThat(errorCode(createLeave(member, "EXCUSE", monday, monday.plusDays(4), "ikinci")))
                .isEqualTo("LEAVE_OVERLAP");
        assertThat(errorCode(createLeave(member, "EXCUSE", monday.plusDays(2), monday.plusDays(6), "üçüncü")))
                .isEqualTo("LEAVE_OVERLAP");

        // The very next day after the first range does not overlap it.
        assertThat(createLeave(member, "EXCUSE", monday.plusDays(3), monday.plusDays(4), "sonraki").statusCode())
                .isEqualTo(201);
    }

    @Test
    void shouldRejectOverBalance() throws Exception {
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        // One completed year: 14 business days of entitlement, no carryover.
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);
        LocalDate monday = nextMonday();

        HttpResponse<String> tooLong = createLeave(member, "ANNUAL",
                monday, monday.plusDays(18), "çok uzun");

        assertThat(tooLong.statusCode()).isEqualTo(409);
        assertThat(errorCode(tooLong)).isEqualTo("LEAVE_BALANCE_EXCEEDED");
        // Nothing was written: the balance is untouched and the list is empty.
        assertThat(number(member.get("/api/leave/balance").body(), "remaining")).isEqualTo(14);
        assertThat(number(member.get("/api/leave/requests").body(), "total")).isZero();
    }

    @Test
    void shouldRecheckBalanceOnApproval() throws Exception {
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);
        Session managerSession = signIn(manager);
        LocalDate monday = nextMonday();
        HttpResponse<String> created = createLeave(member, "ANNUAL", monday, monday.plusDays(4), "beş gün");
        String requestId = extract(created.body(), "id");
        assertThat(number(member.get("/api/leave/balance").body(), "remaining")).isEqualTo(9);

        // The state can only be reached out of band (an HR correction made before the adjustment
        // guard existed): the approval must still refuse to leave the balance negative (BR-5).
        adjustments.save(LeaveAdjustment.of(employee.id(), -10, "kayıt dışı düzeltme",
                UUID.fromString(extract(session.get("/api/auth/me").body(), "id")), Instant.now()));

        HttpResponse<String> approval = approve(managerSession, requestId);

        assertThat(approval.statusCode()).isEqualTo(409);
        assertThat(errorCode(approval)).isEqualTo("LEAVE_BALANCE_EXCEEDED");
        // The request stays pending; the manager can reject it instead.
        HttpResponse<String> list = member.get("/api/leave/requests");
        assertThat(list.body()).contains("\"status\":\"PENDING\"");
    }

    @Test
    void shouldNotDeductExcuseLeave() throws Exception {
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);
        Session managerSession = signIn(manager);
        LocalDate monday = nextMonday();
        HttpResponse<String> created = createLeave(member, "EXCUSE", monday, monday.plusDays(2), "mazeret");
        assertThat(created.statusCode()).isEqualTo(201);

        // BR-9: an excuse leave is recorded and approved, but no annual day is consumed.
        assertThat(approve(managerSession, extract(created.body(), "id")).statusCode()).isEqualTo(200);

        String balance = member.get("/api/leave/balance").body();
        assertThat(number(balance, "entitlement")).isEqualTo(14);
        assertThat(number(balance, "approved")).isZero();
        assertThat(number(balance, "remaining")).isEqualTo(14);
    }

    @Test
    void shouldCancelBeforeStartAndRestoreBalance() throws Exception {
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);
        Session managerSession = signIn(manager);
        LocalDate monday = nextMonday();
        HttpResponse<String> created = createLeave(member, "ANNUAL", monday, monday.plusDays(2), "aile");
        String requestId = extract(created.body(), "id");

        // Pending already holds the days; approval moves them from pending to approved (BR-8).
        assertThat(number(member.get("/api/leave/balance").body(), "remaining")).isEqualTo(11);
        assertThat(approve(managerSession, requestId).statusCode()).isEqualTo(200);
        String approved = member.get("/api/leave/balance").body();
        assertThat(number(approved, "approved")).isEqualTo(3);
        assertThat(number(approved, "pending")).isZero();
        assertThat(number(approved, "remaining")).isEqualTo(11);

        HttpResponse<String> cancelled = cancel(member, requestId);

        assertThat(cancelled.statusCode()).as(cancelled.body()).isEqualTo(200);
        assertThat(cancelled.body()).contains("\"status\":\"CANCELLED\"");
        String afterCancel = member.get("/api/leave/balance").body();
        assertThat(number(afterCancel, "approved")).isZero();
        assertThat(number(afterCancel, "remaining")).isEqualTo(14);
    }

    @Test
    void shouldNotCancelAfterStart() throws Exception {
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);
        Session managerSession = signIn(manager);
        LocalDate monday = nextMonday();
        String requestId = extract(createLeave(member, "ANNUAL", monday, monday, "bugün").body(), "id");
        assertThat(approve(managerSession, requestId).statusCode()).isEqualTo(200);

        // Only a request that really started can be refused; the clock is not moved in a test, so the
        // stored start date takes the role of "the leave is under way".
        LocalDate yesterday = today().minusDays(1);
        jdbc.update("update leave_request set start_date = ?, end_date = ? where id = ?",
                yesterday, yesterday, UUID.fromString(requestId));

        HttpResponse<String> response = cancel(member, requestId);

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(errorCode(response)).isEqualTo("LEAVE_ALREADY_STARTED");
        assertThat(member.get("/api/leave/balance").body()).contains("\"approved\":1");
    }

    @Test
    void shouldNotDeductRejected() throws Exception {
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);
        Session managerSession = signIn(manager);
        LocalDate monday = nextMonday();
        String requestId = extract(createLeave(member, "ANNUAL", monday, monday.plusDays(2), "aile").body(), "id");

        HttpResponse<String> rejected = reject(managerSession, requestId, "dönem yoğun");

        assertThat(rejected.statusCode()).as(rejected.body()).isEqualTo(200);
        assertThat(rejected.body()).contains("\"status\":\"REJECTED\"");
        String balance = member.get("/api/leave/balance").body();
        assertThat(number(balance, "approved")).isZero();
        assertThat(number(balance, "pending")).isZero();
        assertThat(number(balance, "remaining")).isEqualTo(14);
    }

    @Test
    void shouldShowOwnList() throws Exception {
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Account other = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);
        Session otherMember = signIn(other);
        LocalDate monday = nextMonday();
        assertThat(createLeave(member, "ANNUAL", monday, monday, "bir").statusCode()).isEqualTo(201);
        assertThat(createLeave(member, "EXCUSE", monday.plusDays(3), monday.plusDays(3), "iki").statusCode())
                .isEqualTo(201);
        String otherRequest = extract(createLeave(otherMember, "ANNUAL", monday, monday, "başka").body(), "id");

        HttpResponse<String> list = member.get("/api/leave/requests");

        assertThat(list.statusCode()).isEqualTo(200);
        assertThat(number(list.body(), "total")).isEqualTo(2);
        assertThat(list.body()).doesNotContain(otherRequest);
        assertThat(list.body()).contains(employee.displayName());
        assertThat(list.body()).doesNotContain(other.displayName());
    }

    @Test
    void shouldShowTeamQueue() throws Exception {
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account otherManager = createAccount("MANAGER", null, null);
        Account first = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Account second = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Account stranger = createAccount("EMPLOYEE", otherManager.id(), today().minusYears(1));
        Session firstSession = signIn(first);
        Session secondSession = signIn(second);
        Session strangerSession = signIn(stranger);
        Session managerSession = signIn(manager);
        LocalDate monday = nextMonday();
        String firstRequest = extract(createLeave(firstSession, "ANNUAL", monday, monday, "bir").body(), "id");
        String secondRequest = extract(createLeave(secondSession, "EXCUSE", monday.plusDays(1), monday.plusDays(1), "iki").body(), "id");
        createLeave(strangerSession, "ANNUAL", monday, monday, "başka ekip");

        HttpResponse<String> queue = managerSession.get("/api/leave/queue");

        assertThat(queue.statusCode()).isEqualTo(200);
        // The queue is the direct reports' pending work, earliest start first: two, not three.
        assertThat(queue.body()).contains(firstRequest, secondRequest);
        assertThat(queue.body()).doesNotContain(stranger.displayName());

        // A manager with no reports has an empty queue; HR has no queue at all (BR-7).
        Account lonelyManager = createAccount("MANAGER", null, null);
        assertThat(signIn(lonelyManager).get("/api/leave/queue").body()).isEqualTo("[]");
        HttpResponse<String> hrQueue = session.get("/api/leave/queue");
        assertThat(hrQueue.statusCode()).isEqualTo(403);
        assertThat(errorCode(hrQueue)).isEqualTo("NOT_AUTHORIZED");
    }

    @Test
    void shouldShowAllToHrReadOnly() throws Exception {
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);
        LocalDate monday = nextMonday();
        String requestId = extract(createLeave(member, "ANNUAL", monday, monday, "izin").body(), "id");

        HttpResponse<String> all = session.get("/api/leave/requests?size=100");

        assertThat(all.statusCode()).isEqualTo(200);
        assertThat(all.body()).contains(requestId);
        assertThat(all.body()).contains(employee.displayName());

        // HR reads, never decides (BR-7): the endpoint answers but the rule refuses the decision.
        HttpResponse<String> forbidden = approve(session, requestId);
        assertThat(forbidden.statusCode()).isEqualTo(403);
        assertThat(errorCode(forbidden)).isEqualTo("LEAVE_NOT_MANAGER");

        Session ceo = new Session();
        assertThat(ceo.login(CEO_EMAIL, CEO_PASSWORD).statusCode()).isEqualTo(200);
        assertThat(ceo.get("/api/leave/requests?size=100").body()).contains(requestId);
        assertThat(errorCode(approve(ceo, requestId))).isEqualTo("LEAVE_NOT_MANAGER");
    }

    @Test
    void shouldPaginateTheList() throws Exception {
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);
        LocalDate monday = nextMonday();
        String first = extract(createLeave(member, "ANNUAL", monday, monday, "bir").body(), "id");
        String second = extract(createLeave(member, "EXCUSE", monday.plusDays(7), monday.plusDays(7), "iki").body(), "id");
        String third = extract(createLeave(member, "EXCUSE", monday.plusDays(14), monday.plusDays(14), "üç").body(), "id");

        HttpResponse<String> pageOne = member.get("/api/leave/requests?page=1&size=1");
        HttpResponse<String> pageTwo = member.get("/api/leave/requests?page=2&size=1");
        HttpResponse<String> pageThree = member.get("/api/leave/requests?page=3&size=1");

        assertThat(number(pageOne.body(), "total")).isEqualTo(3);
        assertThat(number(pageOne.body(), "totalPages")).isEqualTo(3);
        assertThat(number(pageOne.body(), "size")).isEqualTo(1);
        // Newest start first: the third request leads, the first one closes the list.
        assertThat(pageOne.body()).contains(third);
        assertThat(pageTwo.body()).contains(second);
        assertThat(pageThree.body()).contains(first);

        assertThat(errorCode(member.get("/api/leave/requests?page=0"))).isEqualTo("INVALID_PARAMETER");
        assertThat(errorCode(member.get("/api/leave/requests?size=101"))).isEqualTo("INVALID_PARAMETER");
    }

    @Test
    void shouldPreviewTheWorkingDaysAndTheRemainingBalance() throws Exception {
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);
        LocalDate monday = nextMonday();

        HttpResponse<String> preview = member.get("/api/leave/preview?startDate=" + monday
                + "&endDate=" + monday.plusDays(4) + "&type=ANNUAL");

        assertThat(preview.statusCode()).as(preview.body()).isEqualTo(200);
        assertThat(number(preview.body(), "businessDays")).isEqualTo(5);
        assertThat(number(preview.body(), "remainingAfter")).isEqualTo(9);

        // An excuse preview does not consume the balance.
        assertThat(number(member.get("/api/leave/preview?startDate=" + monday
                + "&endDate=" + monday.plusDays(4) + "&type=EXCUSE").body(), "remainingAfter"))
                .isEqualTo(14);
    }

    @Test
    void shouldLetHrAdjustTheBalance() throws Exception {
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);
        String hrId = extract(session.get("/api/auth/me").body(), "id");

        HttpResponse<String> adjusted = session.post("/api/leave/adjustments",
                "{\"employeeId\":\"" + employee.id() + "\",\"days\":3,\"reason\":\"geçmiş dönem düzeltmesi\"}");

        assertThat(adjusted.statusCode()).as(adjusted.body()).isEqualTo(200);
        assertThat(number(adjusted.body(), "adjustments")).isEqualTo(3);
        assertThat(number(adjusted.body(), "remaining")).isEqualTo(17);
        assertThat(hrId).isNotBlank();

        // The adjustment really moved the ceiling: 15 working days now fit.
        LocalDate monday = nextMonday();
        HttpResponse<String> fifteen = createLeave(member, "ANNUAL", monday, monday.plusDays(18), "on beş gün");
        assertThat(fifteen.statusCode()).as(fifteen.body()).isEqualTo(201);
        assertThat(number(fifteen.body(), "businessDays")).isEqualTo(15);
    }

    @Test
    void shouldRejectAnAdjustmentThatWouldGoNegativeOrHasNoReason() throws Exception {
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));

        HttpResponse<String> negative = session.post("/api/leave/adjustments",
                "{\"employeeId\":\"" + employee.id() + "\",\"days\":-20,\"reason\":\"fazla düzeltme\"}");
        assertThat(negative.statusCode()).isEqualTo(409);
        assertThat(errorCode(negative)).isEqualTo("LEAVE_ADJUSTMENT_NOT_ALLOWED");

        HttpResponse<String> noReason = session.post("/api/leave/adjustments",
                "{\"employeeId\":\"" + employee.id() + "\",\"days\":1,\"reason\":\"  \"}");
        assertThat(noReason.statusCode()).isEqualTo(400);
        assertThat(noReason.body()).contains("VALIDATION_FAILED");

        // Neither refusal wrote an adjustment.
        assertThat(number(session.get("/api/leave/balance?employeeId=" + employee.id()).body(), "adjustments"))
                .isZero();
    }

    @Test
    void shouldRequireASessionAndACsrfToken() throws Exception {
        Session anonymous = new Session();
        assertThat(anonymous.get("/api/leave/requests").statusCode()).isEqualTo(401);
        assertThat(anonymous.get("/api/leave/balance").statusCode()).isEqualTo(401);
        assertThat(anonymous.postWithoutCsrf("/api/leave/requests",
                "{\"type\":\"ANNUAL\",\"startDate\":\"2030-01-07\",\"endDate\":\"2030-01-07\"}")
                .statusCode()).isEqualTo(401);

        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);

        HttpResponse<String> withoutToken = member.postWithoutCsrf("/api/leave/requests",
                "{\"type\":\"ANNUAL\",\"startDate\":\"" + nextMonday()
                        + "\",\"endDate\":\"" + nextMonday() + "\"}");

        assertThat(withoutToken.statusCode()).isEqualTo(403);
        assertThat(errorCode(withoutToken)).isEqualTo("CSRF_INVALID");
        // The same request with the session and its token is accepted: the 403 was the CSRF check.
        assertThat(createLeave(member, "ANNUAL", nextMonday(), nextMonday(), "izin").statusCode())
                .isEqualTo(201);
    }
}

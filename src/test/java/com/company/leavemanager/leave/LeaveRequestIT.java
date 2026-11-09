package com.company.leavemanager.leave;

import com.company.leavemanager.leave.internal.LeaveAdjustment;
import com.company.leavemanager.leave.internal.LeaveAdjustmentRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;
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

        // A public holiday inside the week is subtracted too: BR-4 reads the calendar table. The
        // holiday is the Wednesday of the next clean week (N-02), not a fixed date whose weekday and
        // distance from a seeded holiday would have to be rechecked by hand — and the week after the
        // first request keeps the two ranges from overlapping (BR-6).
        LocalDate weekStart = monday.plusDays(7);
        LocalDate holiday = weekStart.plusDays(2);
        jdbc.update("insert into public_holiday (day, name) values (?, ?)", holiday, "Test tatili");
        try {
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
        adjustments.save(LeaveAdjustment.of(employee.id(), new BigDecimal("-10"), "kayıt dışı düzeltme",
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
        // The latest anniversary is ten days behind us, so "yesterday" is still inside the current
        // entitlement period: the day stays an approved day of this period, not a carryover debt.
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1).minusDays(10));
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

    @Test
    void shouldRefuseAnnualLeaveWithoutAHireDateAndGrantNoDays() throws Exception {
        // L-05: an unknown hire date is not a 14-day default. The balance is zero and an annual
        // request is refused until HR enters the date; an excuse leave still works.
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), null);
        Session member = signIn(employee);
        LocalDate monday = nextMonday();

        HttpResponse<String> annual = createLeave(member, "ANNUAL", monday, monday, "izin");

        assertThat(annual.statusCode()).isEqualTo(409);
        assertThat(errorCode(annual)).isEqualTo("LEAVE_NO_HIRE_DATE");
        String balance = member.get("/api/leave/balance").body();
        assertThat(number(balance, "entitlement")).isZero();
        assertThat(number(balance, "remaining")).isZero();
        assertThat(balance).contains("\"entitlementDefaulted\":true");

        HttpResponse<String> excuse = createLeave(member, "EXCUSE", monday, monday, "mazeret");
        assertThat(excuse.statusCode()).as(excuse.body()).isEqualTo(201);
    }

    @Test
    void shouldBoundExcuseLeaveAndRequireItsReason() throws Exception {
        // L-02: phase A has no BR-10 sub-types, so EXCUSE is bounded to five business days and always
        // carries a reason. Annual leave keeps its reason optional.
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);
        LocalDate monday = nextMonday();

        HttpResponse<String> withoutReason = createLeave(member, "EXCUSE", monday, monday.plusDays(4), "");
        assertThat(withoutReason.statusCode()).isEqualTo(400);
        assertThat(errorCode(withoutReason)).isEqualTo("LEAVE_REASON_REQUIRED");

        // Monday to Monday is six working days: one more than the bound.
        HttpResponse<String> tooLong = createLeave(member, "EXCUSE", monday, monday.plusDays(7), "uzun mazeret");
        assertThat(tooLong.statusCode()).isEqualTo(400);
        assertThat(errorCode(tooLong)).isEqualTo("LEAVE_EXCUSE_TOO_LONG");

        // Five working days with a reason is the allowed maximum.
        assertThat(createLeave(member, "EXCUSE", monday, monday.plusDays(4), "beş gün").statusCode())
                .isEqualTo(201);
        // An annual request without a reason is still valid: the reason requirement is EXCUSE's.
        assertThat(createLeave(member, "ANNUAL", monday.plusDays(7), monday.plusDays(7), "").statusCode())
                .as("annual leave keeps its optional reason")
                .isEqualTo(201);
    }

    @Test
    void shouldRejectARangeLongerThan366CalendarDays() throws Exception {
        // L-03: the range is capped before anything is counted, and 366 days is the maximum.
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(6));
        Session member = signIn(employee);
        LocalDate start = nextMonday();
        LocalDate lastAllowed = start.plusDays(365);

        HttpResponse<String> createTooLong = createLeave(member, "ANNUAL", start, lastAllowed.plusDays(1), "bir yıl");
        assertThat(createTooLong.statusCode()).isEqualTo(400);
        assertThat(errorCode(createTooLong)).isEqualTo("LEAVE_RANGE_TOO_LONG");

        HttpResponse<String> previewTooLong = member.get("/api/leave/preview?startDate=" + start
                + "&endDate=" + lastAllowed.plusDays(1) + "&type=ANNUAL");
        assertThat(previewTooLong.statusCode()).isEqualTo(400);
        assertThat(errorCode(previewTooLong)).isEqualTo("LEAVE_RANGE_TOO_LONG");

        // The 366-day range itself is accepted, and the count equals the database's own day-by-day
        // oracle (weekdays minus the holiday rows), so the arithmetic cannot drift from the data.
        HttpResponse<String> preview = member.get("/api/leave/preview?startDate=" + start
                + "&endDate=" + lastAllowed + "&type=EXCUSE");
        assertThat(preview.statusCode()).as(preview.body()).isEqualTo(200);
        Integer oracle = jdbc.queryForObject(
                "select count(*) from generate_series(?::date, ?::date, interval '1 day') as d "
                        + "where extract(isodow from d) < 6 "
                        + "and d::date not in (select day from public_holiday)",
                Integer.class, start.toString(), lastAllowed.toString());
        assertThat(number(preview.body(), "businessDays")).isEqualTo(oracle);
    }

    @Test
    void shouldRecordHrRetroactiveLeaveWithAReasonAndKeepTheExceptionForApproval() throws Exception {
        // L-06: BR-11's only exception is HR's recorded retroactive request. It needs its reason, it
        // is audited under its own event, and the manager can still approve it.
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(3));
        Session managerSession = signIn(manager);
        // A single retroactive day has to be a working day on any day of the year (N-02): a Saturday
        // or a seeded holiday would count zero business days and answer LEAVE_NO_WORKING_DAY.
        LocalDate past = workingDayDaysAgo(7);

        HttpResponse<String> noReason = createLeaveFor(session, employee.id(), "EXCUSE", past, past, "");
        assertThat(noReason.statusCode()).isEqualTo(400);
        assertThat(errorCode(noReason)).isEqualTo("LEAVE_RETROACTIVE_REASON_REQUIRED");

        HttpResponse<String> created = createLeaveFor(session, employee.id(), "EXCUSE", past, past,
                "rapor sonradan iletildi");
        assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
        assertThat(created.body()).contains("\"retroactive\":true");
        String requestId = extract(created.body(), "id");

        Integer audited = jdbc.queryForObject(
                "select count(*) from audit_event where event_type = 'LEAVE_RETROACTIVE_REQUESTED' "
                        + "and details like ?", Integer.class, "%" + requestId + "%");
        assertThat(audited).isEqualTo(1);

        // The approval-time past-date rule honours the recorded exception.
        assertThat(approve(managerSession, requestId).statusCode()).isEqualTo(200);

        // An ordinary employee cannot reach the exception: the same past range is refused.
        Session member = signIn(employee);
        HttpResponse<String> employeePast = createLeave(member, "EXCUSE", today().minusDays(2),
                today().minusDays(2), "geçmiş");
        assertThat(employeePast.statusCode()).isEqualTo(400);
        assertThat(errorCode(employeePast)).isEqualTo("LEAVE_PAST_DATE");
    }

    @Test
    void shouldKeepTheCancellationRecordApartFromTheDecision() throws Exception {
        // L-17: cancelling records its own actor and moment; the manager's decision stays intact and
        // the detail (the list response) shows the cancelling actor.
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);
        Session managerSession = signIn(manager);
        LocalDate monday = nextMonday();
        String requestId = extract(createLeave(member, "ANNUAL", monday, monday.plusDays(2), "aile").body(), "id");

        HttpResponse<String> approved = approve(managerSession, requestId);
        assertThat(approved.statusCode()).as(approved.body()).isEqualTo(200);
        java.sql.Timestamp decidedAt = jdbc.queryForObject(
                "select decided_at from leave_request where id = ?", java.sql.Timestamp.class,
                UUID.fromString(requestId));
        assertThat(decidedAt).isNotNull();

        assertThat(cancel(member, requestId).statusCode()).isEqualTo(200);

        // The stored decision timestamp is exactly what it was before the cancellation (L-17).
        java.sql.Timestamp stillDecidedAt = jdbc.queryForObject(
                "select decided_at from leave_request where id = ?", java.sql.Timestamp.class,
                UUID.fromString(requestId));
        assertThat(stillDecidedAt).isEqualTo(decidedAt);

        String listed = member.get("/api/leave/requests").body();
        assertThat(listed).contains("\"decidedByName\":\"" + manager.displayName() + "\"");
        assertThat(listed).contains("\"cancelledByName\":\"" + employee.displayName() + "\"");
        assertThat(extract(listed, "cancelledAt")).isNotBlank();
        assertThat(extract(listed, "decidedAt")).isNotBlank();
        assertThat(extract(listed, "cancelledAt")).isNotEqualTo(extract(listed, "decidedAt"));
    }

    @Test
    void shouldRejectADecisionNoteLongerThan500Characters() throws Exception {
        // L-16: the approve body is validated like the reject body.
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);
        Session managerSession = signIn(manager);
        LocalDate monday = nextMonday();
        String approveId = extract(createLeave(member, "ANNUAL", monday, monday, "bir").body(), "id");
        String rejectId = extract(createLeave(member, "EXCUSE", monday.plusDays(2), monday.plusDays(2), "iki").body(), "id");
        String tooLong = "x".repeat(501);

        HttpResponse<String> approveRefused = managerSession.post(
                "/api/leave/requests/" + approveId + "/approve", "{\"note\":\"" + tooLong + "\"}");
        assertThat(approveRefused.statusCode()).isEqualTo(400);
        assertThat(approveRefused.body()).contains("VALIDATION_FAILED");

        HttpResponse<String> rejectRefused = managerSession.post(
                "/api/leave/requests/" + rejectId + "/reject", "{\"note\":\"" + tooLong + "\"}");
        assertThat(rejectRefused.statusCode()).isEqualTo(400);
        assertThat(rejectRefused.body()).contains("VALIDATION_FAILED");
    }

    @Test
    void shouldKeepTheBalanceNonNegativeWhenHrEditsTheHireDate() throws Exception {
        // M-01, leave side: the org-edit guard is the leave module's own balance computation, so the
        // number on this screen can never be negative — the refused edit leaves it where it was.
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(2));
        Session member = signIn(employee);
        Session managerSession = signIn(manager);
        LocalDate monday = nextMonday();
        HttpResponse<String> created = createLeave(member, "ANNUAL", monday, monday.plusDays(11), "iki hafta");
        String requestId = extract(created.body(), "id");
        assertThat(approve(managerSession, requestId).statusCode()).isEqualTo(200);

        // N-02: the expected remainder is the request's own business-day count, not a hard-coded 18.
        // Two completed years fund 14 + 14 days (BR-1/BR-3) whatever day of the year CI runs on.
        String before = member.get("/api/leave/balance").body();
        int businessDays = number(created.body(), "businessDays");
        int funded = number(before, "entitlement") + number(before, "carryover");
        assertThat(number(before, "entitlement")).isEqualTo(14);
        assertThat(number(before, "carryover")).isEqualTo(14);
        assertThat(number(before, "approved")).isEqualTo(businessDays);
        assertThat(number(before, "remaining")).isEqualTo(funded - businessDays);

        HttpResponse<String> refused = session.patch("/api/users/" + employee.id(),
                "{\"managerId\":\"" + manager.id() + "\",\"hireDate\":\"" + today().minusMonths(1) + "\"}");

        assertThat(refused.statusCode()).as(refused.body()).isEqualTo(409);
        assertThat(errorCode(refused)).isEqualTo("USER_EDIT_WOULD_GO_NEGATIVE");
        String balance = member.get("/api/leave/balance").body();
        assertThat(number(balance, "remaining")).isEqualTo(funded - businessDays);
        assertThat(extract(balance, "hireDate")).isEqualTo(today().minusYears(2).toString());
        assertThat(number(balance, "remaining")).isGreaterThanOrEqualTo(0);
    }

    @Test
    void shouldRefuseAHireDateEditPastTheStartOfAnActiveExcuseLeave() throws Exception {
        // N-01: an excuse request is balance-free (BR-9), so the negative-balance guard cannot see
        // this edit at all. "İzin işe girişten önce başlayamaz" (docs/domain.md) has to refuse it on
        // its own — and the refusal leaves the row and the request exactly as they were.
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(2));
        LocalDate leaveDay = workingDayDaysAgo(7);
        HttpResponse<String> recorded = createLeaveFor(session, employee.id(), "EXCUSE",
                leaveDay, leaveDay, "rapor sonradan iletildi");
        assertThat(recorded.statusCode()).as(recorded.body()).isEqualTo(201);
        String requestId = extract(recorded.body(), "id");

        HttpResponse<String> refused = session.patch("/api/users/" + employee.id(),
                "{\"managerId\":\"" + manager.id() + "\",\"hireDate\":\"" + leaveDay.plusDays(1) + "\"}");

        assertThat(refused.statusCode()).as(refused.body()).isEqualTo(400);
        assertThat(errorCode(refused)).isEqualTo("INVALID_HIRE_DATE");
        assertThat(jdbc.queryForObject("select hire_date from users where id = ?", LocalDate.class,
                employee.id())).isEqualTo(today().minusYears(2));
        assertThat(session.get("/api/leave/requests?size=100").body()).contains(requestId);

        // The rule is the start, not hire-date edits as such: the leave's own day is accepted.
        HttpResponse<String> accepted = session.patch("/api/users/" + employee.id(),
                "{\"managerId\":\"" + manager.id() + "\",\"hireDate\":\"" + leaveDay + "\"}");
        assertThat(accepted.statusCode()).as(accepted.body()).isEqualTo(200);
        assertThat(extract(accepted.body(), "hireDate")).isEqualTo(leaveDay.toString());
    }

    @Test
    void shouldRefuseAHireDateEditPastTheStartOfAnActiveAnnualLeaveEvenWithAFundedBalance() throws Exception {
        // N-01: an annual request can leave a *positive* remainder after the edit, so
        // USER_EDIT_WOULD_GO_NEGATIVE would let this through. The +5-day adjustment funds the balance
        // under the candidate hire date (0 entitlement, 1 used day, +5) so only the leave's start can
        // refuse — and the same edit is accepted once that request is no longer active (rejected).
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(3));
        Session managerSession = signIn(manager);
        LocalDate leaveDay = workingDayDaysAgo(5);
        HttpResponse<String> recorded = createLeaveFor(session, employee.id(), "ANNUAL",
                leaveDay, leaveDay, "geçmiş dönem izni");
        assertThat(recorded.statusCode()).as(recorded.body()).isEqualTo(201);
        String requestId = extract(recorded.body(), "id");
        HttpResponse<String> adjusted = session.post("/api/leave/adjustments",
                "{\"employeeId\":\"" + employee.id() + "\",\"days\":5,\"reason\":\"geçmiş dönem düzeltmesi\"}");
        assertThat(adjusted.statusCode()).as(adjusted.body()).isEqualTo(200);
        assertThat(number(adjusted.body(), "remaining")).isGreaterThan(0);

        HttpResponse<String> refused = session.patch("/api/users/" + employee.id(),
                "{\"managerId\":\"" + manager.id() + "\",\"hireDate\":\"" + today() + "\"}");

        assertThat(refused.statusCode()).as(refused.body()).isEqualTo(400);
        assertThat(errorCode(refused)).isEqualTo("INVALID_HIRE_DATE");
        assertThat(jdbc.queryForObject("select hire_date from users where id = ?", LocalDate.class,
                employee.id())).isEqualTo(today().minusYears(3));

        // The same edit, with the request no longer active: accepted, so the refusal was the start.
        assertThat(reject(managerSession, requestId, "geçmiş kayıt düzeltildi").statusCode()).isEqualTo(200);
        HttpResponse<String> accepted = session.patch("/api/users/" + employee.id(),
                "{\"managerId\":\"" + manager.id() + "\",\"hireDate\":\"" + today() + "\"}");
        assertThat(accepted.statusCode()).as(accepted.body()).isEqualTo(200);
        assertThat(extract(accepted.body(), "hireDate")).isEqualTo(today().toString());
    }

    @Test
    void shouldRefuseARetroactiveRequestThatStartsBeforeTheHireDate() throws Exception {
        // M-06: even BR-11's HR exception cannot put leave before the employment started; the same
        // retroactive record inside the employment is still accepted.
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        // Two years ago is before the hire date on every day of the year, and the day itself has to be
        // a working day or the zero-day rule answers first (N-02).
        LocalDate beforeHire = workingDayYearsAgo(2);

        HttpResponse<String> refused = createLeaveFor(session, employee.id(), "EXCUSE",
                beforeHire, beforeHire, "işe girişten önce");

        assertThat(refused.statusCode()).as(refused.body()).isEqualTo(400);
        assertThat(errorCode(refused)).isEqualTo("LEAVE_INVALID_RANGE");

        LocalDate insideEmployment = workingDayDaysAgo(7);
        assertThat(createLeaveFor(session, employee.id(), "EXCUSE", insideEmployment, insideEmployment,
                "rapor sonradan iletildi").statusCode()).isEqualTo(201);
    }

    @Test
    void shouldAnswer400ForADateOutsideTheSupportedYears() throws Exception {
        // M-07: an extreme date is a data-entry error. Without the bound the range arithmetic
        // overflows and the endpoint answers 500 — a server fault for a client mistake.
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);

        HttpResponse<String> extremeCreate = createLeave(member, "EXCUSE",
                LocalDate.of(999999999, 12, 28), LocalDate.of(999999999, 12, 31), "aşırı");

        assertThat(extremeCreate.statusCode()).as(extremeCreate.body()).isEqualTo(400);
        assertThat(errorCode(extremeCreate)).isEqualTo("LEAVE_INVALID_RANGE");

        HttpResponse<String> extremePreview = member.get(
                "/api/leave/preview?startDate=" + nextMonday() + "&endDate=%2B999999999-12-31");

        assertThat(extremePreview.statusCode()).as(extremePreview.body()).isEqualTo(400);
        assertThat(errorCode(extremePreview)).isEqualTo("LEAVE_INVALID_RANGE");
    }

    @Test
    void shouldFreezeTheBusinessDayCountAtCreation() throws Exception {
        // L-08: business_days is frozen on purpose. A holiday added later must not rewrite a request
        // that was already created — the stored count, not a recalculation, is the record.
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);
        LocalDate start = nextMonday();
        LocalDate end = start.plusDays(2);
        HttpResponse<String> created = createLeave(member, "EXCUSE", start, end, "üç gün");
        String requestId = extract(created.body(), "id");
        assertThat(number(created.body(), "businessDays")).isEqualTo(3);

        LocalDate holiday = start.plusDays(1);
        jdbc.update("insert into public_holiday (day, name) values (?, ?)", holiday, "Sonradan eklenen tatil");
        try {
            // The form's preview sees the new holiday (it counts now) …
            assertThat(number(member.get("/api/leave/preview?startDate=" + start + "&endDate=" + end)
                    .body(), "businessDays")).isEqualTo(2);
            // … while the created request keeps the count it was created with.
            String listed = member.get("/api/leave/requests").body();
            assertThat(listed).contains("\"id\":\"" + requestId + "\"");
            assertThat(number(listed, "businessDays")).isEqualTo(3);
        } finally {
            jdbc.update("delete from public_holiday where day = ?", holiday);
        }
    }

    // ------------------------------------------------------------------ half day (B1)

    @Test
    void shouldCountAHalfDayAsHalfADay() throws Exception {
        // AC-12/D15: one working day, ANNUAL or EXCUSE, AM or PM → 0,5 business days, stored and
        // returned in the decimal unit; the pending balance drops by half a day.
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);
        LocalDate monday = nextMonday();

        HttpResponse<String> created = createLeave(member, "ANNUAL", monday, monday, "AM", "öğleden önce");

        assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
        assertThat(decimal(created.body(), "businessDays")).isEqualByComparingTo("0.5");
        assertThat(created.body()).contains("\"halfDay\":\"AM\"");
        String balance = member.get("/api/leave/balance").body();
        assertThat(decimal(balance, "pending")).isEqualByComparingTo("0.5");
        assertThat(decimal(balance, "remaining")).isEqualByComparingTo("13.5");
    }

    @Test
    void shouldTreatASecondHalfDayOnTheSameDayAsAnOverlap() throws Exception {
        // D15: BR-6 looks at the day, not the half. AM + PM on one date is still an overlap.
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);
        LocalDate monday = nextMonday();
        assertThat(createLeave(member, "ANNUAL", monday, monday, "AM", "sabah").statusCode()).isEqualTo(201);

        HttpResponse<String> pm = createLeave(member, "ANNUAL", monday, monday, "PM", "öğleden sonra");

        assertThat(pm.statusCode()).isEqualTo(409);
        assertThat(errorCode(pm)).isEqualTo("LEAVE_OVERLAP");
    }

    @Test
    void shouldRejectAHalfDayOverARange() throws Exception {
        // D15: a half day is a single-day selection; over a range it is a data-entry error.
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);
        LocalDate monday = nextMonday();

        HttpResponse<String> overRange = createLeave(member, "EXCUSE", monday, monday.plusDays(1), "PM", "iki gün");

        assertThat(overRange.statusCode()).as(overRange.body()).isEqualTo(400);
        assertThat(errorCode(overRange)).isEqualTo("LEAVE_HALF_DAY_INVALID");
        assertThat(number(member.get("/api/leave/requests").body(), "total")).isZero();
    }

    @Test
    void shouldRejectAHalfDayOnANonWorkingDay() throws Exception {
        // D15: the single day still has to be a working day; a weekend answers the existing code.
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);
        LocalDate saturday = nextMonday().plusDays(5);

        HttpResponse<String> weekend = createLeave(member, "ANNUAL", saturday, saturday, "AM", "hafta sonu");

        assertThat(weekend.statusCode()).as(weekend.body()).isEqualTo(400);
        assertThat(errorCode(weekend)).isEqualTo("LEAVE_NO_WORKING_DAY");
    }

    @Test
    void shouldPreviewAHalfDay() throws Exception {
        // AC-12: the form's summary carries the same 0,5 and the same remaining balance.
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);
        LocalDate monday = nextMonday();

        HttpResponse<String> preview = member.get("/api/leave/preview?startDate=" + monday
                + "&endDate=" + monday + "&type=ANNUAL&halfDay=AM");

        assertThat(preview.statusCode()).as(preview.body()).isEqualTo(200);
        assertThat(decimal(preview.body(), "businessDays")).isEqualByComparingTo("0.5");
        assertThat(decimal(preview.body(), "remainingAfter")).isEqualByComparingTo("13.5");

        // The preview refuses an invalid half-day selection exactly as create does.
        HttpResponse<String> overRange = member.get("/api/leave/preview?startDate=" + monday
                + "&endDate=" + monday.plusDays(1) + "&type=ANNUAL&halfDay=AM");
        assertThat(overRange.statusCode()).isEqualTo(400);
        assertThat(errorCode(overRange)).isEqualTo("LEAVE_HALF_DAY_INVALID");
    }

    @Test
    void shouldAdjustTheBalanceByHalfADay() throws Exception {
        // AC-12/D16: HR corrects the balance in half days and the answer is decimal too.
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));

        HttpResponse<String> adjusted = session.post("/api/leave/adjustments",
                "{\"employeeId\":\"" + employee.id() + "\",\"days\":0.5,\"reason\":\"yarım gün düzeltmesi\"}");

        assertThat(adjusted.statusCode()).as(adjusted.body()).isEqualTo(200);
        assertThat(decimal(adjusted.body(), "adjustments")).isEqualByComparingTo("0.5");
        assertThat(decimal(adjusted.body(), "remaining")).isEqualByComparingTo("14.5");
    }

    @Test
    void shouldRejectAnAdjustmentThatIsNotAHalfDayMultipleOrIsTooLarge() throws Exception {
        // D16: only half-day steps, within ±365 days. A finer fraction is a validation failure; a
        // fifth of a day (0.2) reaches the service's own rule; 366 days exceeds the cap.
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));

        HttpResponse<String> finerUnit = session.post("/api/leave/adjustments",
                "{\"employeeId\":\"" + employee.id() + "\",\"days\":0.2,\"reason\":\"çeyrek gün\"}");
        assertThat(finerUnit.statusCode()).isEqualTo(400);
        assertThat(errorCode(finerUnit)).isEqualTo("LEAVE_INVALID_ADJUSTMENT");

        HttpResponse<String> quarter = session.post("/api/leave/adjustments",
                "{\"employeeId\":\"" + employee.id() + "\",\"days\":0.25,\"reason\":\"çeyrek gün\"}");
        assertThat(quarter.statusCode()).isEqualTo(400);
        assertThat(quarter.body()).contains("VALIDATION_FAILED");

        HttpResponse<String> tooLarge = session.post("/api/leave/adjustments",
                "{\"employeeId\":\"" + employee.id() + "\",\"days\":366,\"reason\":\"bir yıldan fazla\"}");
        assertThat(tooLarge.statusCode()).isEqualTo(400);
        assertThat(errorCode(tooLarge)).isEqualTo("LEAVE_INVALID_ADJUSTMENT");

        // None of the refusals wrote an adjustment.
        assertThat(decimal(session.get("/api/leave/balance?employeeId=" + employee.id()).body(), "adjustments"))
                .isEqualByComparingTo("0");
    }

    @Test
    void shouldApproveAndCancelAHalfDayAndRestoreTheBalance() throws Exception {
        // AC-12/BR-8: approval moves the decimal day from pending to approved; cancellation gives
        // the same decimal amount back. No rounding anywhere.
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);
        Session managerSession = signIn(manager);
        LocalDate monday = nextMonday();
        String requestId = extract(createLeave(member, "ANNUAL", monday, monday, "PM", "öğleden sonra").body(), "id");

        assertThat(decimal(member.get("/api/leave/balance").body(), "pending")).isEqualByComparingTo("0.5");
        assertThat(approve(managerSession, requestId).statusCode()).isEqualTo(200);
        String approved = member.get("/api/leave/balance").body();
        assertThat(decimal(approved, "approved")).isEqualByComparingTo("0.5");
        assertThat(decimal(approved, "pending")).isEqualByComparingTo("0");
        assertThat(decimal(approved, "remaining")).isEqualByComparingTo("13.5");

        assertThat(cancel(member, requestId).statusCode()).isEqualTo(200);
        String restored = member.get("/api/leave/balance").body();
        assertThat(decimal(restored, "approved")).isEqualByComparingTo("0");
        assertThat(decimal(restored, "remaining")).isEqualByComparingTo("14");
    }
}

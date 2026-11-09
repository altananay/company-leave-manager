package com.company.leavemanager.leave;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.net.http.HttpResponse;
import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * AC-2's approval half (review round 1, L-01): the request-time rules are checked again when the
 * manager decides. A request can sit pending past its start (BR-11) or another request can be
 * created or approved in the meantime (BR-6), and neither may be approved silently.
 */
class LeaveApprovalRulesIT extends LeaveTestSupport {

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void shouldRejectAnApprovalWhoseStartIsInThePast() throws Exception {
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);
        Session managerSession = signIn(manager);
        LocalDate monday = nextMonday();
        String requestId = extract(createLeave(member, "ANNUAL", monday, monday.plusDays(1), "aile").body(), "id");

        // The manager only gets to the queue after the start date: the request was valid when it was
        // created and is not valid to approve any more. Only the database can move the date here.
        LocalDate past = today().minusDays(3);
        jdbc.update("update leave_request set start_date = ?, end_date = ? where id = ?",
                past, past.plusDays(1), UUID.fromString(requestId));

        HttpResponse<String> approval = approve(managerSession, requestId);

        assertThat(approval.statusCode()).isEqualTo(400);
        assertThat(errorCode(approval)).isEqualTo("LEAVE_PAST_DATE");
        // The request is still pending: the manager can reject it instead of leaving it stuck.
        assertThat(member.get("/api/leave/requests").body()).contains("\"status\":\"PENDING\"");
        assertThat(reject(managerSession, requestId, "başlangıç geçti").statusCode()).isEqualTo(200);
    }

    @Test
    void shouldRejectAnApprovalThatOverlapsAnotherActiveRequest() throws Exception {
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);
        Session managerSession = signIn(manager);
        LocalDate monday = nextMonday();
        String first = extract(createLeave(member, "ANNUAL", monday, monday.plusDays(2), "aile").body(), "id");
        String second = extract(createLeave(member, "EXCUSE", monday.plusDays(4), monday.plusDays(4), "mazeret").body(), "id");
        assertThat(approve(managerSession, first).statusCode()).isEqualTo(200);

        // The approved range then moved onto the pending one (again, a state only the database can
        // reach): the second approval now overlaps an active request.
        jdbc.update("update leave_request set start_date = ?, end_date = ? where id = ?",
                monday.plusDays(3), monday.plusDays(4), UUID.fromString(first));

        HttpResponse<String> approval = approve(managerSession, second);

        assertThat(approval.statusCode()).isEqualTo(409);
        assertThat(errorCode(approval)).isEqualTo("LEAVE_OVERLAP");
        assertThat(reject(managerSession, second, "çakışma").statusCode()).isEqualTo(200);
    }

    @Test
    void shouldApproveAPendingRequestThatOnlyOverlapsItself() throws Exception {
        // The overlap check at approval time must exclude the request being approved: a PENDING row
        // always overlaps its own range, so an unfiltered check would refuse every approval.
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);
        Session managerSession = signIn(manager);
        LocalDate monday = nextMonday();
        String requestId = extract(createLeave(member, "ANNUAL", monday, monday.plusDays(2), "aile").body(), "id");

        HttpResponse<String> approval = approve(managerSession, requestId);

        assertThat(approval.statusCode()).as(approval.body()).isEqualTo(200);
        assertThat(approval.body()).contains("\"status\":\"APPROVED\"");
    }
}

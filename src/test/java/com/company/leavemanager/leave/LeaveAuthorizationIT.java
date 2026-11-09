package com.company.leavemanager.leave;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.net.http.HttpResponse;
import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * AC-4 and BR-7: approval belongs to the direct manager alone. HR, the CEO and the employee's own
 * account are refused with 403 even when the org tree (wrongly) points at them, and an employee
 * without a manager cannot request leave at all.
 */
class LeaveAuthorizationIT extends LeaveTestSupport {

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void shouldLetOnlyTheDirectManagerDecide() throws Exception {
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account otherManager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);
        Session managerSession = signIn(manager);
        Session otherManagerSession = signIn(otherManager);
        LocalDate monday = nextMonday();
        String requestId = extract(createLeave(member, "ANNUAL", monday, monday, "izin").body(), "id");

        // A manager of another team is outside the request's scope, and the scoped load answers
        // exactly like a missing id (L-22). The employee and HR are stopped by a role gate that needs
        // no request at all, and the tree's manager alone decides.
        assertThat(errorCode(approve(otherManagerSession, requestId))).isEqualTo("NOT_FOUND");
        assertThat(errorCode(approve(member, requestId))).isEqualTo("LEAVE_NOT_MANAGER");
        assertThat(errorCode(reject(otherManagerSession, requestId, "başka ekip"))).isEqualTo("NOT_FOUND");

        HttpResponse<String> decided = approve(managerSession, requestId);

        assertThat(decided.statusCode()).as(decided.body()).isEqualTo(200);
        assertThat(decided.body()).contains("\"status\":\"APPROVED\"");
    }

    @Test
    void shouldRejectHrCeoAndSelf() throws Exception {
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);
        LocalDate monday = nextMonday();
        String requestId = extract(createLeave(member, "ANNUAL", monday, monday, "izin").body(), "id");
        String hrId = extract(session.get("/api/auth/me").body(), "id");

        Session ceo = new Session();
        assertThat(ceo.login(CEO_EMAIL, CEO_PASSWORD).statusCode()).isEqualTo(200);
        String ceoId = extract(ceo.get("/api/auth/me").body(), "id");

        // The tree is pointed at HR, then at the CEO: each is the direct manager on paper, and each
        // must still be refused (BR-7). Only the database can put such a row there — the admin API
        // refuses a non-manager — which is exactly the state this rule protects against.
        jdbc.update("update users set manager_id = ? where id = ?", UUID.fromString(hrId), employee.id());
        assertThat(errorCode(approve(session, requestId))).isEqualTo("LEAVE_NOT_MANAGER");
        assertThat(errorCode(reject(session, requestId, "İK onaylayamaz"))).isEqualTo("LEAVE_NOT_MANAGER");

        jdbc.update("update users set manager_id = ? where id = ?", UUID.fromString(ceoId), employee.id());
        assertThat(errorCode(approve(ceo, requestId))).isEqualTo("LEAVE_NOT_MANAGER");

        // The employee cannot approve their own request, even once the tree points back at a manager.
        jdbc.update("update users set manager_id = ? where id = ?", manager.id(), employee.id());
        assertThat(errorCode(approve(member, requestId))).isEqualTo("LEAVE_NOT_MANAGER");

        // The request survived every refusal and the real manager still decides it.
        assertThat(approve(signIn(manager), requestId).statusCode()).isEqualTo(200);
    }

    @Test
    void shouldRejectRequestWithoutManager() throws Exception {
        loginAsHr();
        Account employee = createAccount("EMPLOYEE", null, today().minusYears(1));
        Session member = signIn(employee);

        HttpResponse<String> response = createLeave(member, "ANNUAL", nextMonday(), nextMonday(), "izin");

        assertThat(response.statusCode()).isEqualTo(403);
        assertThat(errorCode(response)).isEqualTo("LEAVE_NO_MANAGER");

        // The balance screen knows why: no manager is assigned yet. The hire date is known, so the
        // annual entitlement is the ordinary 14 days; the request is refused for the missing link.
        String balance = member.get("/api/leave/balance").body();
        assertThat(balance).contains("\"hasManager\":false");
        assertThat(number(balance, "remaining")).isEqualTo(14);
    }

    @Test
    void shouldRejectADecisionOnARequestThatIsNotPending() throws Exception {
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);
        Session managerSession = signIn(manager);
        LocalDate monday = nextMonday();
        String requestId = extract(createLeave(member, "ANNUAL", monday, monday, "izin").body(), "id");
        assertThat(approve(managerSession, requestId).statusCode()).isEqualTo(200);

        // PENDING → APPROVED happened once; a second decision is refused (BR-8).
        HttpResponse<String> second = reject(managerSession, requestId, "geç kaldı");
        assertThat(second.statusCode()).isEqualTo(409);
        assertThat(errorCode(second)).isEqualTo("LEAVE_NOT_PENDING");

        // A rejection without a reason is not a decision at all.
        String pendingId = extract(createLeave(member, "EXCUSE", monday.plusDays(3), monday.plusDays(3), "mazeret").body(), "id");
        HttpResponse<String> emptyNote = managerSession.post(
                "/api/leave/requests/" + pendingId + "/reject", "{\"note\":\"\"}");
        assertThat(emptyNote.statusCode()).isEqualTo(400);
        assertThat(emptyNote.body()).contains("VALIDATION_FAILED");
    }

    @Test
    void shouldLetAManagerReadTheBalanceOfAReportAndNobodyElses() throws Exception {
        // L-14: docs/security.md says a manager reads their own subtree, so the balance endpoint
        // allows exactly that — and nothing outside it, which answers like a missing account (L-22).
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account otherManager = createAccount("MANAGER", null, null);
        Account report = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Account stranger = createAccount("EMPLOYEE", otherManager.id(), today().minusYears(1));
        Session managerSession = signIn(manager);
        Session reportSession = signIn(report);

        HttpResponse<String> ownReport = managerSession.get("/api/leave/balance?employeeId=" + report.id());
        assertThat(ownReport.statusCode()).as(ownReport.body()).isEqualTo(200);
        assertThat(ownReport.body()).contains("\"entitlementDefaulted\":false");

        HttpResponse<String> outside = managerSession.get("/api/leave/balance?employeeId=" + stranger.id());
        assertThat(outside.statusCode()).isEqualTo(404);
        assertThat(errorCode(outside)).isEqualTo("NOT_FOUND");

        HttpResponse<String> otherEmployee = reportSession.get("/api/leave/balance?employeeId=" + stranger.id());
        assertThat(otherEmployee.statusCode()).isEqualTo(404);
        assertThat(errorCode(otherEmployee)).isEqualTo("NOT_FOUND");
    }

    @Test
    void shouldAnswerNotFoundWhenARequestIsOutsideTheScope() throws Exception {
        // L-22: cancel loads the owner's row only; another employee's request answers like a missing
        // one, so the endpoint does not confirm that the id exists.
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Account stranger = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session member = signIn(employee);
        Session strangerSession = signIn(stranger);
        LocalDate monday = nextMonday();
        String requestId = extract(createLeave(member, "ANNUAL", monday, monday, "izin").body(), "id");
        assertThat(approve(signIn(manager), requestId).statusCode()).isEqualTo(200);

        HttpResponse<String> response = cancel(strangerSession, requestId);

        assertThat(response.statusCode()).isEqualTo(404);
        assertThat(errorCode(response)).isEqualTo("NOT_FOUND");

        HttpResponse<String> unknown = cancel(strangerSession, UUID.randomUUID().toString());
        assertThat(unknown.statusCode()).isEqualTo(404);
        assertThat(errorCode(unknown)).isEqualTo("NOT_FOUND");
    }
}

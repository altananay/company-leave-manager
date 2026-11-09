package com.company.leavemanager.leave;

import org.junit.jupiter.api.Test;

import java.net.http.HttpResponse;
import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * BR-12 and docs/security.md: the four roles against every new endpoint (review round 1, L-11).
 *
 * <p>Each gate is tested where it lives. The HTTP matrix proves the endpoint's answer; a role that
 * may not use an endpoint is refused by two independent checks — the path rule in
 * {@code SecurityConfig} and the service's own gate — and {@link LeaveServiceGateTest} proves the
 * service half on its own, so deleting either one fails a test.
 */
class LeaveAuthorizationMatrixIT extends LeaveTestSupport {


    private record Team(Account topManager, Account manager, Account employee, Account stranger) {
    }

    private Team team() throws Exception {
        Account topManager = createAccount("MANAGER", null, null);
        Account manager = createAccount("MANAGER", topManager.id(), today().minusYears(1));
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Account stranger = createAccount("EMPLOYEE", topManager.id(), today().minusYears(1));
        return new Team(topManager, manager, employee, stranger);
    }

    private Session ceo() throws Exception {
        Session ceo = new Session();
        assertThat(ceo.login(CEO_EMAIL, CEO_PASSWORD).statusCode()).isEqualTo(200);
        return ceo;
    }

    @Test
    void shouldLetEmployeeAndManagerCreateTheirOwnRequest() throws Exception {
        loginAsHr();
        Team team = team();
        LocalDate monday = nextMonday();
        Session employee = signIn(team.employee());
        Session manager = signIn(team.manager());
        Session ceo = ceo();

        assertThat(createLeave(employee, "ANNUAL", monday, monday, "izin").statusCode()).isEqualTo(201);
        assertThat(createLeave(manager, "ANNUAL", monday.plusDays(7), monday.plusDays(7), "izin").statusCode())
                .isEqualTo(201);
        // The seeded HR and CEO accounts have no manager: create refuses before anything else.
        assertThat(errorCode(createLeave(session, "ANNUAL", monday, monday, "izin"))).isEqualTo("LEAVE_NO_MANAGER");
        assertThat(errorCode(createLeave(ceo, "ANNUAL", monday, monday, "izin"))).isEqualTo("LEAVE_NO_MANAGER");
    }

    @Test
    void shouldReserveTheOnBehalfPathForHr() throws Exception {
        loginAsHr();
        Team team = team();
        Session employee = signIn(team.employee());
        Session manager = signIn(team.manager());
        Session ceo = ceo();
        LocalDate monday = nextMonday();

        // Only HR records a request for someone else (BR-11's exception path).
        assertThat(errorCode(createLeaveFor(employee, team.stranger().id(), "EXCUSE", monday, monday, "x")))
                .isEqualTo("NOT_AUTHORIZED");
        assertThat(errorCode(createLeaveFor(manager, team.employee().id(), "EXCUSE", monday, monday, "x")))
                .isEqualTo("NOT_AUTHORIZED");
        assertThat(errorCode(createLeaveFor(ceo, team.employee().id(), "EXCUSE", monday, monday, "x")))
                .isEqualTo("NOT_AUTHORIZED");
        assertThat(createLeaveFor(session, team.employee().id(), "EXCUSE", monday, monday, "İK kaydı").statusCode())
                .isEqualTo(201);
    }

    @Test
    void shouldScopeTheListToTheRolesView() throws Exception {
        loginAsHr();
        Team team = team();
        Session employee = signIn(team.employee());
        Session manager = signIn(team.manager());
        Session ceo = ceo();
        LocalDate monday = nextMonday();
        String own = extract(createLeave(employee, "ANNUAL", monday, monday, "izin").body(), "id");
        String teamMates = extract(createLeave(signIn(team.stranger()), "EXCUSE", monday.plusDays(2), monday.plusDays(2), "mazeret").body(), "id");

        String employeeList = employee.get("/api/leave/requests?size=100").body();
        assertThat(employeeList).contains(own);
        assertThat(employeeList).doesNotContain(teamMates);

        // A manager's read scope is the whole subtree (BR-12), so a report's request is visible.
        String managerList = manager.get("/api/leave/requests?size=100").body();
        assertThat(managerList).contains(own);
        assertThat(managerList).doesNotContain(teamMates);

        assertThat(session.get("/api/leave/requests?size=100").body()).contains(own, teamMates);
        assertThat(ceo.get("/api/leave/requests?size=100").body()).contains(own, teamMates);
    }

    @Test
    void shouldRefuseARequestWhenTheManagerCannotApprove() throws Exception {
        // L-12: the approver must be an active MANAGER. The admin API refuses to create these
        // states (it will not deactivate a manager who has reports), so only a direct row change
        // can produce them — which is exactly the data the request rule must not trust.
        loginAsHr();
        Team team = team();
        Session employee = signIn(team.employee());
        LocalDate monday = nextMonday();

        jdbc.update("update users set active = false where id = ?", team.manager().id());
        assertThat(errorCode(createLeave(employee, "ANNUAL", monday, monday, "izin")))
                .isEqualTo("LEAVE_NO_MANAGER");

        jdbc.update("update users set active = true where id = ?", team.manager().id());
        Account notAManager = createAccount("EMPLOYEE", team.manager().id(), today().minusYears(1));
        jdbc.update("update users set manager_id = ? where id = ?", notAManager.id(), team.employee().id());
        assertThat(errorCode(createLeave(employee, "ANNUAL", monday, monday, "izin")))
                .isEqualTo("LEAVE_NO_MANAGER");
    }

    @Test
    void shouldGateTheQueueToManagersOnly() throws Exception {
        loginAsHr();
        Team team = team();
        LocalDate monday = nextMonday();
        Session employee = signIn(team.employee());
        assertThat(createLeave(employee, "ANNUAL", monday, monday, "izin").statusCode()).isEqualTo(201);

        assertThat(signIn(team.manager()).get("/api/leave/queue").statusCode()).isEqualTo(200);
        // An employee, HR and the CEO have no queue (BR-7); the path rule and the service agree.
        assertThat(errorCode(employee.get("/api/leave/queue"))).isEqualTo("NOT_AUTHORIZED");
        assertThat(errorCode(session.get("/api/leave/queue"))).isEqualTo("NOT_AUTHORIZED");
        assertThat(errorCode(ceo().get("/api/leave/queue"))).isEqualTo("NOT_AUTHORIZED");
    }

    @Test
    void shouldGateTheBalanceByScope() throws Exception {
        loginAsHr();
        Team team = team();
        Session employee = signIn(team.employee());
        Session manager = signIn(team.manager());
        Session ceo = ceo();

        // Self, a manager's report, HR and the CEO may read; anybody else answers 404, not 403.
        assertThat(employee.get("/api/leave/balance").statusCode()).isEqualTo(200);
        assertThat(employee.get("/api/leave/balance?employeeId=" + team.employee().id()).statusCode()).isEqualTo(200);
        assertThat(manager.get("/api/leave/balance?employeeId=" + team.employee().id()).statusCode()).isEqualTo(200);
        assertThat(session.get("/api/leave/balance?employeeId=" + team.employee().id()).statusCode()).isEqualTo(200);
        assertThat(ceo.get("/api/leave/balance?employeeId=" + team.employee().id()).statusCode()).isEqualTo(200);

        assertThat(employee.get("/api/leave/balance?employeeId=" + team.stranger().id()).statusCode()).isEqualTo(404);
        assertThat(manager.get("/api/leave/balance?employeeId=" + team.stranger().id()).statusCode()).isEqualTo(404);
        // A report cannot read its manager's balance either: the scope is not symmetric.
        assertThat(employee.get("/api/leave/balance?employeeId=" + team.manager().id()).statusCode()).isEqualTo(404);
    }

    @Test
    void shouldGateTheQueueDecisionToTheDirectManagerAlone() throws Exception {
        loginAsHr();
        Team team = team();
        Session manager = signIn(team.manager());
        Session employee = signIn(team.employee());
        Session topManager = signIn(team.topManager());
        LocalDate monday = nextMonday();
        String requestId = extract(createLeave(employee, "ANNUAL", monday, monday, "izin").body(), "id");

        // The direct manager decides; the manager's own manager does not (the queue is direct only).
        assertThat(errorCode(approve(topManager, requestId))).isEqualTo("NOT_FOUND");

        // Self-manager: the link is pointed at the employee *after* a real request exists, because
        // M-05 now refuses to open one behind a self-link at all. The decision gate is what is left
        // to prove here: BR-7 never lets an account decide its own request (and the request stays
        // pending through both refusals).
        Account selfManager = createAccount("MANAGER", team.manager().id(), today().minusYears(1));
        Session selfSession = signIn(selfManager);
        String selfRequest = extract(
                createLeave(selfSession, "ANNUAL", monday.plusDays(1), monday.plusDays(1), "kendi").body(), "id");
        jdbc.update("update users set manager_id = ? where id = ?", selfManager.id(), selfManager.id());
        assertThat(errorCode(approve(selfSession, selfRequest))).isEqualTo("LEAVE_NOT_MANAGER");
        assertThat(errorCode(reject(selfSession, selfRequest, "kendi"))).isEqualTo("LEAVE_NOT_MANAGER");
        // M-05: the self-link cannot open a new request either — that would be an approve-your-own
        // request waiting to happen (LeaveAuthorizationIT proves the refusal).
        assertThat(errorCode(createLeave(selfSession, "ANNUAL", monday.plusDays(2), monday.plusDays(2), "yeni")))
                .isEqualTo("LEAVE_NO_MANAGER");

        // EMPLOYEE-as-manager: the tree points at an employee; the role gate refuses before loading.
        Account fakeLead = createAccount("EMPLOYEE", team.manager().id(), today().minusYears(1));
        Account report = createAccount("EMPLOYEE", team.manager().id(), today().minusYears(1));
        String reportRequest = extract(createLeave(signIn(report), "ANNUAL", monday.plusDays(3), monday.plusDays(3), "rapor").body(), "id");
        jdbc.update("update users set manager_id = ? where id = ?", fakeLead.id(), report.id());
        assertThat(errorCode(approve(signIn(fakeLead), reportRequest))).isEqualTo("LEAVE_NOT_MANAGER");

        // HR/CEO on paper: the tree points at a seeded account, and BR-7 still refuses it.
        Account hrTarget = createAccount("EMPLOYEE", team.manager().id(), today().minusYears(1));
        String hrRequest = extract(createLeave(signIn(hrTarget), "ANNUAL", monday.plusDays(7), monday.plusDays(7), "izin").body(), "id");
        String hrId = extract(session.get("/api/auth/me").body(), "id");
        jdbc.update("update users set manager_id = ? where id = ?", UUID.fromString(hrId), hrTarget.id());
        assertThat(errorCode(approve(session, hrRequest))).isEqualTo("LEAVE_NOT_MANAGER");

        Account ceoTarget = createAccount("EMPLOYEE", team.manager().id(), today().minusYears(1));
        String ceoRequest = extract(createLeave(signIn(ceoTarget), "ANNUAL", monday.plusDays(9), monday.plusDays(9), "izin").body(), "id");
        String ceoId = extract(ceo().get("/api/auth/me").body(), "id");
        jdbc.update("update users set manager_id = ? where id = ?", UUID.fromString(ceoId), ceoTarget.id());
        assertThat(errorCode(approve(ceo(), ceoRequest))).isEqualTo("LEAVE_NOT_MANAGER");

        // The real manager still decides the first request, so every refusal left it untouched.
        assertThat(approve(manager, requestId).statusCode()).isEqualTo(200);
    }

    @Test
    void shouldGateCancelToTheOwner() throws Exception {
        loginAsHr();
        Team team = team();
        Session employee = signIn(team.employee());
        Session manager = signIn(team.manager());
        LocalDate monday = nextMonday();
        String requestId = extract(createLeave(employee, "ANNUAL", monday, monday, "izin").body(), "id");
        assertThat(approve(manager, requestId).statusCode()).isEqualTo(200);

        // Neither the manager nor HR withdraws someone else's approved leave; the row is not loaded.
        assertThat(errorCode(cancel(manager, requestId))).isEqualTo("NOT_FOUND");
        assertThat(errorCode(cancel(session, requestId))).isEqualTo("NOT_FOUND");
        assertThat(cancel(employee, requestId).statusCode()).isEqualTo(200);
    }

    @Test
    void shouldGateAdjustmentsToHr() throws Exception {
        loginAsHr();
        Team team = team();
        Session manager = signIn(team.manager());
        Session employee = signIn(team.employee());
        Session ceo = ceo();
        String body = "{\"employeeId\":\"" + team.employee().id() + "\",\"days\":1,\"reason\":\"düzeltme\"}";

        assertThat(manager.post("/api/leave/adjustments", body).statusCode()).isEqualTo(403);
        assertThat(employee.post("/api/leave/adjustments", body).statusCode()).isEqualTo(403);
        assertThat(ceo.post("/api/leave/adjustments", body).statusCode()).isEqualTo(403);
        assertThat(session.post("/api/leave/adjustments", body).statusCode()).isEqualTo(200);

        // The refused calls wrote nothing: the balance still carries only the HR adjustment.
        String balance = employee.get("/api/leave/balance").body();
        assertThat(number(balance, "adjustments")).isEqualTo(1);
    }

    @Test
    void shouldLetEverySignedInRolePreview() throws Exception {
        loginAsHr();
        Team team = team();
        LocalDate monday = nextMonday();
        String query = "/api/leave/preview?startDate=" + monday + "&endDate=" + monday.plusDays(2) + "&type=ANNUAL";

        assertThat(signIn(team.employee()).get(query).statusCode()).isEqualTo(200);
        assertThat(signIn(team.manager()).get(query).statusCode()).isEqualTo(200);
        assertThat(session.get(query).statusCode()).isEqualTo(200);
        assertThat(ceo().get(query).statusCode()).isEqualTo(200);
        assertThat(new Session().get(query).statusCode()).isEqualTo(401);
    }
}

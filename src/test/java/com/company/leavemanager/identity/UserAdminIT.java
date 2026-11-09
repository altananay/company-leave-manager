package com.company.leavemanager.identity;

import com.company.leavemanager.identity.internal.Role;
import com.company.leavemanager.identity.internal.User;
import com.company.leavemanager.identity.internal.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.net.http.HttpResponse;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** AC-4, AC-5 and AC-6 of spec 0002: HR user administration and its restrictions. */
class UserAdminIT extends IdentityTestSupport {

    @Autowired
    UserRepository users;

    @Autowired
    PasswordEncoder encoder;

    @Autowired
    JdbcTemplate jdbc;

    @Test
    void shouldReturnTheTemporaryPasswordOnlyAtCreation() throws Exception {
        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);
        String email = unique("once");
        HttpResponse<String> created = session.post("/api/users", body(email, "Once Person", "EMPLOYEE"));
        assertThat(created.statusCode()).isEqualTo(201);

        // The list (and any later read) never carries the password again.
        HttpResponse<String> list = session.get("/api/users");

        assertThat(list.statusCode()).isEqualTo(200);
        assertThat(list.body()).doesNotContain("temporaryPassword");
        assertThat(list.body()).doesNotContain(extract(created.body(), "temporaryPassword"));
    }

    @Test
    void shouldReturnTheResetPasswordOnlyOnce() throws Exception {
        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);
        String email = unique("reset-once");
        HttpResponse<String> created = session.post("/api/users", body(email, "Reset Once", "EMPLOYEE"));
        String id = extract(created.body(), "id");

        HttpResponse<String> reset = session.post("/api/users/" + id + "/reset-password", "{}");
        assertThat(reset.statusCode()).isEqualTo(200);
        String resetPassword = extract(reset.body(), "temporaryPassword");
        assertThat(resetPassword).hasSize(16);

        // The reset password is shown once; no later read carries it.
        HttpResponse<String> list = session.get("/api/users");
        assertThat(list.statusCode()).isEqualTo(200);
        assertThat(list.body()).doesNotContain("temporaryPassword");
        assertThat(list.body()).doesNotContain(resetPassword);
    }

    @Test
    void shouldNotLetAManagerAdministerUsers() throws Exception {
        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);
        String email = unique("mgr-auth");
        HttpResponse<String> created = session.post("/api/users", body(email, "Manager Auth", "MANAGER"));
        String temporaryPassword = extract(created.body(), "temporaryPassword");

        Session manager = new Session();
        assertThat(manager.login(email, temporaryPassword).statusCode()).isEqualTo(200);
        assertThat(manager.post("/api/auth/password",
                "{\"currentPassword\":\"" + temporaryPassword + "\","
                        + "\"newPassword\":\"manager-pass-123\",\"confirmPassword\":\"manager-pass-123\"}")
                .statusCode()).isEqualTo(204);

        HttpResponse<String> forbidden = manager.get("/api/users");

        assertThat(forbidden.statusCode()).isEqualTo(403);
        assertThat(forbidden.body()).contains("NOT_AUTHORIZED");
    }

    @Test
    void shouldCreateAManagerAsWellAsAnEmployee() throws Exception {
        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);

        HttpResponse<String> created = session.post("/api/users", body(unique("mgr"), "Manager Person", "MANAGER"));

        assertThat(created.statusCode()).isEqualTo(201);
        assertThat(created.body()).contains("\"role\":\"MANAGER\"");
    }

    @Test
    void shouldCreateUserWithTemporaryPasswordAndForceChange() throws Exception {
        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);
        String email = unique("new");
        HttpResponse<String> created = session.post("/api/users", body(email, "New Person", "EMPLOYEE"));

        assertThat(created.statusCode()).isEqualTo(201);
        String temporaryPassword = extract(created.body(), "temporaryPassword");
        assertThat(temporaryPassword).hasSize(16);

        Session newcomer = new Session();
        HttpResponse<String> login = newcomer.login(email, temporaryPassword);
        assertThat(login.statusCode()).isEqualTo(200);
        assertThat(login.body()).contains("\"mustChangePassword\":true");

        HttpResponse<String> blocked = newcomer.get("/api/users");
        assertThat(blocked.statusCode()).isEqualTo(403);
        assertThat(blocked.body()).contains("PASSWORD_CHANGE_REQUIRED");

        HttpResponse<String> changed = newcomer.post("/api/auth/password",
                "{\"currentPassword\":\"" + temporaryPassword + "\","
                        + "\"newPassword\":\"brand-new-pass-123\",\"confirmPassword\":\"brand-new-pass-123\"}");
        assertThat(changed.statusCode()).isEqualTo(204);

        // The new password really was stored: it logs in, the old one does not.
        assertThat(new Session().login(email, "brand-new-pass-123").statusCode()).isEqualTo(200);
        assertThat(new Session().login(email, temporaryPassword).statusCode()).isEqualTo(401);

        // The password gate is gone; what remains is the ordinary authorization refusal.
        HttpResponse<String> after = newcomer.get("/api/users");
        assertThat(after.statusCode()).isEqualTo(403);
        assertThat(after.body()).contains("NOT_AUTHORIZED");
    }

    @Test
    void shouldRejectAWrongCurrentPasswordWhenChangingIt() throws Exception {
        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);
        String email = unique("current");
        HttpResponse<String> created = session.post("/api/users", body(email, "Current Person", "EMPLOYEE"));
        String temporaryPassword = extract(created.body(), "temporaryPassword");

        Session newcomer = new Session();
        assertThat(newcomer.login(email, temporaryPassword).statusCode()).isEqualTo(200);

        HttpResponse<String> rejected = newcomer.post("/api/auth/password",
                "{\"currentPassword\":\"not-the-current-one\","
                        + "\"newPassword\":\"brand-new-pass-123\",\"confirmPassword\":\"brand-new-pass-123\"}");

        // A wrong current password is a validation error, not a lost session (401 means "no session").
        assertThat(rejected.statusCode()).isEqualTo(400);
        assertThat(rejected.body()).contains("INVALID_PASSWORD");
        // The gate is still in place: the temporary password was not replaced.
        assertThat(newcomer.get("/api/users").statusCode()).isEqualTo(403);
    }

    @Test
    void shouldForceAPasswordChangeAfterAReset() throws Exception {
        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);
        String email = unique("resetforce");
        HttpResponse<String> created = session.post("/api/users", body(email, "Reset Force", "EMPLOYEE"));
        String id = extract(created.body(), "id");

        HttpResponse<String> reset = session.post("/api/users/" + id + "/reset-password", "{}");
        assertThat(reset.statusCode()).isEqualTo(200);
        assertThat(reset.body()).contains("\"mustChangePassword\":true");
        String newTemporaryPassword = extract(reset.body(), "temporaryPassword");

        Session target = new Session();
        HttpResponse<String> login = target.login(email, newTemporaryPassword);

        assertThat(login.statusCode()).isEqualTo(200);
        assertThat(login.body()).contains("\"mustChangePassword\":true");
        assertThat(target.get("/api/users").statusCode()).isEqualTo(403);
        assertThat(target.get("/api/users").body()).contains("PASSWORD_CHANGE_REQUIRED");
    }

    @Test
    void shouldEndSessionsWhenDeactivated() throws Exception {
        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);
        String email = unique("gone");
        HttpResponse<String> created = session.post("/api/users", body(email, "Gone Person", "EMPLOYEE"));
        String temporaryPassword = extract(created.body(), "temporaryPassword");
        String id = extract(created.body(), "id");

        Session target = new Session();
        assertThat(target.login(email, temporaryPassword).statusCode()).isEqualTo(200);
        assertThat(target.get("/api/auth/me").statusCode()).isEqualTo(200);

        assertThat(session.post("/api/users/" + id + "/deactivate", "{}").statusCode()).isEqualTo(204);

        assertThat(target.get("/api/auth/me").statusCode()).isEqualTo(401);
        assertThat(new Session().login(email, temporaryPassword).statusCode()).isEqualTo(401);
    }

    @Test
    void shouldRejectSelfActions() throws Exception {
        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);
        String myId = extract(session.get("/api/auth/me").body(), "id");

        HttpResponse<String> deactivate = session.post("/api/users/" + myId + "/deactivate", "{}");
        HttpResponse<String> reset = session.post("/api/users/" + myId + "/reset-password", "{}");

        assertThat(deactivate.statusCode()).isEqualTo(403);
        assertThat(deactivate.body()).contains("SELF_ACTION_NOT_ALLOWED");
        assertThat(reset.statusCode()).isEqualTo(403);
        assertThat(reset.body()).contains("SELF_ACTION_NOT_ALLOWED");
    }

    @Test
    void shouldProtectASeededHrAccountFromAnotherHr() throws Exception {
        // The only HR is the actor, so the self-action check would fire first; a second HR makes the
        // "seeded role" rule reachable (roles come from the environment, never from this API).
        String otherHrEmail = "hr2-" + System.nanoTime() + "@acme.test";
        User otherHr = seededRoleAccount(users, encoder, otherHrEmail, Role.HR, HR_PASSWORD);

        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);
        HttpResponse<String> deactivate =
                session.post("/api/users/" + otherHr.getId() + "/deactivate", "{}");
        HttpResponse<String> reset =
                session.post("/api/users/" + otherHr.getId() + "/reset-password", "{}");

        assertThat(deactivate.statusCode()).isEqualTo(403);
        assertThat(deactivate.body()).contains("PROTECTED_ACCOUNT");
        assertThat(reset.statusCode()).isEqualTo(403);
        assertThat(reset.body()).contains("PROTECTED_ACCOUNT");

        // The refusal left the account untouched: it still signs in with its password.
        assertThat(new Session().login(otherHrEmail, HR_PASSWORD).statusCode()).isEqualTo(200);
    }

    @Test
    void shouldNotLetHrTouchTheSeededAccounts() throws Exception {
        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);
        // The CEO is not the first row; find its id by e-mail through the API.
        String ceoRow = session.get("/api/users").body();
        int at = ceoRow.indexOf(CEO_EMAIL);
        assertThat(at).isGreaterThan(-1);
        String before = ceoRow.substring(0, at);
        String ceoId =
                before.substring(before.lastIndexOf("\"id\":\"") + 6, before.lastIndexOf("\"id\":\"") + 42);

        HttpResponse<String> deactivate = session.post("/api/users/" + ceoId + "/deactivate", "{}");
        HttpResponse<String> reset = session.post("/api/users/" + ceoId + "/reset-password", "{}");

        // The seeded HR/CEO accounts are managed by the environment, not by the admin screen (R-8).
        assertThat(deactivate.statusCode()).isEqualTo(403);
        assertThat(deactivate.body()).contains("PROTECTED_ACCOUNT");
        assertThat(reset.statusCode()).isEqualTo(403);
        assertThat(reset.body()).contains("PROTECTED_ACCOUNT");

        // The refusal really left the account alone: the CEO still signs in with its seeded password.
        assertThat(new Session().login(CEO_EMAIL, CEO_PASSWORD).statusCode()).isEqualTo(200);
    }

    @Test
    void shouldRejectHrAndCeoRoleAssignment() throws Exception {
        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);

        HttpResponse<String> hr = session.post("/api/users", body(unique("hr2"), "HR Two", "HR"));
        HttpResponse<String> ceo = session.post("/api/users", body(unique("ceo2"), "CEO Two", "CEO"));

        assertThat(hr.statusCode()).isEqualTo(403);
        assertThat(hr.body()).contains("ROLE_NOT_ASSIGNABLE");
        assertThat(ceo.statusCode()).isEqualTo(403);
        assertThat(ceo.body()).contains("ROLE_NOT_ASSIGNABLE");
    }

    @Test
    void shouldResetPasswordAndEndTheOldSession() throws Exception {
        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);
        String email = unique("reset");
        HttpResponse<String> created = session.post("/api/users", body(email, "Reset Person", "EMPLOYEE"));
        String id = extract(created.body(), "id");
        String firstPassword = extract(created.body(), "temporaryPassword");

        Session target = new Session();
        assertThat(target.login(email, firstPassword).statusCode()).isEqualTo(200);

        HttpResponse<String> reset = session.post("/api/users/" + id + "/reset-password", "{}");
        assertThat(reset.statusCode()).isEqualTo(200);
        String secondPassword = extract(reset.body(), "temporaryPassword");
        assertThat(secondPassword).isNotEqualTo(firstPassword);

        assertThat(target.get("/api/auth/me").statusCode()).isEqualTo(401);
        assertThat(new Session().login(email, secondPassword).statusCode()).isEqualTo(200);
        assertThat(new Session().login(email, firstPassword).statusCode()).isEqualTo(401);
    }

    private static String body(String email, String displayName, String role) {
        return "{\"email\":\"" + email + "\",\"displayName\":\"" + displayName + "\",\"role\":\"" + role + "\"}";
    }

    @Test
    void shouldStoreManagerAndHireDate() throws Exception {
        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);
        HttpResponse<String> manager = session.post("/api/users",
                body(unique("lead"), "Lead Person", "MANAGER"));
        assertThat(manager.statusCode()).isEqualTo(201);
        String managerId = extract(manager.body(), "id");
        String email = unique("staff");

        HttpResponse<String> created = session.post("/api/users",
                "{\"email\":\"" + email + "\",\"displayName\":\"Staff Person\",\"role\":\"EMPLOYEE\","
                        + "\"managerId\":\"" + managerId + "\",\"hireDate\":\"2020-02-03\"}");

        assertThat(created.statusCode()).isEqualTo(201);
        assertThat(extract(created.body(), "managerId")).isEqualTo(managerId);
        assertThat(extract(created.body(), "hireDate")).isEqualTo("2020-02-03");

        // The list carries both fields too: the screen resolves the manager's name from it.
        String list = session.get("/api/users").body();
        assertThat(list).contains("\"managerId\":\"" + managerId + "\"");
        assertThat(list).contains("\"hireDate\":\"2020-02-03\"");
    }

    @Test
    void shouldKeepManagerAndHireDateOptional() throws Exception {
        // AC-8's backward compatibility: an account made without them keeps both fields null, and
        // the response says so instead of inventing a value.
        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);

        HttpResponse<String> created = session.post("/api/users", body(unique("plain"), "Plain Person", "EMPLOYEE"));

        assertThat(created.statusCode()).isEqualTo(201);
        assertThat(created.body()).contains("\"managerId\":null");
        assertThat(created.body()).contains("\"hireDate\":null");
    }

    @Test
    void shouldUpdateManagerAndHireDate() throws Exception {
        // L-04: HR backfills the org data of an existing account; the pair is replaced on every call
        // and a null clears it. There is no bulk migration — one account at a time.
        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);
        HttpResponse<String> manager = session.post("/api/users", body(unique("patch-lead"), "Patch Lead", "MANAGER"));
        String managerId = extract(manager.body(), "id");
        HttpResponse<String> employee = session.post("/api/users", body(unique("patch"), "Patch Person", "EMPLOYEE"));
        String employeeId = extract(employee.body(), "id");
        assertThat(extract(employee.body(), "managerId")).isNull();

        HttpResponse<String> updated = session.patch("/api/users/" + employeeId,
                "{\"managerId\":\"" + managerId + "\",\"hireDate\":\"2019-05-06\"}");

        assertThat(updated.statusCode()).as(updated.body()).isEqualTo(200);
        assertThat(extract(updated.body(), "managerId")).isEqualTo(managerId);
        assertThat(extract(updated.body(), "hireDate")).isEqualTo("2019-05-06");
        String list = session.get("/api/users").body();
        assertThat(list).contains("\"id\":\"" + employeeId + "\"");
        assertThat(list).contains("\"managerId\":\"" + managerId + "\"");
        assertThat(list).contains("\"hireDate\":\"2019-05-06\"");

        HttpResponse<String> cleared = session.patch("/api/users/" + employeeId,
                "{\"managerId\":null,\"hireDate\":null}");

        assertThat(cleared.statusCode()).as(cleared.body()).isEqualTo(200);
        assertThat(cleared.body()).contains("\"managerId\":null");
        assertThat(cleared.body()).contains("\"hireDate\":null");
    }

    @Test
    void shouldAuditTheManagerAndHireDateEdit() throws Exception {
        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);
        HttpResponse<String> manager = session.post("/api/users", body(unique("audit-lead"), "Audit Lead", "MANAGER"));
        String managerId = extract(manager.body(), "id");
        HttpResponse<String> employee = session.post("/api/users", body(unique("audit"), "Audit Person", "EMPLOYEE"));
        String employeeId = extract(employee.body(), "id");

        assertThat(session.patch("/api/users/" + employeeId,
                "{\"managerId\":\"" + managerId + "\",\"hireDate\":\"2020-02-03\"}").statusCode())
                .isEqualTo(200);

        // One event, and its jsonb states answer both sides of the change (BR-13, L-15).
        assertThat(jdbc.queryForObject(
                "select count(*) from audit_event where event_type = 'USER_UPDATED' and target_user_id = ?",
                Integer.class, UUID.fromString(employeeId))).isEqualTo(1);
        assertThat(jdbc.queryForObject(
                "select after_state->>'managerId' from audit_event where event_type = 'USER_UPDATED' "
                        + "and target_user_id = ?", String.class, UUID.fromString(employeeId)))
                .isEqualTo(managerId);
        assertThat(jdbc.queryForObject(
                "select after_state->>'hireDate' from audit_event where event_type = 'USER_UPDATED' "
                        + "and target_user_id = ?", String.class, UUID.fromString(employeeId)))
                .isEqualTo("2020-02-03");
        assertThat(jdbc.queryForObject(
                "select before_state->>'managerId' from audit_event where event_type = 'USER_UPDATED' "
                        + "and target_user_id = ?", String.class, UUID.fromString(employeeId)))
                .isNull();
    }

    @Test
    void shouldRejectANonHrManagerEdit() throws Exception {
        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);
        String email = unique("patch-mgr");
        HttpResponse<String> created = session.post("/api/users", body(email, "Patch Manager", "MANAGER"));
        String temporaryPassword = extract(created.body(), "temporaryPassword");
        String id = extract(created.body(), "id");

        Session manager = new Session();
        assertThat(manager.login(email, temporaryPassword).statusCode()).isEqualTo(200);
        assertThat(manager.post("/api/auth/password",
                "{\"currentPassword\":\"" + temporaryPassword + "\","
                        + "\"newPassword\":\"manager-pass-123\",\"confirmPassword\":\"manager-pass-123\"}")
                .statusCode()).isEqualTo(204);

        HttpResponse<String> forbidden = manager.patch("/api/users/" + id,
                "{\"managerId\":null,\"hireDate\":\"2020-02-03\"}");

        assertThat(forbidden.statusCode()).isEqualTo(403);
        assertThat(forbidden.body()).contains("NOT_AUTHORIZED");
    }

    @Test
    void shouldRefuseToDeactivateAManagerWithActiveReports() throws Exception {
        // L-12: a request must never be left without an approver. HR clears the reports first.
        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);
        HttpResponse<String> manager = session.post("/api/users", body(unique("held-lead"), "Held Lead", "MANAGER"));
        String managerId = extract(manager.body(), "id");
        HttpResponse<String> report = session.post("/api/users",
                "{\"email\":\"" + unique("held") + "\",\"displayName\":\"Held Report\","
                        + "\"role\":\"EMPLOYEE\",\"managerId\":\"" + managerId + "\"}");
        String reportId = extract(report.body(), "id");

        HttpResponse<String> refused = session.post("/api/users/" + managerId + "/deactivate", "{}");

        assertThat(refused.statusCode()).isEqualTo(409);
        assertThat(refused.body()).contains("MANAGER_HAS_REPORTS");
        assertThat(session.get("/api/users").body()).contains("\"id\":\"" + managerId + "\"");
        assertThat(session.get("/api/users").body()).contains("\"active\":true");

        // Once the report has another manager (here: none), the deactivation goes through.
        assertThat(session.patch("/api/users/" + reportId, "{\"managerId\":null,\"hireDate\":null}")
                .statusCode()).isEqualTo(200);
        assertThat(session.post("/api/users/" + managerId + "/deactivate", "{}").statusCode()).isEqualTo(204);
    }

    @Test
    void shouldRejectACycleInTheManagerEdit() throws Exception {
        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);
        HttpResponse<String> top = session.post("/api/users", body(unique("cycle-top"), "Cycle Top", "MANAGER"));
        String topId = extract(top.body(), "id");
        HttpResponse<String> middle = session.post("/api/users",
                "{\"email\":\"" + unique("cycle-mid") + "\",\"displayName\":\"Cycle Mid\","
                        + "\"role\":\"MANAGER\",\"managerId\":\"" + topId + "\"}");
        String middleId = extract(middle.body(), "id");

        // Top → Middle would close the loop; Top → Top is the same mistake in one row.
        assertThat(errorCodeOf(session.patch("/api/users/" + topId,
                "{\"managerId\":\"" + middleId + "\",\"hireDate\":null}"))).isEqualTo("INVALID_MANAGER");
        assertThat(errorCodeOf(session.patch("/api/users/" + topId,
                "{\"managerId\":\"" + topId + "\",\"hireDate\":null}"))).isEqualTo("INVALID_MANAGER");
        // An employee can never be a manager either: BR-7 would have no approver.
        HttpResponse<String> employee = session.post("/api/users", body(unique("cycle-emp"), "Cycle Emp", "EMPLOYEE"));
        assertThat(errorCodeOf(session.patch("/api/users/" + topId,
                "{\"managerId\":\"" + extract(employee.body(), "id") + "\",\"hireDate\":null}")))
                .isEqualTo("INVALID_MANAGER");
    }

    private static String errorCodeOf(HttpResponse<String> response) {
        return extract(response.body(), "code");
    }

    @Test
    void shouldRejectAManagerWhoCouldNeverApprove() throws Exception {        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);

        // BR-7: an employee cannot be a request's approver, and HR/CEO never approve at all.
        HttpResponse<String> employee = session.post("/api/users", body(unique("plain"), "Plain Person", "EMPLOYEE"));
        String employeeId = extract(employee.body(), "id");
        HttpResponse<String> reportToEmployee = session.post("/api/users",
                "{\"email\":\"" + unique("report") + "\",\"displayName\":\"Report Person\","
                        + "\"role\":\"EMPLOYEE\",\"managerId\":\"" + employeeId + "\"}");
        assertThat(reportToEmployee.statusCode()).isEqualTo(400);
        assertThat(reportToEmployee.body()).contains("INVALID_MANAGER");

        User hr = seededRoleAccount(users, encoder, "hr-manager-" + System.nanoTime() + "@acme.test",
                Role.HR, HR_PASSWORD);
        HttpResponse<String> reportToHr = session.post("/api/users",
                "{\"email\":\"" + unique("report") + "\",\"displayName\":\"Report Person\","
                        + "\"role\":\"EMPLOYEE\",\"managerId\":\"" + hr.getId() + "\"}");
        assertThat(reportToHr.statusCode()).isEqualTo(400);
        assertThat(reportToHr.body()).contains("INVALID_MANAGER");
    }

    private static String unique(String prefix) {
        return prefix + "-" + System.nanoTime() + "@acme.test";
    }
}

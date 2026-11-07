package com.company.leavemanager.identity;

import com.company.leavemanager.identity.internal.Role;
import com.company.leavemanager.identity.internal.User;
import com.company.leavemanager.identity.internal.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.net.http.HttpResponse;

import static org.assertj.core.api.Assertions.assertThat;

/** AC-4, AC-5 and AC-6 of spec 0002: HR user administration and its restrictions. */
class UserAdminIT extends IdentityTestSupport {

    @Autowired
    UserRepository users;

    @Autowired
    PasswordEncoder encoder;

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

    private static String unique(String prefix) {
        return prefix + "-" + System.nanoTime() + "@acme.test";
    }
}

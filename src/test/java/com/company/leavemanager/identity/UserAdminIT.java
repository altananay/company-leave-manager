package com.company.leavemanager.identity;

import org.junit.jupiter.api.Test;

import java.net.http.HttpResponse;

import static org.assertj.core.api.Assertions.assertThat;

/** AC-4, AC-5 and AC-6 of spec 0002: HR user administration and its restrictions. */
class UserAdminIT extends IdentityTestSupport {

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

        // The password gate is gone; what remains is the ordinary authorization refusal.
        HttpResponse<String> after = newcomer.get("/api/users");
        assertThat(after.statusCode()).isEqualTo(403);
        assertThat(after.body()).contains("NOT_AUTHORIZED");
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

        assertThat(session.post("/api/users/" + myId + "/deactivate", "{}").statusCode()).isEqualTo(403);
        assertThat(session.post("/api/users/" + myId + "/reset-password", "{}").statusCode()).isEqualTo(403);
    }

    @Test
    void shouldRejectHrAndCeoRoleAssignment() throws Exception {
        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);

        assertThat(session.post("/api/users", body(unique("hr2"), "HR Two", "HR")).statusCode()).isEqualTo(403);
        assertThat(session.post("/api/users", body(unique("ceo2"), "CEO Two", "CEO")).statusCode()).isEqualTo(403);
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

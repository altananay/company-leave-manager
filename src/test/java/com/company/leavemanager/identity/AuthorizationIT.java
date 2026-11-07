package com.company.leavemanager.identity;

import org.junit.jupiter.api.Test;

import java.net.http.HttpResponse;

import static org.assertj.core.api.Assertions.assertThat;

/** AC-6 and AC-7 of spec 0002: default deny, 401 vs 403, and the public health endpoint. */
class AuthorizationIT extends IdentityTestSupport {

    @Test
    void shouldReturn401WithoutSession() throws Exception {
        assertThat(session.get("/api/users").statusCode()).isEqualTo(401);
        assertThat(session.get("/api/auth/me").statusCode()).isEqualTo(401);
    }

    @Test
    void shouldKeepHealthPublic() throws Exception {
        assertThat(session.get("/api/health").statusCode()).isEqualTo(200);
    }

    @Test
    void shouldReturn403ForWrongRole() throws Exception {
        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);
        String email = "employee-" + System.nanoTime() + "@acme.test";
        HttpResponse<String> created = session.post("/api/users",
                "{\"email\":\"" + email + "\",\"displayName\":\"Emp\",\"role\":\"EMPLOYEE\"}");
        String temporaryPassword = extract(created.body(), "temporaryPassword");

        Session employee = new Session();
        assertThat(employee.login(email, temporaryPassword).statusCode()).isEqualTo(200);
        assertThat(employee.post("/api/auth/password",
                "{\"currentPassword\":\"" + temporaryPassword + "\","
                        + "\"newPassword\":\"employee-pass-123\",\"confirmPassword\":\"employee-pass-123\"}")
                .statusCode()).isEqualTo(204);

        HttpResponse<String> forbidden = employee.get("/api/users");

        assertThat(forbidden.statusCode()).isEqualTo(403);
        assertThat(forbidden.body()).contains("NOT_AUTHORIZED");
    }

    @Test
    void shouldRejectCeoWrite() throws Exception {
        assertThat(session.login(CEO_EMAIL, CEO_PASSWORD).statusCode()).isEqualTo(200);

        HttpResponse<String> response = session.post("/api/users",
                "{\"email\":\"someone@acme.test\",\"displayName\":\"Someone\",\"role\":\"EMPLOYEE\"}");

        assertThat(response.statusCode()).isEqualTo(403);
    }

    @Test
    void shouldLetCeoChangeItsOwnPassword() throws Exception {
        assertThat(session.login(CEO_EMAIL, CEO_PASSWORD).statusCode()).isEqualTo(200);

        // Self-service is not a business write: the endpoint is reachable, the wrong current
        // password is a validation error (400), not a refusal (403).
        HttpResponse<String> response = session.post("/api/auth/password",
                "{\"currentPassword\":\"not-the-current-one\","
                        + "\"newPassword\":\"ceo-new-password-123\",\"confirmPassword\":\"ceo-new-password-123\"}");

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.body()).contains("INVALID_PASSWORD");
    }

    @Test
    void shouldDenyUnknownApiPathsByDefault() throws Exception {
        // Anonymous: 401. An unlisted endpoint must not be reachable just because a session exists.
        assertThat(session.get("/api/unknown-endpoint").statusCode()).isEqualTo(401);
    }

    @Test
    void shouldDenyUnknownApiPathsEvenWithASession() throws Exception {
        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);

        // A new endpoint that nobody listed in SecurityConfig stays closed for every role.
        assertThat(session.get("/api/unknown-endpoint").statusCode()).isEqualTo(403);
    }

    @Test
    void shouldDenyNonApiPathsByDefault() throws Exception {
        // Default deny covers everything the SPA shell does not need (docs/security.md).
        assertThat(session.get("/internal/secret").statusCode()).isEqualTo(401);

        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);

        assertThat(session.get("/internal/secret").statusCode()).isEqualTo(403);
        assertThat(session.get("/").statusCode()).isEqualTo(200);
    }
}

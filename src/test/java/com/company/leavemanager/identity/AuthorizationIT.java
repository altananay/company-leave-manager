package com.company.leavemanager.identity;

import com.company.leavemanager.identity.internal.Role;
import com.company.leavemanager.identity.internal.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.net.http.HttpResponse;

import static org.assertj.core.api.Assertions.assertThat;

/** AC-6 and AC-7 of spec 0002: default deny, 401 vs 403, and the public health endpoint. */
class AuthorizationIT extends IdentityTestSupport {

    @Autowired
    UserRepository users;

    @Autowired
    PasswordEncoder encoder;

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
        // The code proves the refusal is the role rule, not a CSRF failure (also 403).
        assertThat(response.body()).contains("NOT_AUTHORIZED");
    }

    @Test
    void shouldRejectEveryCeoBusinessWrite() throws Exception {
        assertThat(session.login(CEO_EMAIL, CEO_PASSWORD).statusCode()).isEqualTo(200);
        String email = "ceo-target-" + System.nanoTime() + "@acme.test";

        // Every write endpoint of this slice refuses the CEO with the role code.
        assertThat(session.post("/api/users", "{\"email\":\"" + email + "\","
                + "\"displayName\":\"Target\",\"role\":\"EMPLOYEE\"}").body())
                .contains("NOT_AUTHORIZED");
        assertThat(session.post("/api/users/00000000-0000-0000-0000-000000000001/deactivate", "{}").body())
                .contains("NOT_AUTHORIZED");
        assertThat(session.post("/api/users/00000000-0000-0000-0000-000000000001/reset-password", "{}").body())
                .contains("NOT_AUTHORIZED");
    }

    @Test
    void shouldLetCeoChangeItsOwnPassword() throws Exception {
        // A second CEO keeps the seeded account's password stable for the other tests; the role rule
        // is the same, and the change is exercised positively end to end.
        String email = "ceo2-" + System.nanoTime() + "@acme.test";
        seededRoleAccount(users, encoder, email, Role.CEO, CEO_PASSWORD);

        Session ceo = new Session();
        assertThat(ceo.login(email, CEO_PASSWORD).statusCode()).isEqualTo(200);

        HttpResponse<String> changed = ceo.post("/api/auth/password",
                "{\"currentPassword\":\"" + CEO_PASSWORD + "\","
                        + "\"newPassword\":\"ceo-new-password-123\",\"confirmPassword\":\"ceo-new-password-123\"}");

        assertThat(changed.statusCode()).isEqualTo(204);
        // Self-service really works: the new password signs in, the old one does not.
        assertThat(new Session().login(email, "ceo-new-password-123").statusCode()).isEqualTo(200);
        assertThat(new Session().login(email, CEO_PASSWORD).statusCode()).isEqualTo(401);
    }

    @Test
    void shouldAnswer400ForAWrongCurrentPasswordAsCeo() throws Exception {
        assertThat(session.login(CEO_EMAIL, CEO_PASSWORD).statusCode()).isEqualTo(200);

        // Not a 403: the endpoint is open to the CEO, the credential is simply wrong.
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

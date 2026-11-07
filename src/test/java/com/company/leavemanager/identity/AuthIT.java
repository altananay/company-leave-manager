package com.company.leavemanager.identity;

import com.company.leavemanager.identity.internal.SessionInvalidator;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.net.http.HttpResponse;

import static org.assertj.core.api.Assertions.assertThat;

/** AC-1, AC-2, AC-3 and the CSRF contract of spec 0002. */
class AuthIT extends IdentityTestSupport {

    @Autowired
    SessionInvalidator sessionInvalidator;

    @Test
    void shouldLoginThenLogout() throws Exception {
        HttpResponse<String> login = session.login(HR_EMAIL, HR_PASSWORD);

        assertThat(login.statusCode()).isEqualTo(200);
        assertThat(login.body()).contains("\"role\":\"HR\"");
        assertThat(hasSessionCookie(login)).isTrue();
        assertThat(login.headers().allValues("set-cookie"))
                .anyMatch(cookie -> cookie.toLowerCase().contains("httponly"))
                .anyMatch(cookie -> cookie.contains("SameSite=Lax"));

        assertThat(session.get("/api/auth/me").statusCode()).isEqualTo(200);

        assertThat(session.post("/api/auth/logout", "{}").statusCode()).isEqualTo(204);
        assertThat(session.get("/api/auth/me").statusCode()).isEqualTo(401);
    }

    @Test
    void shouldRejectWrongPasswordWithAGenericError() throws Exception {
        HttpResponse<String> response = session.login(HR_EMAIL, "wrong-password-123");

        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(response.body()).contains("NOT_AUTHENTICATED");
        assertThat(response.body().toLowerCase()).doesNotContain("password");
    }

    @Test
    void shouldRejectEndedSession() throws Exception {
        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);
        assertThat(session.get("/api/auth/me").statusCode()).isEqualTo(200);

        sessionInvalidator.endAllFor(HR_EMAIL);

        assertThat(session.get("/api/auth/me").statusCode()).isEqualTo(401);
    }

    @Test
    void shouldRejectLoginWithoutCsrfToken() throws Exception {
        HttpResponse<String> response = session.postWithoutCsrf("/api/auth/login",
                "{\"email\":\"" + HR_EMAIL + "\",\"password\":\"" + HR_PASSWORD + "\"}");

        assertThat(response.statusCode()).isEqualTo(403);
    }

    @Test
    void shouldLockAfterFiveFailures() throws Exception {
        Session hr = new Session();
        assertThat(hr.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);
        String email = "lock-" + System.nanoTime() + "@acme.test";
        HttpResponse<String> created = hr.post("/api/users",
                "{\"email\":\"" + email + "\",\"displayName\":\"Lock Test\",\"role\":\"EMPLOYEE\"}");
        assertThat(created.statusCode()).isEqualTo(201);
        String temporaryPassword = extract(created.body(), "temporaryPassword");

        Session attacker = new Session();
        for (int attempt = 0; attempt < 5; attempt++) {
            assertThat(attacker.login(email, "wrong-password-123").statusCode()).isEqualTo(401);
        }

        HttpResponse<String> locked = attacker.login(email, temporaryPassword);

        assertThat(locked.statusCode()).isEqualTo(423);
        assertThat(locked.body()).contains("ACCOUNT_LOCKED");
    }
}

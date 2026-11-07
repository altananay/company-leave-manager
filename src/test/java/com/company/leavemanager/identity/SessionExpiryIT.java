package com.company.leavemanager.identity;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

import java.net.http.HttpResponse;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * AC-2: the absolute session lifetime ends the session, while the SPA shell stays reachable so the
 * user can be sent back to the login screen (the filter must not lock the shell out).
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "app.identity.session-max-age=1s")
class SessionExpiryIT extends IdentityTestSupport {

    @Test
    void shouldEndTheSessionAfterTheAbsoluteLifetime() throws Exception {
        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);
        assertThat(session.get("/api/auth/me").statusCode()).isEqualTo(200);

        Thread.sleep(1500);

        HttpResponse<String> expired = session.get("/api/auth/me");

        assertThat(expired.statusCode()).isEqualTo(401);
        assertThat(expired.body()).contains("SESSION_EXPIRED");
    }

    @Test
    void shouldKeepTheShellAndHealthReachableWithAnExpiredSession() throws Exception {
        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);

        Thread.sleep(1500);

        // The shell and the health probe must not be blocked by the expired session.
        assertThat(session.get("/").statusCode()).isEqualTo(200);
        assertThat(session.get("/api/health").statusCode()).isEqualTo(200);
    }
}

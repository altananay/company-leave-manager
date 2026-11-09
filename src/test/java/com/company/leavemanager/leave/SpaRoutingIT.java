package com.company.leavemanager.leave;

import com.company.leavemanager.identity.IdentityTestSupport;
import org.junit.jupiter.api.Test;

import java.net.http.HttpResponse;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * AC-9 (backlog B-4): a nested client route can be opened directly — the shell answers 200 and the
 * SPA decides which screen it shows. The API stays an API: its paths are never served the shell, and
 * a path outside the allow-list is still denied.
 */
class SpaRoutingIT extends IdentityTestSupport {

    @Test
    void shouldServeTheNestedRoute() throws Exception {
        HttpResponse<String> response = session.get("/leave/requests");

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("content-type").orElse("")).contains("text/html");
        assertThat(response.body()).contains("id=\"root\"");
    }

    @Test
    void shouldKeepTheApiOutOfTheFallback() throws Exception {
        // An anonymous API call is a session error, not the shell: the SPA fallback never swallows it.
        HttpResponse<String> api = session.get("/api/leave/requests");
        assertThat(api.statusCode()).isEqualTo(401);
        assertThat(api.body()).contains("NOT_AUTHENTICATED");

        // Only the client routes are forwarded; anything deeper has no handler and answers 404 —
        // the fallback never turns an unmapped path into a screen.
        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);
        assertThat(session.get("/leave/one/two/three").statusCode()).isEqualTo(404);
    }
}

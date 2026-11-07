package com.company.leavemanager.web;

import com.company.leavemanager.identity.IdentityTestSupport;
import org.junit.jupiter.api.Test;

import java.net.http.HttpResponse;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The error contract (docs/conventions.md): every error, including the ones the framework raises
 * before a controller runs, is RFC 9457 with a stable English {@code code}.
 */
class ApiErrorContractIT extends IdentityTestSupport {

    @Test
    void shouldAnswer400ForABadPathParameter() throws Exception {
        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);

        HttpResponse<String> response = session.post("/api/users/not-a-uuid/deactivate", "{}");

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.body()).contains("INVALID_REQUEST");
        assertThat(response.body()).contains("\"type\":\"urn:problem:invalid-request\"");
    }

    @Test
    void shouldAnswer400ForAMalformedBody() throws Exception {
        HttpResponse<String> response = session.post("/api/auth/login", "{not-json");

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.body()).contains("INVALID_REQUEST");
    }

    @Test
    void shouldAnswer400WithFieldErrorsForAnInvalidBody() throws Exception {
        HttpResponse<String> response = session.post("/api/auth/login",
                "{\"email\":\"not-an-email\",\"password\":\"\"}");

        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.body()).contains("VALIDATION_FAILED");
        assertThat(response.body()).contains("\"errors\"");
    }
}

package com.company.leavemanager.web;

import org.junit.jupiter.api.Test;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;

import static org.assertj.core.api.Assertions.assertThat;

/** The 5xx contract (docs/conventions.md): one code, a request id, and no internal detail. */
class ApiExceptionHandlerTest {

    private final ApiExceptionHandler handler = new ApiExceptionHandler();

    @Test
    void shouldAnswer500WithOneCodeAndARequestId() {
        ResponseEntity<ProblemDetail> response = handler.unexpected(new IllegalStateException("boom"));

        assertThat(response.getStatusCode().value()).isEqualTo(500);
        ProblemDetail problem = response.getBody();
        assertThat(problem).isNotNull();
        assertThat(problem.getProperties()).containsEntry("code", "INTERNAL_ERROR");
        assertThat(problem.getProperties().get("requestId")).isNotNull();
        // The internal message never reaches the client.
        assertThat(problem.getDetail()).isNull();
    }

    @Test
    void shouldGiveEveryServerErrorItsOwnRequestId() {
        String first = (String) handler.unexpected(new IllegalStateException("a")).getBody()
                .getProperties().get("requestId");
        String second = (String) handler.unexpected(new IllegalStateException("b")).getBody()
                .getProperties().get("requestId");

        assertThat(first).isNotEqualTo(second);
    }
}

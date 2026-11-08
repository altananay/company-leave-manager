package com.company.leavemanager.web;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** The 5xx contract (docs/conventions.md): one code, a request id, and no internal detail. */
class ApiExceptionHandlerTest {

    private final ApiExceptionHandler handler = new ApiExceptionHandler();
    private final Logger logger = (Logger) LoggerFactory.getLogger(ApiExceptionHandler.class);
    private final ListAppender<ILoggingEvent> logs = new ListAppender<>();

    @BeforeEach
    void attachAppender() {
        logs.start();
        logger.addAppender(logs);
    }

    @AfterEach
    void detachAppender() {
        logger.detachAppender(logs);
    }

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

    @Test
    void shouldNotLogTheExceptionMessage() {
        // A database error can quote the row it refused; that row may hold personal data.
        handler.unexpected(new IllegalStateException("duplicate key: someone@acme.test"));

        List<String> messages = logs.list.stream().map(ILoggingEvent::getFormattedMessage).toList();

        assertThat(messages).isNotEmpty();
        assertThat(messages).allSatisfy(message -> {
            assertThat(message).doesNotContain("someone@acme.test");
            assertThat(message).contains("java.lang.IllegalStateException");
        });
        // The stack trace is still available, at DEBUG only.
        assertThat(logs.list)
                .filteredOn(event -> event.getLevel().toString().equals("DEBUG"))
                .allSatisfy(event -> assertThat(event.getThrowableProxy()).isNotNull());
    }
}

package com.company.leavemanager.web;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

import java.net.URI;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Every error leaves the API as RFC 9457 with the project's stable English {@code code}
 * (docs/conventions.md). Extending {@link ResponseEntityExceptionHandler} covers the framework's
 * own exceptions (malformed body, bad path variable, 404, 405, ...) with the same body shape.
 */
@RestControllerAdvice
public class ApiExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException failure,
                                                                  HttpHeaders headers,
                                                                  HttpStatusCode status,
                                                                  WebRequest request) {
        List<String> errors = failure.getBindingResult().getFieldErrors().stream()
                .map(error -> error.getField() + ": " + error.getDefaultMessage())
                .toList();
        return ResponseEntity.badRequest().body(problem(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", errors));
    }

    @Override
    protected ResponseEntity<Object> handleExceptionInternal(Exception failure,
                                                             Object body,
                                                             HttpHeaders headers,
                                                             HttpStatusCode status,
                                                             WebRequest request) {
        ProblemDetail problem = body instanceof ProblemDetail existing
                ? existing
                : ProblemDetail.forStatus(status);
        enrich(problem, codeFor(status));
        if (status.is5xxServerError()) {
            String requestId = serverError(problem, failure);
            return ResponseEntity.status(status).headers(headers).body(problemWithId(problem, requestId));
        }
        return ResponseEntity.status(status).headers(headers).body(problem);
    }

    /** Never leak an internal message: the client gets a code and a request id, the log the detail. */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ProblemDetail> unexpected(Exception failure) {
        ProblemDetail problem = problem(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR");
        String requestId = serverError(problem, failure);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(problemWithId(problem, requestId));
    }

    /** Logs a 5xx with its correlation id and returns that id (docs/conventions.md, Error handling). */
    private static String serverError(ProblemDetail problem, Exception failure) {
        String requestId = UUID.randomUUID().toString();
        log.error("Server error [{}] {}", requestId, problem.getStatus(), failure);
        return requestId;
    }

    private static ProblemDetail problemWithId(ProblemDetail problem, String requestId) {
        problem.setProperty("requestId", requestId);
        return problem;
    }

    private static String codeFor(HttpStatusCode status) {
        if (status.is5xxServerError()) {
            return "INTERNAL_ERROR";
        }
        return switch (status.value()) {
            case 400 -> "INVALID_REQUEST";
            case 404 -> "NOT_FOUND";
            case 405 -> "METHOD_NOT_ALLOWED";
            case 415 -> "UNSUPPORTED_MEDIA_TYPE";
            default -> "ERROR";
        };
    }

    private static void enrich(ProblemDetail problem, String code) {
        // Locale.ROOT: the type is a protocol value, never locale-dependent (tr-TR would break "I").
        problem.setType(URI.create("urn:problem:" + code.toLowerCase(Locale.ROOT).replace('_', '-')));
        problem.setProperty("code", code);
    }

    /** RFC 9457 with the project's stable English {@code code} (docs/conventions.md). */
    public static ProblemDetail problem(HttpStatus status, String code) {
        return problem(status, code, List.of());
    }

    public static ProblemDetail problem(HttpStatus status, String code, List<String> errors) {
        ProblemDetail problem = ProblemDetail.forStatus(status);
        problem.setTitle(status.getReasonPhrase());
        enrich(problem, code);
        if (!errors.isEmpty()) {
            problem.setProperty("errors", errors);
        }
        return problem;
    }
}

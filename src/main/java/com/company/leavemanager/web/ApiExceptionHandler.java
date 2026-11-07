package com.company.leavemanager.web;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.net.URI;
import java.util.List;

@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail validation(MethodArgumentNotValidException failure) {
        List<String> errors = failure.getBindingResult().getFieldErrors().stream()
                .map(error -> error.getField() + ": " + error.getDefaultMessage())
                .toList();
        return problem(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", errors);
    }

    /** RFC 9457 with the project's stable English {@code code} (docs/conventions.md). */
    public static ProblemDetail problem(HttpStatus status, String code) {
        return problem(status, code, List.of());
    }

    public static ProblemDetail problem(HttpStatus status, String code, List<String> errors) {
        ProblemDetail problem = ProblemDetail.forStatus(status);
        problem.setType(URI.create("urn:problem:" + code.toLowerCase().replace('_', '-')));
        problem.setTitle(status.getReasonPhrase());
        problem.setProperty("code", code);
        if (!errors.isEmpty()) {
            problem.setProperty("errors", errors);
        }
        return problem;
    }
}

package com.company.leavemanager.web;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.stereotype.Component;

import java.io.IOException;

/**
 * Writes the project's RFC 9457 error body for failures raised outside a controller
 * (security filters, entry point, access-denied handler).
 */
@Component
public class Problems {

    public void write(HttpServletResponse response, int status, String code) throws IOException {
        ProblemDetail problem = ApiExceptionHandler.problem(
                HttpStatus.resolve(status) == null ? HttpStatus.INTERNAL_SERVER_ERROR : HttpStatus.valueOf(status),
                code);
        response.setStatus(status);
        response.setContentType("application/problem+json");
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write(toJson(problem));
    }

    private static String toJson(ProblemDetail problem) {
        return "{\"type\":\"" + problem.getType()
                + "\",\"title\":\"" + problem.getTitle()
                + "\",\"status\":" + problem.getStatus()
                + ",\"code\":\"" + problem.getProperties().get("code")
                + "\"}";
    }
}

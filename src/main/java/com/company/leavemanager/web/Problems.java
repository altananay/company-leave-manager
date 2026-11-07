package com.company.leavemanager.web;

import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;

import java.io.IOException;

/** Writes the project's minimal error body for failures raised outside a controller. */
@Component
public class Problems {

    public void write(HttpServletResponse response, int status, String code) throws IOException {
        response.setStatus(status);
        response.setContentType("application/problem+json");
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write("{\"status\":" + status + ",\"code\":\"" + code + "\"}");
    }
}

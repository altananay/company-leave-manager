package com.company.leavemanager.identity.internal;

import com.company.leavemanager.web.Problems;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Clock;
import java.time.Instant;

/**
 * Enforces the absolute session lifetime (8 hours) on the API only: the SPA shell, its assets and
 * the public endpoints must stay reachable so the user can be sent back to the login screen.
 */
public class SessionAgeFilter extends OncePerRequestFilter {

    public static final String AUTH_TIME = "authTime";

    private final IdentityProperties properties;
    private final Clock clock;
    private final Problems problems;

    public SessionAgeFilter(IdentityProperties properties, Clock clock, Problems problems) {
        this.properties = properties;
        this.clock = clock;
        this.problems = problems;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return !path.startsWith("/api/")
                || path.startsWith("/api/health")
                || path.startsWith("/api/auth/login")
                || path.startsWith("/api/auth/csrf");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        HttpSession session = request.getSession(false);
        if (session != null) {
            Object started = session.getAttribute(AUTH_TIME);
            if (started instanceof Instant instant
                    && instant.plus(properties.getSessionMaxAge()).isBefore(clock.instant())) {
                session.invalidate();
                problems.write(response, 401, "SESSION_EXPIRED");
                return;
            }
        }
        chain.doFilter(request, response);
    }
}

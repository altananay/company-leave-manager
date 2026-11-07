package com.company.leavemanager.identity.internal;

import com.company.leavemanager.web.Problems;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Set;

/**
 * A user who must change the temporary password can only reach the endpoints needed to do so;
 * every other API call is refused with 403 PASSWORD_CHANGE_REQUIRED.
 */
public class MustChangePasswordFilter extends OncePerRequestFilter {

    private static final Set<String> ALLOWED = Set.of(
            "/api/auth/me",
            "/api/auth/csrf",
            "/api/auth/password",
            "/api/auth/logout");

    private final Problems problems;

    public MustChangePasswordFilter(Problems problems) {
        this.problems = problems;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null
                && authentication.getPrincipal() instanceof AppUserPrincipal principal
                && principal.mustChangePassword()) {
            String path = request.getRequestURI();
            if (path.startsWith("/api") && !ALLOWED.contains(path)) {
                problems.write(response, 403, "PASSWORD_CHANGE_REQUIRED");
                return;
            }
        }
        chain.doFilter(request, response);
    }
}

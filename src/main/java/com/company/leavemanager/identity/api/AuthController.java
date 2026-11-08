package com.company.leavemanager.identity.api;

import com.company.leavemanager.identity.api.dto.ChangePasswordRequest;
import com.company.leavemanager.identity.api.dto.LoginRequest;
import com.company.leavemanager.identity.api.dto.MeResponse;
import com.company.leavemanager.identity.internal.AppUserPrincipal;
import com.company.leavemanager.identity.internal.AuthService;
import com.company.leavemanager.identity.internal.SessionAgeFilter;
import com.company.leavemanager.web.ApiExceptionHandler;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.session.ChangeSessionIdAuthenticationStrategy;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Clock;
import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final SecurityContextRepository contextRepository;
    private final Clock clock;
    private final SessionAuthenticationStrategy sessionStrategy = new ChangeSessionIdAuthenticationStrategy();

    public AuthController(AuthService authService,
                          SecurityContextRepository contextRepository,
                          Clock clock) {
        this.authService = authService;
        this.contextRepository = contextRepository;
        this.clock = clock;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody LoginRequest request,
                                   HttpServletRequest httpRequest,
                                   HttpServletResponse httpResponse) {
        AuthService.LoginResult result = authService.login(request.email(), request.password());
        if (result.outcome() == AuthService.LoginOutcome.LOCKED) {
            return ResponseEntity.status(HttpStatus.LOCKED)
                    .body(ApiExceptionHandler.problem(HttpStatus.LOCKED, "ACCOUNT_LOCKED"));
        }
        if (result.outcome() == AuthService.LoginOutcome.INVALID) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(ApiExceptionHandler.problem(HttpStatus.UNAUTHORIZED, "NOT_AUTHENTICATED"));
        }

        // The session keeps a credential-free principal: the hash never reaches spring_session.
        AppUserPrincipal principal = result.principal().withoutCredentials();
        Authentication authentication =
                new UsernamePasswordAuthenticationToken(principal, null, principal.getAuthorities());
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        // Session fixation protection: the session id changes once the user is authenticated.
        sessionStrategy.onAuthentication(authentication, httpRequest, httpResponse);
        contextRepository.saveContext(context, httpRequest, httpResponse);
        HttpSession session = httpRequest.getSession(true);
        session.setAttribute(SessionAgeFilter.AUTH_TIME, clock.instant());

        return ResponseEntity.ok(authService.me(principal));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        authService.logout(authentication != null && authentication.getPrincipal() instanceof AppUserPrincipal principal
                ? principal
                : null);
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        SecurityContextHolder.clearContext();
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me")
    public MeResponse me(Authentication authentication) {
        return authService.me((AppUserPrincipal) authentication.getPrincipal());
    }

    @GetMapping("/csrf")
    public Map<String, String> csrf(HttpServletRequest request) {
        CsrfToken token = (CsrfToken) request.getAttribute(CsrfToken.class.getName());
        return Map.of("token", token.getToken());
    }

    @PostMapping("/password")
    public ResponseEntity<?> changePassword(@Valid @RequestBody ChangePasswordRequest request,
                                            Authentication authentication,
                                            HttpServletRequest httpRequest,
                                            HttpServletResponse httpResponse) {
        AppUserPrincipal principal = (AppUserPrincipal) authentication.getPrincipal();
        AuthService.PasswordChangeOutcome outcome = authService.changePassword(
                principal, request.currentPassword(), request.newPassword(), request.confirmPassword());

        ProblemDetail problem = switch (outcome) {
            // 401 means "no session" (docs/security.md); a wrong current password is a validation error.
            case INVALID_CURRENT -> ApiExceptionHandler.problem(HttpStatus.BAD_REQUEST, "INVALID_PASSWORD");
            case MISMATCH -> ApiExceptionHandler.problem(HttpStatus.BAD_REQUEST, "PASSWORD_MISMATCH");
            case WEAK -> ApiExceptionHandler.problem(HttpStatus.BAD_REQUEST, "WEAK_PASSWORD");
            case CHANGED -> null;
        };
        if (problem != null) {
            return ResponseEntity.badRequest().body(problem);
        }

        // Refresh the principal in the session so the must-change flag no longer blocks the user.
        AppUserPrincipal updated = authService.refresh(principal);
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(new UsernamePasswordAuthenticationToken(updated, null, updated.getAuthorities()));
        SecurityContextHolder.setContext(context);
        contextRepository.saveContext(context, httpRequest, httpResponse);

        return ResponseEntity.noContent().build();
    }
}

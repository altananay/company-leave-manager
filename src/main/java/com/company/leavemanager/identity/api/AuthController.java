package com.company.leavemanager.identity.api;

import com.company.leavemanager.audit.api.AuditRecorder;
import com.company.leavemanager.audit.api.Mask;
import com.company.leavemanager.identity.api.dto.ChangePasswordRequest;
import com.company.leavemanager.identity.api.dto.LoginRequest;
import com.company.leavemanager.identity.api.dto.MeResponse;
import com.company.leavemanager.identity.internal.AppUserPrincipal;
import com.company.leavemanager.identity.internal.LockoutService;
import com.company.leavemanager.identity.internal.PasswordPolicy;
import com.company.leavemanager.identity.internal.SessionAgeFilter;
import com.company.leavemanager.identity.internal.User;
import com.company.leavemanager.identity.internal.UserRepository;
import com.company.leavemanager.web.ApiError;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
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

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final AuthenticationManager authenticationManager;
    private final SecurityContextRepository contextRepository;
    private final LockoutService lockout;
    private final AuditRecorder audit;
    private final Clock clock;
    private final SessionAuthenticationStrategy sessionStrategy = new ChangeSessionIdAuthenticationStrategy();

    public AuthController(UserRepository users,
                          PasswordEncoder encoder,
                          AuthenticationManager authenticationManager,
                          SecurityContextRepository contextRepository,
                          LockoutService lockout,
                          AuditRecorder audit,
                          Clock clock) {
        this.users = users;
        this.encoder = encoder;
        this.authenticationManager = authenticationManager;
        this.contextRepository = contextRepository;
        this.lockout = lockout;
        this.audit = audit;
        this.clock = clock;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@Valid @RequestBody LoginRequest request,
                                   HttpServletRequest httpRequest,
                                   HttpServletResponse httpResponse) {
        User user = users.findByEmailIgnoreCase(request.email()).orElse(null);
        if (user == null || !user.isActive()) {
            audit.loginFailed(user == null ? null : user.getId(), Mask.email(request.email()));
            return ResponseEntity.status(401).body(ApiError.of(401, "NOT_AUTHENTICATED"));
        }
        if (lockout.isLocked(user)) {
            audit.accountLocked(user.getId());
            return ResponseEntity.status(423).body(ApiError.of(423, "ACCOUNT_LOCKED"));
        }
        try {
            Authentication authentication = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(request.email(), request.password()));
            SecurityContext context = SecurityContextHolder.createEmptyContext();
            context.setAuthentication(authentication);
            SecurityContextHolder.setContext(context);
            // Session fixation protection: the session id changes once the user is authenticated.
            sessionStrategy.onAuthentication(authentication, httpRequest, httpResponse);
            contextRepository.saveContext(context, httpRequest, httpResponse);
            HttpSession session = httpRequest.getSession(true);
            session.setAttribute(SessionAgeFilter.AUTH_TIME, clock.instant());
            lockout.reset(user);
            audit.loginSucceeded(user.getId());
            return ResponseEntity.ok(meOf(user));
        } catch (AuthenticationException failure) {
            lockout.registerFailure(user);
            if (lockout.isLocked(user)) {
                audit.accountLocked(user.getId());
            }
            audit.loginFailed(user.getId(), Mask.email(user.getEmail()));
            return ResponseEntity.status(401).body(ApiError.of(401, "NOT_AUTHENTICATED"));
        }
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof AppUserPrincipal principal) {
            audit.logout(principal.id());
        }
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate();
        }
        SecurityContextHolder.clearContext();
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me")
    public MeResponse me(Authentication authentication) {
        AppUserPrincipal principal = (AppUserPrincipal) authentication.getPrincipal();
        return new MeResponse(
                principal.id(),
                principal.email(),
                principal.displayName(),
                principal.role().name(),
                principal.mustChangePassword());
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
        User user = users.findById(principal.id()).orElseThrow();
        if (!encoder.matches(request.currentPassword(), user.getPasswordHash())) {
            return ResponseEntity.status(401).body(ApiError.of(401, "INVALID_PASSWORD"));
        }
        if (!request.newPassword().equals(request.confirmPassword())) {
            return ResponseEntity.badRequest().body(ApiError.of(400, "PASSWORD_MISMATCH"));
        }
        try {
            PasswordPolicy.validate(request.newPassword());
        } catch (IllegalArgumentException tooWeak) {
            return ResponseEntity.badRequest().body(ApiError.of(400, "WEAK_PASSWORD"));
        }
        user.changePassword(encoder.encode(request.newPassword()), false, clock.instant());
        users.save(user);

        // Refresh the principal in the session so the must-change flag does not block the user.
        AppUserPrincipal updated = new AppUserPrincipal(
                user.getId(), user.getEmail(), user.getDisplayName(), user.getRole(),
                user.getPasswordHash(), false, user.isActive());
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(new UsernamePasswordAuthenticationToken(updated, null, updated.getAuthorities()));
        SecurityContextHolder.setContext(context);
        contextRepository.saveContext(context, httpRequest, httpResponse);

        audit.passwordChanged(user.getId());
        return ResponseEntity.noContent().build();
    }

    private MeResponse meOf(User user) {
        return new MeResponse(
                user.getId(),
                user.getEmail(),
                user.getDisplayName(),
                user.getRole().name(),
                user.isMustChangePassword());
    }
}

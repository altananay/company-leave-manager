package com.company.leavemanager.identity.internal;

import com.company.leavemanager.audit.api.AuditRecorder;
import com.company.leavemanager.audit.api.Mask;
import com.company.leavemanager.identity.api.dto.MeResponse;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.Optional;

/**
 * The identity module's login use cases. Controllers call this; they never touch the repository
 * (docs/architecture.md, rule 2).
 */
@Service
public class AuthService {

    public enum LoginOutcome { SUCCESS, INVALID, LOCKED }

    /** The result of a login attempt: the authenticated user, or the reason it failed. */
    public record LoginResult(LoginOutcome outcome, AppUserPrincipal principal) {
    }

    public enum PasswordChangeOutcome { CHANGED, INVALID_CURRENT, MISMATCH, WEAK }

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final AuthenticationManager authenticationManager;
    private final LockoutService lockout;
    private final AuditRecorder audit;
    private final Clock clock;

    public AuthService(UserRepository users,
                       PasswordEncoder encoder,
                       AuthenticationManager authenticationManager,
                       LockoutService lockout,
                       AuditRecorder audit,
                       Clock clock) {
        this.users = users;
        this.encoder = encoder;
        this.authenticationManager = authenticationManager;
        this.lockout = lockout;
        this.audit = audit;
        this.clock = clock;
    }

    @Transactional
    public LoginResult login(String email, String password) {
        Optional<User> found = users.findByEmailIgnoreCase(email);
        if (found.isEmpty() || !found.get().isActive()) {
            audit.loginFailed(found.map(User::getId).orElse(null), Mask.email(email));
            return new LoginResult(LoginOutcome.INVALID, null);
        }
        User user = found.get();
        if (lockout.isLocked(user)) {
            audit.accountLocked(user.getId());
            return new LoginResult(LoginOutcome.LOCKED, null);
        }
        try {
            Authentication authentication = authenticationManager.authenticate(
                    new UsernamePasswordAuthenticationToken(email, password));
            lockout.reset(user);
            audit.loginSucceeded(user.getId());
            return new LoginResult(LoginOutcome.SUCCESS, (AppUserPrincipal) authentication.getPrincipal());
        } catch (AuthenticationException failure) {
            lockout.registerFailure(user);
            if (lockout.isLocked(user)) {
                audit.accountLocked(user.getId());
            }
            audit.loginFailed(user.getId(), Mask.email(user.getEmail()));
            return new LoginResult(LoginOutcome.INVALID, null);
        }
    }

    @Transactional
    public void logout(AppUserPrincipal principal) {
        if (principal != null) {
            audit.logout(principal.id());
        }
    }

    @Transactional
    public PasswordChangeOutcome changePassword(AppUserPrincipal principal,
                                                String currentPassword,
                                                String newPassword,
                                                String confirmPassword) {
        User user = users.findById(principal.id()).orElseThrow();
        if (!encoder.matches(currentPassword, user.getPasswordHash())) {
            return PasswordChangeOutcome.INVALID_CURRENT;
        }
        if (!newPassword.equals(confirmPassword)) {
            return PasswordChangeOutcome.MISMATCH;
        }
        try {
            PasswordPolicy.validate(newPassword);
        } catch (IllegalArgumentException tooWeak) {
            return PasswordChangeOutcome.WEAK;
        }
        user.changePassword(encoder.encode(newPassword), false, clock.instant());
        users.save(user);
        audit.passwordChanged(user.getId());
        return PasswordChangeOutcome.CHANGED;
    }

    /** Re-reads the user so the caller can refresh the principal after a password change. */
    public AppUserPrincipal refresh(AppUserPrincipal principal) {
        // Credential-free on purpose: this principal is written back into the session.
        return users.findById(principal.id())
                .map(user -> new AppUserPrincipal(
                        user.getId(),
                        user.getEmail(),
                        user.getDisplayName(),
                        user.getRole(),
                        null,
                        user.isMustChangePassword(),
                        user.isActive()))
                .orElseThrow();
    }

    public MeResponse me(AppUserPrincipal principal) {
        return new MeResponse(
                principal.id(),
                principal.email(),
                principal.displayName(),
                principal.role().name(),
                principal.mustChangePassword());
    }
}

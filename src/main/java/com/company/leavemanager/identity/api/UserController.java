package com.company.leavemanager.identity.api;

import com.company.leavemanager.audit.api.AuditRecorder;
import com.company.leavemanager.identity.api.dto.CreateUserRequest;
import com.company.leavemanager.identity.api.dto.CreateUserResponse;
import com.company.leavemanager.identity.api.dto.UserResponse;
import com.company.leavemanager.identity.internal.AppUserPrincipal;
import com.company.leavemanager.identity.internal.Role;
import com.company.leavemanager.identity.internal.SessionInvalidator;
import com.company.leavemanager.identity.internal.TemporaryPassword;
import com.company.leavemanager.identity.internal.User;
import com.company.leavemanager.identity.internal.UserRepository;
import com.company.leavemanager.web.ApiError;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Clock;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final SessionInvalidator sessions;
    private final AuditRecorder audit;
    private final Clock clock;

    public UserController(UserRepository users,
                          PasswordEncoder encoder,
                          SessionInvalidator sessions,
                          AuditRecorder audit,
                          Clock clock) {
        this.users = users;
        this.encoder = encoder;
        this.sessions = sessions;
        this.audit = audit;
        this.clock = clock;
    }

    @GetMapping
    public List<UserResponse> list() {
        return users.findAllByOrderByDisplayNameAsc().stream().map(UserResponse::of).toList();
    }

    @PostMapping
    public ResponseEntity<?> create(@Valid @RequestBody CreateUserRequest request, Authentication authentication) {
        Role role;
        try {
            role = Role.valueOf(request.role().toUpperCase());
        } catch (IllegalArgumentException unknownRole) {
            return ResponseEntity.badRequest().body(ApiError.of(400, "INVALID_ROLE"));
        }
        if (role == Role.HR || role == Role.CEO) {
            return ResponseEntity.status(403).body(ApiError.of(403, "ROLE_NOT_ASSIGNABLE"));
        }
        if (users.existsByEmailIgnoreCase(request.email())) {
            return ResponseEntity.status(409).body(ApiError.of(409, "EMAIL_EXISTS"));
        }
        String temporaryPassword = TemporaryPassword.generate();
        User user = User.create(request.email(), request.displayName(), role,
                encoder.encode(temporaryPassword), clock.instant());
        users.save(user);
        audit.userCreated(actor(authentication).id(), user.getId(), role.name());
        return ResponseEntity.status(201).body(new CreateUserResponse(UserResponse.of(user), temporaryPassword));
    }

    @PostMapping("/{id}/deactivate")
    public ResponseEntity<?> deactivate(@PathVariable UUID id, Authentication authentication) {
        AppUserPrincipal actor = actor(authentication);
        if (actor.id().equals(id)) {
            return ResponseEntity.status(403).body(ApiError.of(403, "SELF_ACTION_NOT_ALLOWED"));
        }
        User user = users.findById(id).orElse(null);
        if (user == null) {
            return ResponseEntity.status(404).body(ApiError.of(404, "NOT_FOUND"));
        }
        user.deactivate(clock.instant());
        users.save(user);
        sessions.endAllFor(user.getEmail());
        audit.userDeactivated(actor.id(), user.getId());
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/reset-password")
    public ResponseEntity<?> resetPassword(@PathVariable UUID id, Authentication authentication) {
        AppUserPrincipal actor = actor(authentication);
        if (actor.id().equals(id)) {
            return ResponseEntity.status(403).body(ApiError.of(403, "SELF_ACTION_NOT_ALLOWED"));
        }
        User user = users.findById(id).orElse(null);
        if (user == null) {
            return ResponseEntity.status(404).body(ApiError.of(404, "NOT_FOUND"));
        }
        String temporaryPassword = TemporaryPassword.generate();
        user.changePassword(encoder.encode(temporaryPassword), true, clock.instant());
        users.save(user);
        sessions.endAllFor(user.getEmail());
        audit.passwordReset(actor.id(), user.getId());
        return ResponseEntity.ok(new CreateUserResponse(UserResponse.of(user), temporaryPassword));
    }

    private static AppUserPrincipal actor(Authentication authentication) {
        return (AppUserPrincipal) authentication.getPrincipal();
    }
}

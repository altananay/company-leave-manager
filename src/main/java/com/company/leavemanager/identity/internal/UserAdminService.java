package com.company.leavemanager.identity.internal;

import com.company.leavemanager.audit.api.AuditRecorder;
import com.company.leavemanager.identity.api.dto.CreateUserResponse;
import com.company.leavemanager.identity.api.dto.UserResponse;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

/** HR user administration use cases; controllers never touch the repository (architecture rule 2). */
@Service
public class UserAdminService {

    public enum CreateOutcome { CREATED, INVALID_ROLE, ROLE_NOT_ASSIGNABLE, EMAIL_EXISTS }

    public record CreateResult(CreateOutcome outcome, CreateUserResponse response) {
    }

    public enum AdminOutcome { DONE, SELF_ACTION, NOT_FOUND }

    public record AdminResult(AdminOutcome outcome, CreateUserResponse response) {
    }

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final SessionInvalidator sessions;
    private final AuditRecorder audit;
    private final Clock clock;

    public UserAdminService(UserRepository users,
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

    public List<UserResponse> list() {
        return users.findAllByOrderByDisplayNameAsc().stream().map(UserResponse::of).toList();
    }

    @Transactional
    public CreateResult create(UUID actorId, String email, String displayName, String roleName) {
        Role role;
        try {
            role = Role.valueOf(roleName.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException unknownRole) {
            return new CreateResult(CreateOutcome.INVALID_ROLE, null);
        }
        if (role == Role.HR || role == Role.CEO) {
            return new CreateResult(CreateOutcome.ROLE_NOT_ASSIGNABLE, null);
        }
        if (users.existsByEmailIgnoreCase(email)) {
            return new CreateResult(CreateOutcome.EMAIL_EXISTS, null);
        }
        String temporaryPassword = TemporaryPassword.generate();
        User user = User.create(email, displayName, role, encoder.encode(temporaryPassword), clock.instant());
        users.save(user);
        audit.userCreated(actorId, user.getId(), role.name());
        return new CreateResult(CreateOutcome.CREATED,
                new CreateUserResponse(UserResponse.of(user), temporaryPassword));
    }

    @Transactional
    public AdminResult deactivate(UUID actorId, UUID targetId) {
        if (actorId.equals(targetId)) {
            return new AdminResult(AdminOutcome.SELF_ACTION, null);
        }
        Optional<User> found = users.findById(targetId);
        if (found.isEmpty()) {
            return new AdminResult(AdminOutcome.NOT_FOUND, null);
        }
        User user = found.get();
        user.deactivate(clock.instant());
        users.save(user);
        sessions.endAllFor(user.getEmail());
        audit.userDeactivated(actorId, user.getId());
        return new AdminResult(AdminOutcome.DONE, null);
    }

    @Transactional
    public AdminResult resetPassword(UUID actorId, UUID targetId) {
        if (actorId.equals(targetId)) {
            return new AdminResult(AdminOutcome.SELF_ACTION, null);
        }
        Optional<User> found = users.findById(targetId);
        if (found.isEmpty()) {
            return new AdminResult(AdminOutcome.NOT_FOUND, null);
        }
        User user = found.get();
        String temporaryPassword = TemporaryPassword.generate();
        user.changePassword(encoder.encode(temporaryPassword), true, clock.instant());
        users.save(user);
        sessions.endAllFor(user.getEmail());
        audit.passwordReset(actorId, user.getId());
        return new AdminResult(AdminOutcome.DONE,
                new CreateUserResponse(UserResponse.of(user), temporaryPassword));
    }
}

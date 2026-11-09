package com.company.leavemanager.identity.internal;

import com.company.leavemanager.audit.api.AuditRecorder;
import com.company.leavemanager.identity.api.dto.CreateUserResponse;
import com.company.leavemanager.identity.api.dto.UserResponse;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

/** HR user administration use cases; controllers never touch the repository (architecture rule 2). */
@Service
public class UserAdminService {

    public enum CreateOutcome { CREATED, INVALID_ROLE, ROLE_NOT_ASSIGNABLE, EMAIL_EXISTS, INVALID_MANAGER }

    public record CreateResult(CreateOutcome outcome, CreateUserResponse response) {
    }

    public enum AdminOutcome { DONE, SELF_ACTION, PROTECTED_ACCOUNT, NOT_FOUND, HAS_REPORTS, INVALID_MANAGER }

    public record AdminResult(AdminOutcome outcome, CreateUserResponse response) {
    }

    /** The outcome of an org-data edit, with the row as it now stands (L-04). */
    public record UpdateResult(AdminOutcome outcome, UserResponse response) {
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
    public CreateResult create(UUID actorId,
                               String email,
                               String displayName,
                               String roleName,
                               UUID managerId,
                               LocalDate hireDate) {
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
        if (!isAssignableManager(managerId)) {
            return new CreateResult(CreateOutcome.INVALID_MANAGER, null);
        }
        String temporaryPassword = TemporaryPassword.generate();
        User user = User.create(email, displayName, role, encoder.encode(temporaryPassword),
                managerId, hireDate, clock.instant());
        users.save(user);
        audit.userCreated(actorId, user.getId(), role.name());
        return new CreateResult(CreateOutcome.CREATED,
                new CreateUserResponse(UserResponse.of(user), temporaryPassword));
    }

    /**
     * The direct manager decides leave (BR-7), so the link may only point at an active account that
     * holds the MANAGER role: an HR/CEO "manager" could never approve the request it is attached to.
     * A cycle is impossible on creation (the new account is not in the tree yet).
     */
    private boolean isAssignableManager(UUID managerId) {
        if (managerId == null) {
            return true;
        }
        return users.findById(managerId)
                .filter(User::isActive)
                .filter(manager -> manager.getRole() == Role.MANAGER)
                .isPresent();
    }

    @Transactional
    public AdminResult deactivate(UUID actorId, UUID targetId) {
        if (actorId.equals(targetId)) {
            return new AdminResult(AdminOutcome.SELF_ACTION, null);
        }
        Optional<User> found = users.lockById(targetId);
        if (found.isEmpty()) {
            return new AdminResult(AdminOutcome.NOT_FOUND, null);
        }
        User user = found.get();
        if (isProtected(user)) {
            return new AdminResult(AdminOutcome.PROTECTED_ACCOUNT, null);
        }
        // L-12: a manager who still has active reports cannot leave them without an approver. HR
        // reassigns the reports first (through the edit dialog), then deactivates.
        if (!users.findByManagerIdAndActiveTrue(user.getId()).isEmpty()) {
            return new AdminResult(AdminOutcome.HAS_REPORTS, null);
        }
        user.deactivate(clock.instant());
        users.save(user);
        sessions.endAllFor(user.getEmail());
        audit.userDeactivated(actorId, user.getId());
        return new AdminResult(AdminOutcome.DONE, null);
    }

    /**
     * HR backfills the org data of an existing account (L-04): the manager link and the hire date.
     * There is no bulk migration — a V2-era account is edited one by one by HR, and until its hire
     * date is set its annual entitlement is zero (L-05) rather than a guess.
     *
     * <p>The manager must be an active MANAGER and may not be the account itself or one of its own
     * reports (a cycle), so BR-7's "direct manager decides" stays true after every edit.
     */
    @Transactional
    public UpdateResult update(UUID actorId, UUID targetId, UUID managerId, LocalDate hireDate) {
        Optional<User> found = users.lockById(targetId);
        if (found.isEmpty()) {
            return new UpdateResult(AdminOutcome.NOT_FOUND, null);
        }
        User user = found.get();
        if (!isAssignableManager(managerId)
                || targetId.equals(managerId)
                || createsCycle(targetId, managerId)) {
            return new UpdateResult(AdminOutcome.INVALID_MANAGER, null);
        }
        UUID beforeManager = user.getManagerId();
        LocalDate beforeHireDate = user.getHireDate();
        user.updateOrg(managerId, hireDate, clock.instant());
        users.save(user);
        audit.userUpdated(actorId, user.getId(), beforeManager, beforeHireDate, managerId, hireDate);
        return new UpdateResult(AdminOutcome.DONE, UserResponse.of(user));
    }

    /** Whether pointing {@code targetId} at {@code managerId} would close a loop in the org tree. */
    private boolean createsCycle(UUID targetId, UUID managerId) {
        java.util.Set<UUID> seen = new java.util.HashSet<>();
        UUID current = managerId;
        while (current != null && seen.add(current)) {
            if (current.equals(targetId)) {
                return true;
            }
            current = users.findById(current).map(User::getManagerId).orElse(null);
        }
        return false;
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
        if (isProtected(user)) {
            return new AdminResult(AdminOutcome.PROTECTED_ACCOUNT, null);
        }
        String temporaryPassword = TemporaryPassword.generate();
        user.changePassword(encoder.encode(temporaryPassword), true, clock.instant());
        users.save(user);
        sessions.endAllFor(user.getEmail());
        audit.passwordReset(actorId, user.getId());
        return new AdminResult(AdminOutcome.DONE,
                new CreateUserResponse(UserResponse.of(user), temporaryPassword));
    }

    /**
     * HR and CEO accounts come from the environment seed (spec 0002, R-8): the admin screen must not
     * be able to take them over or lock them out.
     */
    private static boolean isProtected(User user) {
        return user.getRole() == Role.HR || user.getRole() == Role.CEO;
    }
}

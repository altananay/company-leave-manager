package com.company.leavemanager.identity.internal;

import com.company.leavemanager.audit.api.AuditRecorder;
import com.company.leavemanager.identity.api.EmployeeLeaveFacts;
import com.company.leavemanager.identity.api.dto.CreateUserResponse;
import com.company.leavemanager.identity.api.dto.UserResponse;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

/** HR user administration use cases; controllers never touch the repository (architecture rule 2). */
@Service
public class UserAdminService {

    public enum CreateOutcome { CREATED, INVALID_ROLE, ROLE_NOT_ASSIGNABLE, EMAIL_EXISTS, INVALID_MANAGER, INVALID_HIRE_DATE, INVALID_BIRTH_DATE }

    public record CreateResult(CreateOutcome outcome, CreateUserResponse response) {
    }

    public enum AdminOutcome {
        DONE,
        SELF_ACTION,
        PROTECTED_ACCOUNT,
        NOT_FOUND,
        HAS_REPORTS,
        INVALID_MANAGER,
        /** M-02: the account still has pending requests only its current manager could decide. */
        HAS_PENDING_REQUESTS,
        /** M-01: the edit would push the annual balance below zero — the invariant forbids it. */
        WOULD_GO_NEGATIVE,
        /** M-01/N-03: a hire date outside {@link HireDatePolicy} (before 1950 or in the future). */
        INVALID_HIRE_DATE,
        /** B2/D17: a birth date outside {@link BirthDatePolicy} (before 1900 or in the future). */
        INVALID_BIRTH_DATE
    }

    public record AdminResult(AdminOutcome outcome, CreateUserResponse response) {
    }

    /** The outcome of an org-data edit, with the row as it now stands (L-04). */
    public record UpdateResult(AdminOutcome outcome, UserResponse response) {
    }

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final SessionInvalidator sessions;
    private final AuditRecorder audit;
    private final EmployeeLeaveFacts leaveFacts;
    private final Clock clock;

    public UserAdminService(UserRepository users,
                            PasswordEncoder encoder,
                            SessionInvalidator sessions,
                            AuditRecorder audit,
                            EmployeeLeaveFacts leaveFacts,
                            Clock clock) {
        this.users = users;
        this.encoder = encoder;
        this.sessions = sessions;
        this.audit = audit;
        this.leaveFacts = leaveFacts;
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
                               LocalDate hireDate,
                               LocalDate birthDate,
                               boolean hasSchoolAgeChild) {
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
        if (!HireDatePolicy.isSane(hireDate, clock)) {
            // N-03: creation carries the same 1950…today bound the edit enforces; without it a
            // 1900-01-01 typo would arrive with ~3,168 business days of entitlement.
            return new CreateResult(CreateOutcome.INVALID_HIRE_DATE, null);
        }
        if (!BirthDatePolicy.isSane(birthDate, clock)) {
            // B2: the birth date is HR-entered on both paths, so it has one validator and one code.
            return new CreateResult(CreateOutcome.INVALID_BIRTH_DATE, null);
        }
        String temporaryPassword = TemporaryPassword.generate();
        User user = User.create(email, displayName, role, encoder.encode(temporaryPassword),
                managerId, hireDate, birthDate, hasSchoolAgeChild, clock.instant());
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
     * HR backfills the org data of an existing account (L-04): the manager link, the hire date, and
     * (phase B2) the birth date and school-age-child flag BR-10 needs. There is no bulk migration — a
     * V2-era account is edited one by one by HR, and until its hire date is set its annual
     * entitlement is zero (L-05) rather than a guess.
     *
     * <p>The manager must be an active MANAGER and may not be the account itself or one of its own
     * reports (a cycle), so BR-7's "direct manager decides" stays true after every edit.
     *
     * <p>Review round 2 adds three gates, all before the row is touched:
     * <ul>
     *   <li>M-04: the same self-action and protected-account rules as deactivate/reset — an edit of
     *       your own account, or of a seeded HR/CEO account, would hand the admin screen a takeover
     *       path the other two endpoints already refuse;</li>
     *   <li>M-02: clearing the manager of an employee with a pending request would leave that
     *       request without the one person who may decide it (BR-7);</li>
     *   <li>M-01: the new hire date is run through the leave module's own balance
     *       ({@link EmployeeLeaveFacts}) before it is stored, so "bakiye negatif olamaz" holds after
     *       an org edit too — a refusal leaves the row exactly as it was.</li>
     * </ul>
     *
     * <p>Review round 3 adds two more, for the invariant the balance cannot see:
     * <ul>
     *   <li>N-01: a hire date after the start of an active leave is refused
     *       ({@code INVALID_HIRE_DATE}) — an excuse leave is balance-free and an annual one may still
     *       leave a positive remainder, so {@code USER_EDIT_WOULD_GO_NEGATIVE} alone would let the
     *       leave begin before the employment did;</li>
     *   <li>N-03: the 1950…today bound is the same {@link HireDatePolicy} creation uses.</li>
     * </ul>
     *
     * <p>Phase B2 adds the birth-date bound ({@link BirthDatePolicy}); the two personal-data fields
     * and both org fields then appear on both sides of the {@code USER_UPDATED} audit event (D18).
     */
    @Transactional
    public UpdateResult update(UUID actorId,
                               UUID targetId,
                               UUID managerId,
                               LocalDate hireDate,
                               LocalDate birthDate,
                               boolean hasSchoolAgeChild) {
        if (actorId.equals(targetId)) {
            return new UpdateResult(AdminOutcome.SELF_ACTION, null);
        }
        Optional<User> found = users.lockById(targetId);
        if (found.isEmpty()) {
            return new UpdateResult(AdminOutcome.NOT_FOUND, null);
        }
        User user = found.get();
        if (isProtected(user)) {
            return new UpdateResult(AdminOutcome.PROTECTED_ACCOUNT, null);
        }
        if (!isAssignableManager(managerId)
                || targetId.equals(managerId)
                || createsCycle(targetId, managerId)) {
            return new UpdateResult(AdminOutcome.INVALID_MANAGER, null);
        }
        if (!HireDatePolicy.isSane(hireDate, clock)) {
            return new UpdateResult(AdminOutcome.INVALID_HIRE_DATE, null);
        }
        if (!BirthDatePolicy.isSane(birthDate, clock)) {
            return new UpdateResult(AdminOutcome.INVALID_BIRTH_DATE, null);
        }
        if (hireDate != null && leaveFacts.hasActiveLeaveStartingBefore(targetId, hireDate)) {
            // N-01: docs/domain.md's "izin işe girişten önce başlayamaz" after an edit too. This is
            // decided before the balance gate so the answer names the real reason (the date, not a
            // negative remainder) and the row is never written.
            return new UpdateResult(AdminOutcome.INVALID_HIRE_DATE, null);
        }
        if (managerId == null && leaveFacts.hasPendingRequests(targetId)) {
            // M-02: only the direct manager can decide these; clearing the link strands them.
            return new UpdateResult(AdminOutcome.HAS_PENDING_REQUESTS, null);
        }
        Optional<BigDecimal> remaining = leaveFacts.remainingIfHiredOn(targetId, hireDate);
        if (remaining.isEmpty()) {
            return new UpdateResult(AdminOutcome.NOT_FOUND, null);
        }
        if (remaining.get().signum() < 0) {
            // M-01: the domain invariant (docs/domain.md) — no sequence of HR edits may leave the
            // balance below zero, so the edit is refused and the row is never written.
            return new UpdateResult(AdminOutcome.WOULD_GO_NEGATIVE, null);
        }
        UUID beforeManager = user.getManagerId();
        LocalDate beforeHireDate = user.getHireDate();
        LocalDate beforeBirthDate = user.getBirthDate();
        boolean beforeSchoolAgeChild = user.hasSchoolAgeChild();
        user.updateOrg(managerId, hireDate, birthDate, hasSchoolAgeChild, clock.instant());
        users.save(user);
        audit.userUpdated(actorId, user.getId(),
                beforeManager, beforeHireDate, beforeBirthDate, beforeSchoolAgeChild,
                managerId, hireDate, birthDate, hasSchoolAgeChild);
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

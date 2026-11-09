package com.company.leavemanager.audit.api;

import com.company.leavemanager.audit.internal.AuditEvent;
import com.company.leavemanager.audit.internal.AuditRepository;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.util.UUID;

/**
 * The audit module's public API: every write event of the application is recorded here.
 * Details never contain a password (plain text or hash) and personal data is masked.
 *
 * <p>A decision carries the state it changed from and the state it moved to as small JSON objects
 * (backlog B-7): the trail answers "önce/sonra" with structured fields instead of parsing details.
 */
@Service
public class AuditRecorder {

    private final AuditRepository repository;
    private final Clock clock;

    public AuditRecorder(AuditRepository repository, Clock clock) {
        this.repository = repository;
        this.clock = clock;
    }

    public void record(String eventType, UUID actorUserId, UUID targetUserId, String details) {
        record(eventType, actorUserId, targetUserId, details, null, null);
    }

    public void record(String eventType,
                       UUID actorUserId,
                       UUID targetUserId,
                       String details,
                       String beforeState,
                       String afterState) {
        repository.save(AuditEvent.of(eventType, actorUserId, targetUserId, details,
                beforeState, afterState, clock.instant()));
    }

    public void loginSucceeded(UUID userId) {
        record("LOGIN_SUCCEEDED", userId, userId, null);
    }

    public void loginFailed(UUID userId, String maskedEmail) {
        record("LOGIN_FAILED", userId, null, "email=" + maskedEmail);
    }

    public void accountLocked(UUID userId) {
        record("ACCOUNT_LOCKED", userId, userId, null);
    }

    public void logout(UUID userId) {
        record("LOGOUT", userId, userId, null);
    }

    public void userCreated(UUID actor, UUID target, String role) {
        record("USER_CREATED", actor, target, "role=" + role);
    }

    public void userDeactivated(UUID actor, UUID target) {
        record("USER_DEACTIVATED", actor, target, null);
    }

    public void passwordReset(UUID actor, UUID target) {
        record("PASSWORD_RESET", actor, target, null);
    }

    public void passwordChanged(UUID userId) {
        record("PASSWORD_CHANGED", userId, userId, null);
    }

    /** A leave request was created; the state it enters is PENDING (AC-7). */
    public void leaveRequested(UUID actor, UUID target, UUID requestId, String type, int businessDays) {
        record("LEAVE_REQUESTED", actor, target,
                "requestId=" + requestId + "; type=" + type + "; businessDays=" + businessDays,
                null, state("PENDING"));
    }

    /** A manager decided: the record says PENDING → APPROVED, or PENDING → REJECTED (B-7). */
    public void leaveDecided(String eventType, UUID actor, UUID target, UUID requestId, String from, String to) {
        record(eventType, actor, target, "requestId=" + requestId, state(from), state(to));
    }

    /** The employee withdrew an approved request; the balance is available again (BR-8). */
    public void leaveCancelled(UUID actor, UUID target, UUID requestId, String from) {
        record("LEAVE_CANCELLED", actor, target, "requestId=" + requestId,
                state(from), state("CANCELLED"));
    }

    /** HR corrected an annual-leave balance; before/after are the remaining days (AC-7). */
    public void leaveBalanceAdjusted(UUID actor, UUID target, int days, int before, int after, String reason) {
        record("LEAVE_BALANCE_ADJUSTED", actor, target,
                "days=" + days + "; reason=" + reason,
                "{\"remaining\":" + before + "}",
                "{\"remaining\":" + after + "}");
    }

    private static String state(String status) {
        return "{\"status\":\"" + status + "\"}";
    }
}

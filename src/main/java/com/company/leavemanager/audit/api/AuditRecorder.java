package com.company.leavemanager.audit.api;

import com.company.leavemanager.audit.internal.AuditEvent;
import com.company.leavemanager.audit.internal.AuditRepository;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.util.UUID;

/**
 * The audit module's public API: every write event of the application is recorded here.
 * Details never contain a password (plain text or hash) and personal data is masked.
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
        repository.save(AuditEvent.of(eventType, actorUserId, targetUserId, details, clock.instant()));
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
}

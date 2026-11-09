package com.company.leavemanager.audit.api;

import com.company.leavemanager.audit.internal.AuditEvent;
import com.company.leavemanager.audit.internal.AuditRepository;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * The audit module's public API: every write event of the application is recorded here.
 * Details never contain a password (plain text or hash) and personal data is masked.
 *
 * <p>A decision carries the state it changed from and the state it moved to as JSON objects
 * (backlog B-7): the trail answers "önce/sonra" with structured fields instead of parsing details.
 * The objects are maps and the columns are {@code jsonb} (L-15), so the database — not a string
 * builder — owns JSON validity and can query the keys.
 */
@Service
public class AuditRecorder {

    /**
     * What a before/after state says about an audited row. The key names are the documented ones
     * (status, remaining, managerId, hireDate); a test parses the stored JSON back to check them.
     */
    private static final String STATUS = "status";
    private static final String REMAINING = "remaining";
    private static final String MANAGER_ID = "managerId";
    private static final String HIRE_DATE = "hireDate";

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
                       Map<String, Object> beforeState,
                       Map<String, Object> afterState) {
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

    /** HR set (or cleared) the manager link and the hire date; the record carries both sides. */
    public void userUpdated(UUID actor,
                            UUID target,
                            UUID beforeManager,
                            java.time.LocalDate beforeHireDate,
                            UUID afterManager,
                            java.time.LocalDate afterHireDate) {
        record("USER_UPDATED", actor, target,
                "managerId=" + afterManager + "; hireDate=" + afterHireDate,
                employeeState(beforeManager, beforeHireDate),
                employeeState(afterManager, afterHireDate));
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
                null, leaveState("PENDING"));
    }

    /**
     * BR-11's exception: HR recorded a request whose start is in the past, with its reason. The
     * event type keeps the {@code LEAVE_} prefix every leave trail reader filters on.
     */
    public void leaveRetroactiveRequested(UUID actor,
                                          UUID target,
                                          UUID requestId,
                                          String type,
                                          int businessDays,
                                          String reason) {
        record("LEAVE_RETROACTIVE_REQUESTED", actor, target,
                "requestId=" + requestId + "; type=" + type + "; businessDays=" + businessDays
                        + "; reason=" + reason,
                null, leaveState("PENDING"));
    }

    /** A manager decided: the record says PENDING → APPROVED, or PENDING → REJECTED (B-7). */
    public void leaveDecided(String eventType, UUID actor, UUID target, UUID requestId, String from, String to) {
        record(eventType, actor, target, "requestId=" + requestId, leaveState(from), leaveState(to));
    }

    /** The employee withdrew an approved request; the balance is available again (BR-8). */
    public void leaveCancelled(UUID actor, UUID target, UUID requestId, String from) {
        record("LEAVE_CANCELLED", actor, target, "requestId=" + requestId,
                leaveState(from), leaveState("CANCELLED"));
    }

    /** HR corrected an annual-leave balance; before/after are the remaining days (AC-7). */
    public void leaveBalanceAdjusted(UUID actor, UUID target, int days, int before, int after, String reason) {
        record("LEAVE_BALANCE_ADJUSTED", actor, target,
                "days=" + days + "; reason=" + reason,
                remainingState(before),
                remainingState(after));
    }

    private static Map<String, Object> leaveState(String status) {
        Map<String, Object> state = new LinkedHashMap<>();
        state.put(STATUS, status);
        return state;
    }

    private static Map<String, Object> remainingState(int remaining) {
        Map<String, Object> state = new LinkedHashMap<>();
        state.put(REMAINING, remaining);
        return state;
    }

    private static Map<String, Object> employeeState(UUID managerId, java.time.LocalDate hireDate) {
        Map<String, Object> state = new LinkedHashMap<>();
        state.put(MANAGER_ID, managerId == null ? null : managerId.toString());
        state.put(HIRE_DATE, hireDate == null ? null : hireDate.toString());
        return state;
    }
}

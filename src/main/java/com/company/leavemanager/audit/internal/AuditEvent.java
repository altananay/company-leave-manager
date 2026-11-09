package com.company.leavemanager.audit.internal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * One audit row: who did what, when, and — for a state change — the state before and after.
 *
 * <p>{@code beforeState}/{@code afterState} are real {@code jsonb} columns (V5, spec 0004 review
 * round 1, L-15): the database can query them with its JSON operators, and a value that is not JSON
 * cannot be stored at all. The Java side is a map, so no call site hand-builds JSON text.
 */
@Entity
@Table(name = "audit_event")
public class AuditEvent {

    @Id
    private UUID id;

    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;

    @Column(name = "event_type", nullable = false)
    private String eventType;

    @Column(name = "actor_user_id")
    private UUID actorUserId;

    @Column(name = "target_user_id")
    private UUID targetUserId;

    @Column
    private String details;

    /** The state the record was in before the change — a JSON object (backlog B-7, BR-13). */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "before_state", columnDefinition = "jsonb")
    private Map<String, Object> beforeState;

    /** The state the record is in after the change — a JSON object (backlog B-7, BR-13). */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "after_state", columnDefinition = "jsonb")
    private Map<String, Object> afterState;

    protected AuditEvent() {
        // for JPA
    }

    public static AuditEvent of(String eventType,
                                UUID actorUserId,
                                UUID targetUserId,
                                String details,
                                Map<String, Object> beforeState,
                                Map<String, Object> afterState,
                                Instant now) {
        AuditEvent event = new AuditEvent();
        event.id = UUID.randomUUID();
        event.eventType = eventType;
        event.actorUserId = actorUserId;
        event.targetUserId = targetUserId;
        event.details = details;
        event.beforeState = beforeState;
        event.afterState = afterState;
        event.occurredAt = now;
        return event;
    }

    public UUID getId() {
        return id;
    }

    public Instant getOccurredAt() {
        return occurredAt;
    }

    public String getEventType() {
        return eventType;
    }

    public UUID getActorUserId() {
        return actorUserId;
    }

    public UUID getTargetUserId() {
        return targetUserId;
    }

    public String getDetails() {
        return details;
    }

    public Map<String, Object> getBeforeState() {
        return beforeState;
    }

    public Map<String, Object> getAfterState() {
        return afterState;
    }
}

package com.company.leavemanager.audit.internal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.util.UUID;

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

    protected AuditEvent() {
        // for JPA
    }

    public static AuditEvent of(String eventType, UUID actorUserId, UUID targetUserId, String details, Instant now) {
        AuditEvent event = new AuditEvent();
        event.id = UUID.randomUUID();
        event.eventType = eventType;
        event.actorUserId = actorUserId;
        event.targetUserId = targetUserId;
        event.details = details;
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
}

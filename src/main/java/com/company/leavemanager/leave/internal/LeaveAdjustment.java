package com.company.leavemanager.leave.internal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.UUID;

/** An HR balance correction; the reason is mandatory and every row produces an audit event (BR-8). */
@Entity
@Table(name = "leave_adjustment")
public class LeaveAdjustment {

    @Id
    private UUID id;

    @Column(name = "employee_id", nullable = false)
    private UUID employeeId;

    @Column(nullable = false, precision = 6, scale = 1)
    private BigDecimal days;

    @Column(nullable = false)
    private String reason;

    @Column(name = "created_by", nullable = false)
    private UUID createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected LeaveAdjustment() {
        // for JPA
    }

    public static LeaveAdjustment of(UUID employeeId,
                                     BigDecimal days,
                                     String reason,
                                     UUID createdBy,
                                     Instant now) {
        LeaveAdjustment adjustment = new LeaveAdjustment();
        adjustment.id = UUID.randomUUID();
        adjustment.employeeId = employeeId;
        adjustment.days = days.setScale(LeaveBalance.SCALE, RoundingMode.UNNECESSARY);
        adjustment.reason = reason;
        adjustment.createdBy = createdBy;
        adjustment.createdAt = now;
        return adjustment;
    }

    public UUID getId() {
        return id;
    }

    public UUID getEmployeeId() {
        return employeeId;
    }

    public BigDecimal getDays() {
        return days;
    }

    public String getReason() {
        return reason;
    }

    public UUID getCreatedBy() {
        return createdBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}

package com.company.leavemanager.leave.internal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * One leave request and its state machine (BR-8): {@code PENDING → APPROVED | REJECTED} and
 * {@code APPROVED → CANCELLED}. The entity refuses an illegal transition itself, so no caller can
 * reach a state the domain forbids — the service decides which legal transition applies and maps the
 * refusal to the API's error code.
 */
@Entity
@Table(name = "leave_request")
public class LeaveRequest {

    @Id
    private UUID id;

    @Column(name = "employee_id", nullable = false)
    private UUID employeeId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private LeaveType type;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    @Enumerated(EnumType.STRING)
    @Column(name = "half_day", nullable = false)
    private HalfDay halfDay;

    /** Working days fixed at creation (BR-4): later holiday edits never rewrite this row. */
    @Column(name = "business_days", nullable = false)
    private int businessDays;

    @Column
    private String reason;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private LeaveRequestStatus status;

    @Column(name = "decided_by")
    private UUID decidedBy;

    @Column(name = "decided_at")
    private Instant decidedAt;

    @Column(name = "decision_note")
    private String decisionNote;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    /** BR-11's HR exception, frozen with the row: only HR records a request that starts in the past. */
    @Column(nullable = false)
    private boolean retroactive;

    /** When the approved request was withdrawn; the decision's own timestamp stays untouched. */
    @Column(name = "cancelled_at")
    private Instant cancelledAt;

    @Column(name = "cancelled_by")
    private UUID cancelledBy;

    protected LeaveRequest() {
        // for JPA
    }

    public static LeaveRequest create(UUID employeeId,
                                      LeaveType type,
                                      LocalDate startDate,
                                      LocalDate endDate,
                                      int businessDays,
                                      String reason,
                                      Instant now) {
        return create(employeeId, type, startDate, endDate, businessDays, reason, false, now);
    }

    public static LeaveRequest create(UUID employeeId,
                                      LeaveType type,
                                      LocalDate startDate,
                                      LocalDate endDate,
                                      int businessDays,
                                      String reason,
                                      boolean retroactive,
                                      Instant now) {
        LeaveRequest request = new LeaveRequest();
        request.id = UUID.randomUUID();
        request.employeeId = employeeId;
        request.type = type;
        request.startDate = startDate;
        request.endDate = endDate;
        request.halfDay = HalfDay.NONE;
        request.businessDays = businessDays;
        request.reason = reason;
        request.status = LeaveRequestStatus.PENDING;
        request.createdAt = now;
        request.retroactive = retroactive;
        return request;
    }

    /** PENDING → APPROVED. The manager's decision and its note are stored with it (BR-7, BR-13). */
    public void approve(UUID managerId, String note, Instant now) {
        requireStatus(LeaveRequestStatus.PENDING, "approve");
        this.status = LeaveRequestStatus.APPROVED;
        this.decidedBy = managerId;
        this.decidedAt = now;
        this.decisionNote = note;
    }

    /** PENDING → REJECTED; the balance was never consumed, so nothing is restored (BR-8). */
    public void reject(UUID managerId, String note, Instant now) {
        requireStatus(LeaveRequestStatus.PENDING, "reject");
        this.status = LeaveRequestStatus.REJECTED;
        this.decidedBy = managerId;
        this.decidedAt = now;
        this.decisionNote = note;
    }

    /**
     * APPROVED → CANCELLED before the start date; the pending balance returns (BR-8). The withdrawal
     * is recorded beside the decision, never on top of it: {@code decidedAt}/{@code decidedBy} keep
     * answering "who approved this and when" (L-17).
     */
    public void cancel(UUID actorId, Instant now) {
        requireStatus(LeaveRequestStatus.APPROVED, "cancel");
        this.status = LeaveRequestStatus.CANCELLED;
        this.cancelledBy = actorId;
        this.cancelledAt = now;
    }

    public boolean overlaps(LocalDate otherStart, LocalDate otherEnd) {
        return !startDate.isAfter(otherEnd) && !endDate.isBefore(otherStart);
    }

    public boolean hasStarted(LocalDate today) {
        return !today.isBefore(startDate);
    }

    private void requireStatus(LeaveRequestStatus expected, String action) {
        if (status != expected) {
            throw new IllegalStateException("cannot " + action + " a " + status + " request");
        }
    }

    public UUID getId() {
        return id;
    }

    public UUID getEmployeeId() {
        return employeeId;
    }

    public LeaveType getType() {
        return type;
    }

    public LocalDate getStartDate() {
        return startDate;
    }

    public LocalDate getEndDate() {
        return endDate;
    }

    public HalfDay getHalfDay() {
        return halfDay;
    }

    public int getBusinessDays() {
        return businessDays;
    }

    public String getReason() {
        return reason;
    }

    public LeaveRequestStatus getStatus() {
        return status;
    }

    public UUID getDecidedBy() {
        return decidedBy;
    }

    public Instant getDecidedAt() {
        return decidedAt;
    }

    public String getDecisionNote() {
        return decisionNote;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public boolean isRetroactive() {
        return retroactive;
    }

    public Instant getCancelledAt() {
        return cancelledAt;
    }

    public UUID getCancelledBy() {
        return cancelledBy;
    }
}

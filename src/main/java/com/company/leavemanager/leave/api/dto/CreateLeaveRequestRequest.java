package com.company.leavemanager.leave.api.dto;

import com.company.leavemanager.leave.internal.LeaveType;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

/**
 * A new request. Phase A has no half-day field: the column exists and stores NONE until phase B
 * turns it on. Validation is structural only — the business rules (BR-5, BR-6, BR-11) live in the
 * service (docs/security.md).
 */
public record CreateLeaveRequestRequest(
        @NotNull LeaveType type,
        @NotNull LocalDate startDate,
        @NotNull LocalDate endDate,
        @Size(max = 500) String reason) {
}

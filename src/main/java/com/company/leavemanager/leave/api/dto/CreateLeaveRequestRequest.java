package com.company.leavemanager.leave.api.dto;

import com.company.leavemanager.leave.internal.LeaveType;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.UUID;

/**
 * A new request. Phase A has no half-day field: the column exists and stores NONE until phase B
 * turns it on. Validation is structural only — the business rules (BR-5, BR-6, BR-11, the 366-day
 * range cap, the excuse bounds) live in the service (docs/security.md), because each has to answer
 * with its own stable error code rather than a generic validation failure.
 *
 * <p>{@code employeeId} is the HR path: HR records a request on behalf of an employee (BR-11's
 * retroactive exception uses it); anybody else may only create their own, and the service enforces
 * that, not this record.
 */
public record CreateLeaveRequestRequest(
        @NotNull LeaveType type,
        @NotNull LocalDate startDate,
        @NotNull LocalDate endDate,
        @Size(max = 500) String reason,
        UUID employeeId) {
}

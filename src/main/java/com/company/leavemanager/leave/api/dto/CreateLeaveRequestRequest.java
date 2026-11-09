package com.company.leavemanager.leave.api.dto;

import com.company.leavemanager.leave.internal.HalfDay;
import com.company.leavemanager.leave.internal.LeaveType;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.UUID;

/**
 * A new request. {@code halfDay} is nullable: absent or {@code NONE} is a whole-day request, and
 * D15's rule (single day, ANNUAL/EXCUSE only) lives in the service because it answers with its own
 * stable error code rather than a generic validation failure.
 *
 * <p>Validation is structural only — the business rules (BR-5, BR-6, BR-11, the 366-day range cap,
 * the excuse bounds, the half-day rule) live in the service (docs/security.md).
 *
 * <p>{@code employeeId} is the HR path: HR records a request on behalf of an employee (BR-11's
 * retroactive exception uses it); anybody else may only create their own, and the service enforces
 * that, not this record.
 */
public record CreateLeaveRequestRequest(
        @NotNull LeaveType type,
        @NotNull LocalDate startDate,
        @NotNull LocalDate endDate,
        HalfDay halfDay,
        @Size(max = 500) String reason,
        UUID employeeId) {
}

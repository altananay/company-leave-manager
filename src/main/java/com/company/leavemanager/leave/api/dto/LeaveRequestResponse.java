package com.company.leavemanager.leave.api.dto;

import com.company.leavemanager.leave.internal.HalfDay;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * One request as the API shows it. {@code businessDays} is the decimal day unit (D16): a half day
 * is {@code 0.5}; {@code halfDay} carries the AM/PM selection and is {@code NONE} otherwise.
 * {@code kinship} is BR-10's bereavement detail (D17) and is null for every other type.
 * {@code cancellable} answers "may the owner withdraw it right now" (BR-8: approved and not started
 * yet) so the screen does not re-derive a rule of its own. {@code cancelledAt}/{@code
 * cancelledByName} are the withdrawal's own record and never overwrite the decision's ({@code
 * decidedAt}/{@code decidedByName}, L-17). {@code retroactive} marks the HR-recorded request that
 * started in the past (BR-11's exception, L-06).
 */
public record LeaveRequestResponse(
        UUID id,
        UUID employeeId,
        String employeeName,
        String type,
        String kinship,
        LocalDate startDate,
        LocalDate endDate,
        HalfDay halfDay,
        BigDecimal businessDays,
        String status,
        String reason,
        UUID decidedBy,
        String decidedByName,
        Instant decidedAt,
        String decisionNote,
        Instant createdAt,
        boolean cancellable,
        Instant cancelledAt,
        UUID cancelledBy,
        String cancelledByName,
        boolean retroactive) {
}

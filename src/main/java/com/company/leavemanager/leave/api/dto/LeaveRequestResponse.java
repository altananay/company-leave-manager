package com.company.leavemanager.leave.api.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

/**
 * One request as the API shows it. {@code cancellable} answers "may the owner withdraw it right now"
 * (BR-8: approved and not started yet) so the screen does not re-derive a rule of its own.
 */
public record LeaveRequestResponse(
        UUID id,
        UUID employeeId,
        String employeeName,
        String type,
        LocalDate startDate,
        LocalDate endDate,
        int businessDays,
        String status,
        String reason,
        UUID decidedBy,
        String decidedByName,
        Instant decidedAt,
        String decisionNote,
        Instant createdAt,
        boolean cancellable) {
}

package com.company.leavemanager.leave.api.dto;

/** What the form shows before it sends: the working-day count and the balance left after it. */
public record PreviewResponse(int businessDays, int remainingAfter) {
}

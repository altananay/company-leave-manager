package com.company.leavemanager.leave.api.dto;

import java.math.BigDecimal;

/**
 * What the form shows before it sends: the working-day count and the balance left after it. Both
 * are the decimal day unit, so a half-day summary reads {@code 0.5} (D15/D16).
 */
public record PreviewResponse(BigDecimal businessDays, BigDecimal remainingAfter) {
}

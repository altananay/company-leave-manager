package com.company.leavemanager.leave.api.dto;

import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * An HR balance correction: who, how much (negative corrects downward) and why (BR-8). The amount
 * is the decimal day unit with at most one decimal place (D16); the service additionally requires a
 * nonzero half-day step within ±365 days, because those are business rules with their own code.
 */
public record AdjustBalanceRequest(
        @NotNull UUID employeeId,
        @NotNull @Digits(integer = 3, fraction = 1) BigDecimal days,
        @NotBlank @Size(max = 500) String reason) {
}

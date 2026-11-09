package com.company.leavemanager.leave.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

/** An HR balance correction: who, how many days (negative corrects downward) and why (BR-8). */
public record AdjustBalanceRequest(
        @NotNull UUID employeeId,
        @NotNull Integer days,
        @NotBlank @Size(max = 500) String reason) {
}

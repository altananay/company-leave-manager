package com.company.leavemanager.identity.api.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

import java.time.LocalDate;
import java.util.UUID;

/**
 * The manager and the hire date are optional: an account made before spec 0004 has neither, and the
 * form sends them only once HR has the data (AC-8).
 */
public record CreateUserRequest(
        @NotBlank @Email String email,
        @NotBlank String displayName,
        @NotBlank String role,
        UUID managerId,
        LocalDate hireDate) {
}

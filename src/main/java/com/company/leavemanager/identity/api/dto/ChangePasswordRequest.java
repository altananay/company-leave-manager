package com.company.leavemanager.identity.api.dto;

import jakarta.validation.constraints.NotBlank;

public record ChangePasswordRequest(
        @NotBlank String currentPassword,
        @NotBlank String newPassword,
        @NotBlank String confirmPassword) {
}

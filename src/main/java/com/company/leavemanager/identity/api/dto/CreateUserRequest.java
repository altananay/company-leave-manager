package com.company.leavemanager.identity.api.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

import java.time.LocalDate;
import java.util.UUID;

/**
 * The manager, the hire date and — since phase B2 — the birth date and the school-age-child flag are
 * optional: an account made before spec 0004 has none, and the form sends them only once HR has the
 * data (AC-8, D17/D18). The flag is boxed so an older client that omits it reads as {@code false}
 * instead of failing deserialisation.
 */
public record CreateUserRequest(
        @NotBlank @Email String email,
        @NotBlank String displayName,
        @NotBlank String role,
        UUID managerId,
        LocalDate hireDate,
        LocalDate birthDate,
        Boolean hasSchoolAgeChild) {
}

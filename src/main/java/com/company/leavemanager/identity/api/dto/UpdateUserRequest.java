package com.company.leavemanager.identity.api.dto;

import java.time.LocalDate;
import java.util.UUID;

/**
 * HR's org-data edit of an existing account (spec 0004 review round 1, L-04): the whole set is
 * replaced on every call, and a null clears a date. Since phase B2 the set also carries the birth
 * date and the school-age-child flag BR-10 needs (D17/D18); those are still entered by HR only.
 * Only these fields are writable — role, password and the active flag have their own endpoints and
 * rules. The flag is boxed so an omitted property reads as {@code false} (the field's default).
 */
public record UpdateUserRequest(
        UUID managerId,
        LocalDate hireDate,
        LocalDate birthDate,
        Boolean hasSchoolAgeChild) {
}

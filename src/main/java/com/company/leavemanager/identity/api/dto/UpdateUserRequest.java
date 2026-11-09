package com.company.leavemanager.identity.api.dto;

import java.time.LocalDate;
import java.util.UUID;

/**
 * HR's org-data edit of an existing account (spec 0004 review round 1, L-04): the whole pair is
 * replaced on every call, and a null clears the field. Only these two fields are writable — role,
 * password and the active flag have their own endpoints and rules.
 */
public record UpdateUserRequest(UUID managerId, LocalDate hireDate) {
}

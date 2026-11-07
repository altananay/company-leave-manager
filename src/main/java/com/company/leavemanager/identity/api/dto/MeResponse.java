package com.company.leavemanager.identity.api.dto;

import java.util.UUID;

public record MeResponse(
        UUID id,
        String email,
        String displayName,
        String role,
        boolean mustChangePassword) {
}

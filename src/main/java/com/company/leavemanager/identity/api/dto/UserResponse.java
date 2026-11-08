package com.company.leavemanager.identity.api.dto;

import com.company.leavemanager.identity.internal.User;

import java.util.UUID;

public record UserResponse(
        UUID id,
        String email,
        String displayName,
        String role,
        boolean active,
        boolean mustChangePassword) {

    public static UserResponse of(User user) {
        return new UserResponse(
                user.getId(),
                user.getEmail(),
                user.getDisplayName(),
                user.getRole().name(),
                user.isActive(),
                user.isMustChangePassword());
    }
}

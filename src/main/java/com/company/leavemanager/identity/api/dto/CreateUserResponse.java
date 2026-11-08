package com.company.leavemanager.identity.api.dto;

/** The temporary password is returned exactly once, at creation or reset time. */
public record CreateUserResponse(UserResponse user, String temporaryPassword) {
}

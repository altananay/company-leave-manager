package com.company.leavemanager.identity.internal;

public final class PasswordPolicy {

    public static final int MIN_LENGTH = 12;

    private PasswordPolicy() {
    }

    /** Throws {@link IllegalArgumentException} when the password does not satisfy the policy. */
    public static void validate(String rawPassword) {
        if (rawPassword == null || rawPassword.length() < MIN_LENGTH) {
            throw new IllegalArgumentException("Password must be at least " + MIN_LENGTH + " characters long");
        }
    }
}

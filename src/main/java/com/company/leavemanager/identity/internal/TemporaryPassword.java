package com.company.leavemanager.identity.internal;

import java.security.SecureRandom;

/** Generates the one-time password an HR user hands to a new user (never stored in clear text). */
public final class TemporaryPassword {

    private static final String ALPHABET =
            "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int LENGTH = 16;

    private TemporaryPassword() {
    }

    public static String generate() {
        StringBuilder builder = new StringBuilder(LENGTH);
        for (int i = 0; i < LENGTH; i++) {
            builder.append(ALPHABET.charAt(RANDOM.nextInt(ALPHABET.length())));
        }
        return builder.toString();
    }
}

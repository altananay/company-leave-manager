package com.company.leavemanager.audit.api;

/** Masks personal data before it reaches a log or the audit trail. */
public final class Mask {

    private Mask() {
    }

    /** {@code mehmet.can@acme.com} becomes {@code m***@acme.com}. */
    public static String email(String email) {
        if (email == null || email.isBlank()) {
            return "-";
        }
        int at = email.indexOf('@');
        if (at <= 0) {
            return "***";
        }
        return email.charAt(0) + "***" + email.substring(at);
    }
}

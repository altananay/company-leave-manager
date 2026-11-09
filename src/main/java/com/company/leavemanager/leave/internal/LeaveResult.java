package com.company.leavemanager.leave.internal;

/**
 * A use-case answer: either a value or the business error to map to a response. The service never
 * formats JSON and never touches HTTP (docs/security.md: business invariants live in the service).
 */
public record LeaveResult<T>(T value, LeaveError error) {

    public static <T> LeaveResult<T> ok(T value) {
        return new LeaveResult<>(value, null);
    }

    public static <T> LeaveResult<T> error(LeaveError error) {
        return new LeaveResult<>(null, error);
    }

    public boolean failed() {
        return error != null;
    }
}

package com.company.leavemanager.leave.internal;

import org.springframework.http.HttpStatus;

/**
 * The leave module's business errors. Each code is stable English (docs/conventions.md) and the
 * controller is the only place it becomes an RFC 9457 body.
 */
public enum LeaveError {

    NOT_FOUND(HttpStatus.NOT_FOUND, "NOT_FOUND"),
    NOT_AUTHORIZED(HttpStatus.FORBIDDEN, "NOT_AUTHORIZED"),
    INVALID_PARAMETER(HttpStatus.BAD_REQUEST, "INVALID_PARAMETER"),
    INVALID_RANGE(HttpStatus.BAD_REQUEST, "LEAVE_INVALID_RANGE"),
    RANGE_TOO_LONG(HttpStatus.BAD_REQUEST, "LEAVE_RANGE_TOO_LONG"),
    PAST_DATE(HttpStatus.BAD_REQUEST, "LEAVE_PAST_DATE"),
    NO_WORKING_DAY(HttpStatus.BAD_REQUEST, "LEAVE_NO_WORKING_DAY"),
    REASON_REQUIRED(HttpStatus.BAD_REQUEST, "LEAVE_REASON_REQUIRED"),
    EXCUSE_TOO_LONG(HttpStatus.BAD_REQUEST, "LEAVE_EXCUSE_TOO_LONG"),
    RETROACTIVE_REASON_REQUIRED(HttpStatus.BAD_REQUEST, "LEAVE_RETROACTIVE_REASON_REQUIRED"),
    INVALID_ADJUSTMENT(HttpStatus.BAD_REQUEST, "LEAVE_INVALID_ADJUSTMENT"),
    NO_MANAGER(HttpStatus.FORBIDDEN, "LEAVE_NO_MANAGER"),
    NO_HIRE_DATE(HttpStatus.CONFLICT, "LEAVE_NO_HIRE_DATE"),
    NOT_MANAGER(HttpStatus.FORBIDDEN, "LEAVE_NOT_MANAGER"),
    NOT_OWNER(HttpStatus.FORBIDDEN, "LEAVE_NOT_OWNER"),
    OVERLAP(HttpStatus.CONFLICT, "LEAVE_OVERLAP"),
    BALANCE_EXCEEDED(HttpStatus.CONFLICT, "LEAVE_BALANCE_EXCEEDED"),
    ADJUSTMENT_NOT_ALLOWED(HttpStatus.CONFLICT, "LEAVE_ADJUSTMENT_NOT_ALLOWED"),
    NOT_PENDING(HttpStatus.CONFLICT, "LEAVE_NOT_PENDING"),
    NOT_APPROVED(HttpStatus.CONFLICT, "LEAVE_NOT_APPROVED"),
    ALREADY_STARTED(HttpStatus.CONFLICT, "LEAVE_ALREADY_STARTED");

    private final HttpStatus status;
    private final String code;

    LeaveError(HttpStatus status, String code) {
        this.status = status;
        this.code = code;
    }

    public HttpStatus status() {
        return status;
    }

    public String code() {
        return code;
    }
}

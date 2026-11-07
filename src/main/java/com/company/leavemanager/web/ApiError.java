package com.company.leavemanager.web;

import java.util.List;

/** The project's error body: a status, a stable English code and, for validation, field errors. */
public record ApiError(int status, String code, List<String> errors) {

    public static ApiError of(int status, String code) {
        return new ApiError(status, code, List.of());
    }
}

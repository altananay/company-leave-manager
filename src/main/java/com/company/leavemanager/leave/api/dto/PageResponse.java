package com.company.leavemanager.leave.api.dto;

import java.util.List;

/** A page of the list endpoints: default 20, at most 100 (spec 0004, Performance). */
public record PageResponse<T>(List<T> items, int page, int size, long total, int totalPages) {

    public static <T> PageResponse<T> of(List<T> items, int page, int size, long total) {
        int totalPages = size == 0 ? 0 : (int) Math.ceil((double) total / size);
        return new PageResponse<>(items, page, size, total, totalPages);
    }
}

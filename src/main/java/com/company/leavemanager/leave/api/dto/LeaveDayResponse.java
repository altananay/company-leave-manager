package com.company.leavemanager.leave.api.dto;

import com.company.leavemanager.leave.internal.HalfDay;

import java.time.LocalDate;
import java.util.UUID;

/**
 * One day the caller is on approved leave (D20, "izinli günlerim"). A request that spans several
 * working days contributes one entry per day; a half-day request contributes its single date with
 * {@code halfDay} set, so the screen can render "öğleden önce/sonra".
 */
public record LeaveDayResponse(LocalDate date, String type, HalfDay halfDay, UUID requestId) {
}

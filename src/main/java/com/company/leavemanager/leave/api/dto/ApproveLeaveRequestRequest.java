package com.company.leavemanager.leave.api.dto;

import jakarta.validation.constraints.Size;

/** An approval note is optional: the decision itself is the record (spec 0004). */
public record ApproveLeaveRequestRequest(
        @Size(max = 500) String note) {
}

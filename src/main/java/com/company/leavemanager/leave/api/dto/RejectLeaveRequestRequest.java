package com.company.leavemanager.leave.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** A rejection always carries its reason; a rejection without one is not a decision (spec 0004). */
public record RejectLeaveRequestRequest(
        @NotBlank @Size(max = 500) String note) {
}

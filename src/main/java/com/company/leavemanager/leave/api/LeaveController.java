package com.company.leavemanager.leave.api;

import com.company.leavemanager.identity.api.EmployeeDirectory;
import com.company.leavemanager.identity.api.EmployeeDirectory.EmployeeView;
import com.company.leavemanager.leave.api.dto.AdjustBalanceRequest;
import com.company.leavemanager.leave.api.dto.ApproveLeaveRequestRequest;
import com.company.leavemanager.leave.api.dto.CreateLeaveRequestRequest;
import com.company.leavemanager.leave.api.dto.LeaveRequestResponse;
import com.company.leavemanager.leave.api.dto.RejectLeaveRequestRequest;
import com.company.leavemanager.leave.internal.LeaveError;
import com.company.leavemanager.leave.internal.LeaveResult;
import com.company.leavemanager.leave.internal.LeaveService;
import com.company.leavemanager.leave.internal.LeaveType;
import com.company.leavemanager.web.ApiExceptionHandler;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.UUID;

/**
 * The leave endpoints (spec 0004, Constraints: everything under {@code /api/leave/**}).
 *
 * <p>The controller resolves the actor and turns the service's outcome into a response; the rules
 * themselves live in {@link LeaveService} and never here (docs/security.md).
 */
@RestController
@RequestMapping("/api/leave")
public class LeaveController {

    private final LeaveService leave;
    private final EmployeeDirectory employees;

    public LeaveController(LeaveService leave, EmployeeDirectory employees) {
        this.leave = leave;
        this.employees = employees;
    }

    @GetMapping("/requests")
    public ResponseEntity<?> list(@RequestParam(defaultValue = "1") int page,
                                  @RequestParam(defaultValue = "20") int size,
                                  @RequestParam(required = false) String status,
                                  Authentication authentication) {
        return respond(leave.list(actorId(authentication), status, page, size));
    }

    @PostMapping("/requests")
    public ResponseEntity<?> create(@Valid @RequestBody CreateLeaveRequestRequest body,
                                    Authentication authentication) {
        LeaveResult<LeaveRequestResponse> result = leave.create(
                actorId(authentication), body.type(), body.startDate(), body.endDate(), body.reason());
        if (result.failed()) {
            return respond(result);
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(result.value());
    }

    @PostMapping("/requests/{id}/approve")
    public ResponseEntity<?> approve(@PathVariable UUID id,
                                     @RequestBody(required = false) ApproveLeaveRequestRequest body,
                                     Authentication authentication) {
        String note = body == null ? null : body.note();
        return respond(leave.approve(actorId(authentication), id, note));
    }

    @PostMapping("/requests/{id}/reject")
    public ResponseEntity<?> reject(@PathVariable UUID id,
                                    @Valid @RequestBody RejectLeaveRequestRequest body,
                                    Authentication authentication) {
        return respond(leave.reject(actorId(authentication), id, body.note()));
    }

    @PostMapping("/requests/{id}/cancel")
    public ResponseEntity<?> cancel(@PathVariable UUID id, Authentication authentication) {
        return respond(leave.cancel(actorId(authentication), id));
    }

    @GetMapping("/queue")
    public ResponseEntity<?> queue(Authentication authentication) {
        return respond(leave.queue(actorId(authentication)));
    }

    @GetMapping("/balance")
    public ResponseEntity<?> balance(@RequestParam(required = false) UUID employeeId,
                                     Authentication authentication) {
        return respond(leave.balance(actorId(authentication), employeeId));
    }

    @GetMapping("/preview")
    public ResponseEntity<?> preview(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            @RequestParam(required = false) LeaveType type,
            Authentication authentication) {
        return respond(leave.preview(actorId(authentication), type, startDate, endDate));
    }

    @PostMapping("/adjustments")
    public ResponseEntity<?> adjust(@Valid @RequestBody AdjustBalanceRequest body,
                                    Authentication authentication) {
        return respond(leave.adjust(
                actorId(authentication), body.employeeId(), body.days(), body.reason()));
    }

    private UUID actorId(Authentication authentication) {
        return employees.findByEmail(authentication.getName())
                .map(EmployeeView::id)
                .orElseThrow(() -> new IllegalStateException("the authenticated account no longer exists"));
    }

    private static ResponseEntity<?> respond(LeaveResult<?> result) {
        LeaveError error = result.error();
        if (error == null) {
            return ResponseEntity.ok(result.value());
        }
        return ResponseEntity.status(error.status())
                .body(ApiExceptionHandler.problem(error.status(), error.code()));
    }
}

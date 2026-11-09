package com.company.leavemanager.identity.api;

import com.company.leavemanager.identity.api.dto.CreateUserRequest;
import com.company.leavemanager.identity.api.dto.UserResponse;
import com.company.leavemanager.identity.internal.AppUserPrincipal;
import com.company.leavemanager.identity.internal.UserAdminService;
import com.company.leavemanager.web.ApiExceptionHandler;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserAdminService admin;

    public UserController(UserAdminService admin) {
        this.admin = admin;
    }

    @GetMapping
    public List<UserResponse> list() {
        return admin.list();
    }

    @PostMapping
    public ResponseEntity<?> create(@Valid @RequestBody CreateUserRequest request, Authentication authentication) {
        UserAdminService.CreateResult result = admin.create(
                actor(authentication).id(),
                request.email(),
                request.displayName(),
                request.role(),
                request.managerId(),
                request.hireDate());
        return switch (result.outcome()) {
            case INVALID_ROLE -> ResponseEntity.badRequest()
                    .body(ApiExceptionHandler.problem(HttpStatus.BAD_REQUEST, "INVALID_ROLE"));
            case ROLE_NOT_ASSIGNABLE -> ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(ApiExceptionHandler.problem(HttpStatus.FORBIDDEN, "ROLE_NOT_ASSIGNABLE"));
            case EMAIL_EXISTS -> ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(ApiExceptionHandler.problem(HttpStatus.CONFLICT, "EMAIL_EXISTS"));
            case INVALID_MANAGER -> ResponseEntity.badRequest()
                    .body(ApiExceptionHandler.problem(HttpStatus.BAD_REQUEST, "INVALID_MANAGER"));
            case CREATED -> ResponseEntity.status(HttpStatus.CREATED).body(result.response());
        };
    }

    @PostMapping("/{id}/deactivate")
    public ResponseEntity<?> deactivate(@PathVariable UUID id, Authentication authentication) {
        return respond(admin.deactivate(actor(authentication).id(), id));
    }

    @PostMapping("/{id}/reset-password")
    public ResponseEntity<?> resetPassword(@PathVariable UUID id, Authentication authentication) {
        return respond(admin.resetPassword(actor(authentication).id(), id));
    }

    private static ResponseEntity<?> respond(UserAdminService.AdminResult result) {
        return switch (result.outcome()) {
            case SELF_ACTION -> ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(ApiExceptionHandler.problem(HttpStatus.FORBIDDEN, "SELF_ACTION_NOT_ALLOWED"));
            case PROTECTED_ACCOUNT -> ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(ApiExceptionHandler.problem(HttpStatus.FORBIDDEN, "PROTECTED_ACCOUNT"));
            case NOT_FOUND -> ResponseEntity.status(HttpStatus.NOT_FOUND)
                    .body(ApiExceptionHandler.problem(HttpStatus.NOT_FOUND, "NOT_FOUND"));
            case DONE -> result.response() == null
                    ? ResponseEntity.noContent().build()
                    : ResponseEntity.ok(result.response());
        };
    }

    private static AppUserPrincipal actor(Authentication authentication) {
        return (AppUserPrincipal) authentication.getPrincipal();
    }
}

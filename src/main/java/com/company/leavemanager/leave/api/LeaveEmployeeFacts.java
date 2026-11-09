package com.company.leavemanager.leave.api;

import com.company.leavemanager.identity.api.EmployeeLeaveFacts;
import com.company.leavemanager.leave.internal.LeaveService;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.OptionalInt;
import java.util.UUID;

/**
 * The leave module's implementation of the identity module's org-edit guard (spec 0004 review round
 * 2, M-01/M-02). It is a thin adapter on purpose: the balance and the request state are the leave
 * module's own use cases, so the numbers a user edit is judged by are the numbers the leave screen
 * shows.
 */
@Service
public class LeaveEmployeeFacts implements EmployeeLeaveFacts {

    private final LeaveService leave;

    public LeaveEmployeeFacts(LeaveService leave) {
        this.leave = leave;
    }

    @Override
    public OptionalInt remainingIfHiredOn(UUID employeeId, LocalDate hireDate) {
        return leave.remainingIfHiredOn(employeeId, hireDate);
    }

    @Override
    public boolean hasPendingRequests(UUID employeeId) {
        return leave.hasPendingRequests(employeeId);
    }
}

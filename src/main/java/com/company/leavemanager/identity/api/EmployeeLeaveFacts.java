package com.company.leavemanager.identity.api;

import java.time.LocalDate;
import java.util.OptionalInt;
import java.util.UUID;

/**
 * The leave facts the identity module needs before it may commit an org-data edit (spec 0004 review
 * round 2, M-01/M-02).
 *
 * <p>The consumer owns the port: identity declares what it needs and the leave module implements it
 * ({@code leave.api.LeaveEmployeeFacts}). The direction is deliberately inverted — an
 * {@code identity → leave.api} dependency would close a module cycle ({@code leave} already depends on
 * {@link EmployeeDirectory}), and {@code ModuleBoundariesTest#modules_are_free_of_cycles} forbids
 * that; identity still never reaches into {@code leave.internal}.
 */
public interface EmployeeLeaveFacts {

    /**
     * The annual balance the employee would have if {@code hireDate} were their hire date, or empty
     * when the account does not exist. The balance is the domain's own computation (BR-1…BR-3, BR-5),
     * never a second implementation: "bakiye negatif olamaz" has one owner.
     */
    OptionalInt remainingIfHiredOn(UUID employeeId, LocalDate hireDate);

    /**
     * Whether the account has at least one {@code PENDING} request. Only the current direct manager
     * can decide those (BR-7), so the manager link may not be taken away while one exists.
     */
    boolean hasPendingRequests(UUID employeeId);
}

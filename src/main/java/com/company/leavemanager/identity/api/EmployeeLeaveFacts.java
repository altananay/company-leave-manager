package com.company.leavemanager.identity.api;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;
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
     * never a second implementation: "bakiye negatif olamaz" has one owner. It is the decimal day
     * unit (D16), because a half day can leave a fractional remainder that an {@code int} cannot
     * carry.
     */
    Optional<BigDecimal> remainingIfHiredOn(UUID employeeId, LocalDate hireDate);

    /**
     * Whether the account has at least one {@code PENDING} request. Only the current direct manager
     * can decide those (BR-7), so the manager link may not be taken away while one exists.
     */
    boolean hasPendingRequests(UUID employeeId);

    /**
     * Whether an active request ({@code PENDING} or {@code APPROVED}) starts before {@code hireDate}.
     * "İzin işe girişten önce başlayamaz" ({@code docs/domain.md}, key invariants) has to survive an
     * org edit too: moving the hire date past the start of an active leave would leave that leave
     * outside the employment. The balance does not always catch it — an {@code EXCUSE} request is
     * balance-free and an {@code ANNUAL} one can still leave a positive remainder — so identity asks
     * the owner of the request state instead of re-deriving the question (review round 3, N-01).
     */
    boolean hasActiveLeaveStartingBefore(UUID employeeId, LocalDate hireDate);
}

package com.company.leavemanager.leave.internal;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface LeaveRepository extends JpaRepository<LeaveRequest, UUID> {

    Page<LeaveRequest> findAllByOrderByStartDateDesc(Pageable pageable);

    Page<LeaveRequest> findByStatusOrderByStartDateDesc(LeaveRequestStatus status, Pageable pageable);

    Page<LeaveRequest> findByEmployeeIdInOrderByStartDateDesc(Collection<UUID> employeeIds, Pageable pageable);

    Page<LeaveRequest> findByEmployeeIdInAndStatusOrderByStartDateDesc(
            Collection<UUID> employeeIds, LeaveRequestStatus status, Pageable pageable);

    /** Every active request of one employee: the overlap rule (BR-6) and the balance (BR-5). */
    List<LeaveRequest> findByEmployeeIdAndStatusIn(UUID employeeId, Collection<LeaveRequestStatus> statuses);

    /** One request inside the caller's scope: the manager's decision loads through this (L-22). */
    Optional<LeaveRequest> findByIdAndEmployeeIdIn(UUID id, Collection<UUID> employeeIds);

    /** One request of one employee: the owner's cancel loads through this (L-22). */
    Optional<LeaveRequest> findByIdAndEmployeeId(UUID id, UUID employeeId);

    /** The manager queue: pending requests of a set of direct reports. */
    List<LeaveRequest> findByEmployeeIdInAndStatusOrderByStartDateAsc(
            Collection<UUID> employeeIds, LeaveRequestStatus status);

    /** Whether the account still has a request only its current manager could decide (M-02). */
    boolean existsByEmployeeIdAndStatus(UUID employeeId, LeaveRequestStatus status);
}

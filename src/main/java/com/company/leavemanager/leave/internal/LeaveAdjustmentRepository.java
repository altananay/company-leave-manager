package com.company.leavemanager.leave.internal;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface LeaveAdjustmentRepository extends JpaRepository<LeaveAdjustment, UUID> {

    List<LeaveAdjustment> findByEmployeeId(UUID employeeId);
}

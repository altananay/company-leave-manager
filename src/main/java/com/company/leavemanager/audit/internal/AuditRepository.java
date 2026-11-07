package com.company.leavemanager.audit.internal;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface AuditRepository extends JpaRepository<AuditEvent, UUID> {

    List<AuditEvent> findAllByOrderByOccurredAtDesc();
}

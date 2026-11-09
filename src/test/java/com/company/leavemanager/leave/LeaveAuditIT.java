package com.company.leavemanager.leave;

import com.company.leavemanager.audit.internal.AuditEvent;
import com.company.leavemanager.audit.internal.AuditRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.net.http.HttpResponse;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * AC-7 (backlog B-7): creation, approval, rejection, cancellation and an HR adjustment each leave an
 * audit row, and a decision carries the state it changed from and the state it moved to.
 */
class LeaveAuditIT extends LeaveTestSupport {

    @Autowired
    AuditRepository auditRepository;

    @Test
    void shouldRecordEveryLeaveEventWithBeforeAndAfter() throws Exception {
        Instant start = Instant.now().minusSeconds(1);
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        String hrId = extract(session.get("/api/auth/me").body(), "id");
        Session member = signIn(employee);
        Session managerSession = signIn(manager);
        LocalDate monday = nextMonday();

        // Requested → approved.
        String approvedId = extract(createLeave(member, "ANNUAL", monday, monday.plusDays(2), "aile").body(), "id");
        assertThat(approve(managerSession, approvedId).statusCode()).isEqualTo(200);
        // Requested → rejected.
        String rejectedId = extract(createLeave(member, "EXCUSE", monday.plusDays(3), monday.plusDays(3), "mazeret").body(), "id");
        assertThat(reject(managerSession, rejectedId, "dönem yoğun").statusCode()).isEqualTo(200);
        // Requested → approved → cancelled.
        String cancelledId = extract(createLeave(member, "ANNUAL", monday.plusDays(7), monday.plusDays(8), "seyahat").body(), "id");
        assertThat(approve(managerSession, cancelledId).statusCode()).isEqualTo(200);
        assertThat(cancel(member, cancelledId).statusCode()).isEqualTo(200);
        // HR corrected the remaining balance.
        HttpResponse<String> adjusted = session.post("/api/leave/adjustments",
                "{\"employeeId\":\"" + employee.id() + "\",\"days\":2,\"reason\":\"geçmiş dönem\"}");
        assertThat(adjusted.statusCode()).isEqualTo(200);

        // Only this test's trail: the employee's own leave events, created after the test began.
        List<AuditEvent> events = auditRepository.findAllByOrderByOccurredAtDesc().stream()
                .filter(event -> event.getOccurredAt() != null && !event.getOccurredAt().isBefore(start))
                .filter(event -> employee.id().equals(event.getTargetUserId()))
                .filter(event -> event.getEventType().startsWith("LEAVE_"))
                .toList();

        assertThat(events).extracting(AuditEvent::getEventType).contains(
                "LEAVE_REQUESTED", "LEAVE_APPROVED", "LEAVE_REJECTED", "LEAVE_CANCELLED",
                "LEAVE_BALANCE_ADJUSTED");

        AuditEvent requested = single(events, "LEAVE_REQUESTED", approvedId);
        assertThat(requested.getBeforeState()).isNull();
        assertThat(requested.getAfterState()).contains("\"status\":\"PENDING\"");
        assertThat(requested.getActorUserId()).isEqualTo(employee.id());

        AuditEvent approved = single(events, "LEAVE_APPROVED", approvedId);
        assertThat(approved.getBeforeState()).contains("\"status\":\"PENDING\"");
        assertThat(approved.getAfterState()).contains("\"status\":\"APPROVED\"");
        // The decision names the manager as the actor and the employee as the target (BR-13).
        assertThat(approved.getActorUserId()).isEqualTo(manager.id());
        assertThat(approved.getTargetUserId()).isEqualTo(employee.id());

        AuditEvent rejected = single(events, "LEAVE_REJECTED", rejectedId);
        assertThat(rejected.getBeforeState()).contains("\"status\":\"PENDING\"");
        assertThat(rejected.getAfterState()).contains("\"status\":\"REJECTED\"");

        AuditEvent cancelled = single(events, "LEAVE_CANCELLED", cancelledId);
        assertThat(cancelled.getBeforeState()).contains("\"status\":\"APPROVED\"");
        assertThat(cancelled.getAfterState()).contains("\"status\":\"CANCELLED\"");

        AuditEvent adjustment = events.stream()
                .filter(event -> "LEAVE_BALANCE_ADJUSTED".equals(event.getEventType()))
                .findFirst()
                .orElseThrow();
        assertThat(adjustment.getActorUserId()).isEqualTo(UUID.fromString(hrId));
        assertThat(adjustment.getTargetUserId()).isEqualTo(employee.id());
        assertThat(adjustment.getBeforeState()).contains("\"remaining\"");
        assertThat(adjustment.getAfterState()).contains("\"remaining\"");
        assertThat(adjustment.getDetails()).contains("days=2").contains("geçmiş dönem");

        // No personal data in the structured parts; the reason stays on the HR adjustment row.
        assertThat(events).allSatisfy(event -> {
            for (String state : new String[] {event.getBeforeState(), event.getAfterState()}) {
                if (state != null) {
                    assertThat(state).doesNotContain(employee.email());
                    assertThat(state).doesNotContain(employee.displayName());
                }
            }
            if (event.getDetails() != null) {
                assertThat(event.getDetails()).doesNotContain(employee.email());
                assertThat(event.getDetails()).doesNotContain(employee.displayName());
            }
        });
    }

    private static AuditEvent single(List<AuditEvent> events, String type, String requestId) {
        List<AuditEvent> matches = events.stream()
                .filter(event -> type.equals(event.getEventType()))
                .filter(event -> event.getDetails() != null && event.getDetails().contains(requestId))
                .toList();
        assertThat(matches).as("one %s event for %s", type, requestId).hasSize(1);
        return matches.getFirst();
    }
}

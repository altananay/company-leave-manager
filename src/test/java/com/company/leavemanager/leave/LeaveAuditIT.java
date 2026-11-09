package com.company.leavemanager.leave;

import com.company.leavemanager.audit.internal.AuditEvent;
import com.company.leavemanager.audit.internal.AuditRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.net.http.HttpResponse;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * AC-7 (backlog B-7): creation, approval, rejection, cancellation and an HR adjustment each leave an
 * audit row, and a decision carries the state it changed from and the state it moved to.
 *
 * <p>The states are <strong>jsonb</strong> columns now (review round 1, L-15): the assertions read
 * them through the database's own JSON operators, so a row that is not JSON could not pass.
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
        assertThat(requested.getAfterState()).containsEntry("status", "PENDING");
        assertThat(requested.getActorUserId()).isEqualTo(employee.id());

        AuditEvent approved = single(events, "LEAVE_APPROVED", approvedId);
        assertThat(approved.getBeforeState()).containsEntry("status", "PENDING");
        assertThat(approved.getAfterState()).containsEntry("status", "APPROVED");
        // The decision names the manager as the actor and the employee as the target (BR-13).
        assertThat(approved.getActorUserId()).isEqualTo(manager.id());
        assertThat(approved.getTargetUserId()).isEqualTo(employee.id());

        AuditEvent rejected = single(events, "LEAVE_REJECTED", rejectedId);
        assertThat(rejected.getBeforeState()).containsEntry("status", "PENDING");
        assertThat(rejected.getAfterState()).containsEntry("status", "REJECTED");

        AuditEvent cancelled = single(events, "LEAVE_CANCELLED", cancelledId);
        assertThat(cancelled.getBeforeState()).containsEntry("status", "APPROVED");
        assertThat(cancelled.getAfterState()).containsEntry("status", "CANCELLED");

        AuditEvent adjustment = events.stream()
                .filter(event -> "LEAVE_BALANCE_ADJUSTED".equals(event.getEventType()))
                .findFirst()
                .orElseThrow();
        assertThat(adjustment.getActorUserId()).isEqualTo(UUID.fromString(hrId));
        assertThat(adjustment.getTargetUserId()).isEqualTo(employee.id());
        assertThat(adjustment.getBeforeState()).containsKey("remaining");
        assertThat(adjustment.getAfterState()).containsKey("remaining");
        assertThat(adjustment.getDetails()).contains("days=2").contains("geçmiş dönem");

        // The database, not the Java map, is the authority: jsonb and the documented keys.
        assertThat(storedJson("after_state", approved.getId(), "status")).isEqualTo("APPROVED");
        assertThat(storedJson("before_state", approved.getId(), "status")).isEqualTo("PENDING");
        assertThat(storedJson("after_state", cancelled.getId(), "status")).isEqualTo("CANCELLED");
        assertThat(jsonType("after_state", approved.getId())).isEqualTo("object");
        assertThat(keys("after_state", approved.getId())).containsExactly("status");
        assertThat(keys("after_state", adjustment.getId())).containsExactly("remaining");
        // An event without a state keeps null, not the JSON text "null".
        assertThat(jsonType("before_state", requested.getId())).isNull();
        assertThat(keys("before_state", requested.getId())).isEmpty();

        // No personal data in the structured parts; the reason stays on the HR adjustment row.
        assertThat(events).allSatisfy(event -> {
            for (Map<String, Object> state : new Map[] {event.getBeforeState(), event.getAfterState()}) {
                if (state != null) {
                    assertThat(state.values()).doesNotContain(employee.email(), employee.displayName());
                }
            }
            if (event.getDetails() != null) {
                assertThat(event.getDetails()).doesNotContain(employee.email());
                assertThat(event.getDetails()).doesNotContain(employee.displayName());
            }
        });
    }

    private String storedJson(String column, UUID id, String key) {
        return jdbc.queryForObject(
                "select " + column + "->>? from audit_event where id = ?", String.class, key, id);
    }

    private String jsonType(String column, UUID id) {
        return jdbc.queryForObject(
                "select jsonb_typeof(" + column + ") from audit_event where id = ?", String.class, id);
    }

    private List<String> keys(String column, UUID id) {
        return jdbc.queryForList(
                "select jsonb_object_keys(" + column + ") from audit_event where id = ?",
                String.class, id);
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

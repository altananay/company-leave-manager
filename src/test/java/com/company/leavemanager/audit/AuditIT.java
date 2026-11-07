package com.company.leavemanager.audit;

import com.company.leavemanager.audit.internal.AuditEvent;
import com.company.leavemanager.audit.internal.AuditRepository;
import com.company.leavemanager.identity.IdentityTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** AC-8 of spec 0002: events are recorded, the email is masked, and no password ever lands there. */
class AuditIT extends IdentityTestSupport {

    @Autowired
    AuditRepository auditRepository;

    @Test
    void shouldRecordEventsWithoutPasswords() throws Exception {
        long before = auditRepository.count();

        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);
        new Session().login(HR_EMAIL, "definitely-wrong-123");
        assertThat(session.post("/api/auth/logout", "{}").statusCode()).isEqualTo(204);

        List<AuditEvent> events = auditRepository.findAllByOrderByOccurredAtDesc();

        assertThat(events).hasSizeGreaterThanOrEqualTo((int) before + 3);
        assertThat(events).extracting(AuditEvent::getEventType)
                .contains("LOGIN_SUCCEEDED", "LOGIN_FAILED", "LOGOUT");

        AuditEvent failedLogin = events.stream()
                .filter(event -> "LOGIN_FAILED".equals(event.getEventType()))
                .findFirst()
                .orElseThrow();

        assertThat(failedLogin.getDetails()).contains("h***@acme.test");
        assertThat(events).allMatch(event ->
                event.getDetails() == null || !event.getDetails().contains(HR_PASSWORD));
    }
}

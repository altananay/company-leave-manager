package com.company.leavemanager.audit;

import com.company.leavemanager.audit.internal.AuditEvent;
import com.company.leavemanager.audit.internal.AuditRepository;
import com.company.leavemanager.identity.IdentityTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** AC-8 of spec 0002: every write event is recorded, the email is masked, no password lands there. */
class AuditIT extends IdentityTestSupport {

    @Autowired
    AuditRepository auditRepository;

    @Test
    void shouldRecordEveryIdentityEventWithoutPasswords() throws Exception {
        Instant start = Instant.now();
        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);
        String hrId = extract(session.get("/api/auth/me").body(), "id");
        String email = "audit-" + System.nanoTime() + "@acme.test";

        HttpResponse<String> created = session.post("/api/users",
                "{\"email\":\"" + email + "\",\"displayName\":\"Audit Person\",\"role\":\"EMPLOYEE\"}");
        String id = extract(created.body(), "id");
        String temporaryPassword = extract(created.body(), "temporaryPassword");

        assertThat(session.post("/api/users/" + id + "/reset-password", "{}").statusCode()).isEqualTo(200);
        assertThat(session.post("/api/users/" + id + "/deactivate", "{}").statusCode()).isEqualTo(204);

        // A failed login and the lockout that follows it, on a second (active) account.
        String lockedEmail = "locked-" + System.nanoTime() + "@acme.test";
        HttpResponse<String> lockedCreated = session.post("/api/users",
                "{\"email\":\"" + lockedEmail + "\",\"displayName\":\"Locked Person\",\"role\":\"EMPLOYEE\"}");
        assertThat(lockedCreated.statusCode()).isEqualTo(201);
        String lockedId = extract(lockedCreated.body(), "id");
        String lockedTemporaryPassword = extract(lockedCreated.body(), "temporaryPassword");
        Session attacker = new Session();
        for (int attempt = 0; attempt < 5; attempt++) {
            attacker.login(lockedEmail, "wrong-password-123");
        }
        assertThat(attacker.login(lockedEmail, "wrong-password-123").statusCode()).isEqualTo(423);

        assertThat(session.post("/api/auth/logout", "{}").statusCode()).isEqualTo(204);

        // Only the rows this test produced: another test's trail must not make it pass.
        List<AuditEvent> events = auditRepository.findAllByOrderByOccurredAtDesc().stream()
                .filter(event -> event.getOccurredAt() != null && !event.getOccurredAt().isBefore(start))
                .toList();

        assertThat(events).extracting(AuditEvent::getEventType)
                .contains("LOGIN_SUCCEEDED", "LOGIN_FAILED", "ACCOUNT_LOCKED", "LOGOUT",
                        "USER_CREATED", "USER_DEACTIVATED", "PASSWORD_RESET");

        AuditEvent failedLogin = events.stream()
                .filter(event -> "LOGIN_FAILED".equals(event.getEventType()))
                .findFirst()
                .orElseThrow();
        // The address is masked: the first letter, then the domain (docs/conventions.md, Data rules).
        assertThat(failedLogin.getDetails()).contains("l***@acme.test");
        assertThat(failedLogin.getDetails()).contains("***@acme.test");
        assertThat(failedLogin.getDetails()).doesNotContain(lockedEmail);

        // No password, no BCrypt hash, anywhere in the trail — for both created accounts.
        assertThat(events).allSatisfy(event -> {
            String details = event.getDetails();
            if (details != null) {
                assertThat(details).doesNotContain(temporaryPassword);
                assertThat(details).doesNotContain(lockedTemporaryPassword);
                assertThat(details).doesNotContain("$2a$").doesNotContain("$2b$").doesNotContain("$2y$");
                assertThat(details).doesNotContain(HR_PASSWORD);
            }
        });

        // BR-13: who, when, and on whom — the trail is not just an event type.
        assertThat(events).allSatisfy(event -> assertThat(event.getOccurredAt()).isNotNull());

        // Every event type carries its actor; the ones that act on somebody also carry the target.
        assertThat(events).allSatisfy(event -> {
            assertThat(event.getActorUserId()).as("actor of %s", event.getEventType()).isNotNull();
            if (!"LOGIN_FAILED".equals(event.getEventType())) {
                assertThat(event.getTargetUserId()).as("target of %s", event.getEventType()).isNotNull();
            }
        });

        // The identities are pinned, not just present (BR-13). Each event type has its own shape:
        // self-service events (login, logout, lockout) act on the account itself; admin events name
        // the HR account as actor and the managed account as target.
        UUID actor = UUID.fromString(hrId);
        UUID target = UUID.fromString(id);

        assertThat(events)
                .filteredOn(event -> "USER_DEACTIVATED".equals(event.getEventType())
                        || "PASSWORD_RESET".equals(event.getEventType()))
                .isNotEmpty()
                .allSatisfy(event -> {
                    assertThat(event.getActorUserId()).as("actor of %s", event.getEventType()).isEqualTo(actor);
                    assertThat(event.getTargetUserId()).as("target of %s", event.getEventType()).isEqualTo(target);
                });

        // Two accounts are created in this test (the target and the lockout victim): the target's
        // own creation must be there, with HR as the actor.
        assertThat(events)
                .filteredOn(event -> "USER_CREATED".equals(event.getEventType()))
                .anySatisfy(event -> {
                    assertThat(event.getActorUserId()).isEqualTo(actor);
                    assertThat(event.getTargetUserId()).isEqualTo(target);
                });

        assertThat(events)
                .filteredOn(event -> "LOGIN_SUCCEEDED".equals(event.getEventType())
                        || "LOGOUT".equals(event.getEventType()))
                .isNotEmpty()
                .allSatisfy(event -> {
                    // Self-service: the account is both the actor and the target.
                    assertThat(event.getActorUserId()).as("actor of %s", event.getEventType()).isEqualTo(actor);
                    assertThat(event.getTargetUserId()).as("target of %s", event.getEventType()).isEqualTo(actor);
                });

        // The failed-login and lockout rows name the attacked account, not somebody else.
        UUID victim = UUID.fromString(lockedId);
        assertThat(events)
                .filteredOn(event -> "LOGIN_FAILED".equals(event.getEventType()))
                .isNotEmpty()
                .allSatisfy(event -> {
                    assertThat(event.getActorUserId()).as("actor of LOGIN_FAILED").isEqualTo(victim);
                    assertThat(event.getTargetUserId()).as("target of LOGIN_FAILED").isNull();
                });

        assertThat(events)
                .filteredOn(event -> "ACCOUNT_LOCKED".equals(event.getEventType()))
                .isNotEmpty()
                .allSatisfy(event -> {
                    // Self-service: the locked account is both the actor and the target.
                    assertThat(event.getActorUserId()).as("actor of ACCOUNT_LOCKED").isEqualTo(victim);
                    assertThat(event.getTargetUserId()).as("target of ACCOUNT_LOCKED").isEqualTo(victim);
                });

        AuditEvent createdEvent = events.stream()
                .filter(event -> "USER_CREATED".equals(event.getEventType()))
                .findFirst()
                .orElseThrow();
        assertThat(createdEvent.getTargetUserId()).isNotEqualTo(createdEvent.getActorUserId());

        AuditEvent loginEvent = events.stream()
                .filter(event -> "LOGIN_SUCCEEDED".equals(event.getEventType()))
                .findFirst()
                .orElseThrow();
        assertThat(loginEvent.getActorUserId()).isEqualTo(actor);
    }
}

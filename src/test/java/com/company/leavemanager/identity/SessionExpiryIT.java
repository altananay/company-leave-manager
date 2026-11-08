package com.company.leavemanager.identity;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;

import java.net.http.HttpResponse;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * AC-2: the absolute session lifetime ends the session, while the SPA shell stays reachable so the
 * user can be sent back to the login screen. Time is advanced through the injected clock, not by
 * sleeping (docs/testing.md, Determinism).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(SessionExpiryIT.ClockConfig.class)
class SessionExpiryIT extends IdentityTestSupport {

    private static final MutableClock CLOCK = new MutableClock();

    @TestConfiguration
    static class ClockConfig {
        @Bean
        @Primary
        Clock testClock() {
            return CLOCK;
        }
    }

    @BeforeEach
    void resetClock() {
        CLOCK.reset();
    }

    @Test
    void shouldKeepTheSessionUntilTheAbsoluteLifetimeIsReached() throws Exception {
        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);

        // 7 h 59 min: still inside the 8-hour window.
        CLOCK.advance(Duration.ofHours(7).plusMinutes(59));
        assertThat(session.get("/api/auth/me").statusCode()).isEqualTo(200);

        // 8 h 01 min: past it.
        CLOCK.advance(Duration.ofMinutes(2));
        HttpResponse<String> expired = session.get("/api/auth/me");

        assertThat(expired.statusCode()).isEqualTo(401);
        assertThat(expired.body()).contains("SESSION_EXPIRED");
    }

    @Test
    void shouldEndTheSessionAfterTheAbsoluteLifetime() throws Exception {
        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);
        assertThat(session.get("/api/auth/me").statusCode()).isEqualTo(200);

        CLOCK.advance(Duration.ofHours(9));

        HttpResponse<String> expired = session.get("/api/auth/me");

        assertThat(expired.statusCode()).isEqualTo(401);
        assertThat(expired.body()).contains("SESSION_EXPIRED");
    }

    @Test
    void shouldKeepTheShellAndHealthReachableWithAnExpiredSession() throws Exception {
        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);

        CLOCK.advance(Duration.ofHours(9));

        // The session is really gone...
        HttpResponse<String> expired = session.get("/api/auth/me");
        assertThat(expired.statusCode()).isEqualTo(401);
        assertThat(expired.body()).contains("SESSION_EXPIRED");

        // ...while the shell and the health probe stay reachable, so the SPA can show the login screen.
        assertThat(session.get("/").statusCode()).isEqualTo(200);
        assertThat(session.get("/api/health").statusCode()).isEqualTo(200);
    }

    /** A clock the test moves forward; the production clock is fixed. */
    static final class MutableClock extends Clock {

        private static final Instant START = Instant.parse("2026-11-07T10:00:00Z");

        private Instant now = START;

        void reset() {
            now = START;
        }

        void advance(Duration duration) {
            now = now.plus(duration);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}

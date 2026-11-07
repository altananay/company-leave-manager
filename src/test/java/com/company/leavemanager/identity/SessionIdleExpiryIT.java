package com.company.leavemanager.identity;

import com.company.leavemanager.identity.internal.IdentitySeeder;
import com.company.leavemanager.identity.internal.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.nio.charset.StandardCharsets;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * AC-2 (the idle half): the session lives in PostgreSQL and a session whose idle window passed is
 * refused. The row is aged directly, so the test is deterministic — no sleeping (R-03).
 */
class SessionIdleExpiryIT extends IdentityTestSupport {

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    IdentitySeeder seeder;

    @Autowired
    UserRepository users;

    @Test
    void shouldKeepTheSessionInPostgres() throws Exception {
        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);

        Integer rows = jdbc.queryForObject("select count(*) from spring_session", Integer.class);
        Integer maxInactive =
                jdbc.queryForObject("select max(max_inactive_interval) from spring_session", Integer.class);

        assertThat(rows).isGreaterThanOrEqualTo(1);
        // The configured 30-minute idle timeout really reaches the session row.
        assertThat(maxInactive).isEqualTo(1800);
    }

    @Test
    void shouldRefuseOnlyAfterTheIdleWindow() throws Exception {
        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);
        long now = System.currentTimeMillis();

        // 29 minutes idle: still inside the 30-minute window.
        jdbc.update("update spring_session set last_access_time = ?, expiry_time = ?",
                now - 29 * 60_000L, now + 60_000L);
        assertThat(session.get("/api/auth/me").statusCode()).isEqualTo(200);

        // 31 minutes idle: past it.
        jdbc.update("update spring_session set last_access_time = ?, expiry_time = ?",
                now - 31 * 60_000L, now - 1_000L);
        assertThat(session.get("/api/auth/me").statusCode()).isEqualTo(401);
    }

    @Test
    void shouldRefuseASessionWhoseIdleWindowPassed() throws Exception {
        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);
        assertThat(session.get("/api/auth/me").statusCode()).isEqualTo(200);

        // Age every session far beyond its idle timeout, exactly what the repository checks.
        jdbc.update("update spring_session set last_access_time = 0, expiry_time = 0");

        assertThat(session.get("/api/auth/me").statusCode()).isEqualTo(401);
    }

    @Test
    void shouldNotKeepThePasswordHashInTheSession() throws Exception {
        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);

        List<String> attributes = jdbc.query(
                "select attribute_bytes from spring_session_attributes",
                (resultSet, index) -> new String(resultSet.getBytes(1), StandardCharsets.ISO_8859_1));

        // The session holds a credential-free principal: no BCrypt hash reaches spring_session.
        assertThat(attributes).isNotEmpty();
        assertThat(attributes).allSatisfy(bytes -> assertThat(bytes)
                .doesNotContain("$2a$").doesNotContain("$2b$").doesNotContain("$2y$"));
    }

    @Test
    void shouldNotSeedTwice() {
        long before = users.count();

        // The seeder runs again (a restart): the accounts already exist, so nothing is created.
        seeder.run(null);

        assertThat(users.count()).isEqualTo(before);
    }
}

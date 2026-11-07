package com.company.leavemanager.identity;

import com.company.leavemanager.identity.internal.IdentitySeeder;
import com.company.leavemanager.identity.internal.UserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

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

        assertThat(rows).isGreaterThanOrEqualTo(1);
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
    void shouldNotSeedTwice() {
        long before = users.count();

        // The seeder runs again (a restart): the accounts already exist, so nothing is created.
        seeder.run(null);

        assertThat(users.count()).isEqualTo(before);
    }
}

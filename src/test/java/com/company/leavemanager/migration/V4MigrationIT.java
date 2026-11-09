package com.company.leavemanager.migration;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * L-17's migration half: V4 adds the withdrawal record ({@code cancelled_at}/{@code cancelled_by})
 * and the HR retroactive marker to {@code leave_request}. A V3-era row survives the migration
 * untouched, its new columns null (and the marker false), and its decision timestamp is still the
 * decision's — the migration never rewrites history.
 */
@Testcontainers
class V4MigrationIT {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:18");

    @Test
    void shouldKeepExistingLeaveRequestsWhenTheCancellationColumnsArrive() throws Exception {
        Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .target(MigrationVersion.fromVersion("3"))
                .load()
                .migrate();

        try (Connection connection = DriverManager.getConnection(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
             Statement statement = connection.createStatement()) {
            statement.execute("insert into users (id, email, display_name, role, password_hash) "
                    + "values ('00000000-0000-0000-0000-0000000000a1', 'legacy-lead@acme.test', "
                    + "'Legacy Lead', 'MANAGER', '$2a$10$abcdefghijklmnopqrstuv')");
            statement.execute("insert into users (id, email, display_name, role, password_hash, manager_id) "
                    + "values ('00000000-0000-0000-0000-0000000000a2', 'legacy@acme.test', "
                    + "'Legacy Person', 'EMPLOYEE', '$2a$10$abcdefghijklmnopqrstuv', "
                    + "'00000000-0000-0000-0000-0000000000a1')");
            statement.execute("insert into leave_request "
                    + "(id, employee_id, type, start_date, end_date, business_days, reason, status, "
                    + "decided_by, decided_at, decision_note, created_at) values "
                    + "('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2', "
                    + "'ANNUAL', '2026-11-16', '2026-11-18', 3, 'aile', 'APPROVED', "
                    + "'00000000-0000-0000-0000-0000000000a1', '2026-11-10T08:00:00Z', 'uygun', "
                    + "'2026-11-09T08:00:00Z')");
        }

        int applied = Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .target(MigrationVersion.fromVersion("4"))
                .load()
                .migrate()
                .migrationsExecuted;
        assertThat(applied).isEqualTo(1);

        try (Connection connection = DriverManager.getConnection(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
             Statement statement = connection.createStatement();
             ResultSet rows = statement.executeQuery(
                     "select status, decided_at, cancelled_at, cancelled_by, retroactive from leave_request")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString("status")).isEqualTo("APPROVED");
            // The decision is still the decision; the withdrawal columns are simply empty.
            assertThat(rows.getTimestamp("decided_at")).isNotNull();
            assertThat(rows.getTimestamp("cancelled_at")).isNull();
            assertThat(rows.getObject("cancelled_by")).isNull();
            assertThat(rows.getBoolean("retroactive")).isFalse();
            assertThat(rows.next()).isFalse();
        }
    }
}

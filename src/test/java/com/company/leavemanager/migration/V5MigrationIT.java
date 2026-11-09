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
 * L-15's migration half: V5 turns {@code audit_event.before_state}/{@code after_state} into
 * {@code jsonb}. A V4-era row whose text held JSON keeps its content through the cast, a row with
 * nulls keeps null, and the columns answer the database's JSON operators afterwards.
 */
@Testcontainers
class V5MigrationIT {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:18");

    @Test
    void shouldKeepExistingAuditStatesWhenTheColumnsBecomeJsonb() throws Exception {
        Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .target(MigrationVersion.fromVersion("4"))
                .load()
                .migrate();

        try (Connection connection = DriverManager.getConnection(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
             Statement statement = connection.createStatement()) {
            statement.execute("insert into audit_event "
                    + "(id, occurred_at, event_type, details, before_state, after_state) values "
                    + "('00000000-0000-0000-0000-0000000000c1', '2026-11-09T08:00:00Z', "
                    + "'LEAVE_APPROVED', 'requestId=x', '{\"status\":\"PENDING\"}', "
                    + "'{\"status\":\"APPROVED\"}')");
            statement.execute("insert into audit_event "
                    + "(id, occurred_at, event_type, details, before_state, after_state) values "
                    + "('00000000-0000-0000-0000-0000000000c2', '2026-11-09T08:01:00Z', "
                    + "'LOGIN_SUCCEEDED', null, null, null)");
        }

        int applied = Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .target(MigrationVersion.fromVersion("5"))
                .load()
                .migrate()
                .migrationsExecuted;
        assertThat(applied).isEqualTo(1);

        try (Connection connection = DriverManager.getConnection(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
             Statement statement = connection.createStatement()) {
            try (ResultSet rows = statement.executeQuery(
                    "select after_state->>'status' as status, jsonb_typeof(after_state) as kind, "
                            + "before_state->>'status' as before from audit_event "
                            + "where id = '00000000-0000-0000-0000-0000000000c1'")) {
                assertThat(rows.next()).isTrue();
                assertThat(rows.getString("status")).isEqualTo("APPROVED");
                assertThat(rows.getString("kind")).isEqualTo("object");
                assertThat(rows.getString("before")).isEqualTo("PENDING");
            }
            try (ResultSet rows = statement.executeQuery(
                    "select before_state, after_state from audit_event "
                            + "where id = '00000000-0000-0000-0000-0000000000c2'")) {
                assertThat(rows.next()).isTrue();
                assertThat(rows.getObject("before_state")).isNull();
                assertThat(rows.getObject("after_state")).isNull();
            }
        }
    }
}

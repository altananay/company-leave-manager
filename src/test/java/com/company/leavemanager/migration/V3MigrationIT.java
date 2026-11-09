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
 * AC-8's migration half: V3 adds {@code users.manager_id} and {@code users.hire_date} as nullable
 * columns, so a V2-era account keeps working untouched. The database is stopped at V2, an account is
 * written the way V2 allowed, and V3 then runs over it.
 */
@Testcontainers
class V3MigrationIT {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:18");

    @Test
    void shouldKeepExistingUsersWhenTheLeaveSchemaArrives() throws Exception {
        Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .target(MigrationVersion.fromVersion("2"))
                .load()
                .migrate();

        try (Connection connection = DriverManager.getConnection(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())) {
            try (Statement statement = connection.createStatement()) {
                statement.execute("insert into users (id, email, display_name, role, password_hash) "
                        + "values ('00000000-0000-0000-0000-000000000001', 'old@acme.test', "
                        + "'Old Account', 'EMPLOYEE', '$2a$10$abcdefghijklmnopqrstuv')");
            }
        }

        int applied = Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .load()
                .migrate()
                .migrationsExecuted;
        assertThat(applied).isEqualTo(1);

        try (Connection connection = DriverManager.getConnection(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
             Statement statement = connection.createStatement();
             ResultSet rows = statement.executeQuery(
                     "select email, role, active, manager_id, hire_date from users")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString("email")).isEqualTo("old@acme.test");
            assertThat(rows.getString("role")).isEqualTo("EMPLOYEE");
            assertThat(rows.getBoolean("active")).isTrue();
            // The new columns are null on the row that existed before them.
            assertThat(rows.getObject("manager_id")).isNull();
            assertThat(rows.getDate("hire_date")).isNull();
            assertThat(rows.next()).isFalse();
        }
    }
}

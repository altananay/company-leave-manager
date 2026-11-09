package com.company.leavemanager.migration;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.fail;

/**
 * D12/D16's migration half: V7 turns {@code leave_request.business_days} and
 * {@code leave_adjustment.days} into {@code numeric(4,1)}. A V6-era row keeps its whole-day value
 * (3 → 3.0, −2 → −2.0), a half day fits afterwards, and the two checks still refuse zero and
 * negative business days and a zero correction.
 */
@Testcontainers
class V7MigrationIT {

    private static final String MANAGER = "00000000-0000-0000-0000-0000000000d1";
    private static final String EMPLOYEE = "00000000-0000-0000-0000-0000000000d2";

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:18");

    @Test
    void shouldStoreFractionalDaysAndKeepExistingRows() throws Exception {
        Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .target(MigrationVersion.fromVersion("6"))
                .load()
                .migrate();

        try (Connection connection = connection(); Statement statement = connection.createStatement()) {
            statement.execute("insert into users (id, email, display_name, role, password_hash) "
                    + "values ('" + MANAGER + "', 'migration-lead@acme.test', "
                    + "'Migration Lead', 'MANAGER', '$2a$10$abcdefghijklmnopqrstuv')");
            statement.execute("insert into users (id, email, display_name, role, password_hash, manager_id) "
                    + "values ('" + EMPLOYEE + "', 'migration@acme.test', "
                    + "'Migration Person', 'EMPLOYEE', '$2a$10$abcdefghijklmnopqrstuv', '" + MANAGER + "')");
            // A V6-era integer row: the migration must not rewrite either value.
            statement.execute("insert into leave_request "
                    + "(id, employee_id, type, start_date, end_date, business_days, reason, status, created_at) "
                    + "values ('00000000-0000-0000-0000-0000000000e1', '" + EMPLOYEE + "', "
                    + "'ANNUAL', '2026-11-16', '2026-11-18', 3, 'aile', 'APPROVED', "
                    + "'2026-11-09T08:00:00Z')");
            statement.execute("insert into leave_adjustment "
                    + "(id, employee_id, days, reason, created_by, created_at) values "
                    + "('00000000-0000-0000-0000-0000000000e2', '" + EMPLOYEE + "', -2, "
                    + "'geçmiş dönem', '" + MANAGER + "', '2026-11-09T08:00:00Z')");
        }

        int applied = Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .target(MigrationVersion.fromVersion("7"))
                .load()
                .migrate()
                .migrationsExecuted;
        assertThat(applied).isEqualTo(1);

        try (Connection connection = connection(); Statement statement = connection.createStatement()) {
            assertThat(column(statement, "leave_request", "business_days"))
                    .as("business_days is numeric(4,1)")
                    .containsExactly("numeric", "4", "1");
            assertThat(column(statement, "leave_adjustment", "days"))
                    .as("days is numeric(4,1)")
                    .containsExactly("numeric", "4", "1");

            try (ResultSet row = statement.executeQuery(
                    "select business_days from leave_request where id = "
                            + "'00000000-0000-0000-0000-0000000000e1'")) {
                assertThat(row.next()).isTrue();
                assertThat(row.getBigDecimal("business_days")).isEqualByComparingTo("3");
            }
            try (ResultSet row = statement.executeQuery(
                    "select days from leave_adjustment where id = "
                            + "'00000000-0000-0000-0000-0000000000e2'")) {
                assertThat(row.next()).isTrue();
                assertThat(row.getBigDecimal("days")).isEqualByComparingTo("-2");
            }

            // The new unit stores a half day on both sides.
            statement.execute("insert into leave_request "
                    + "(id, employee_id, type, start_date, end_date, half_day, business_days, reason, "
                    + "status, created_at) values "
                    + "('00000000-0000-0000-0000-0000000000e3', '" + EMPLOYEE + "', 'EXCUSE', "
                    + "'2026-11-16', '2026-11-16', 'AM', 0.5, 'doktor', 'PENDING', "
                    + "'2026-11-09T09:00:00Z')");
            statement.execute("insert into leave_adjustment "
                    + "(id, employee_id, days, reason, created_by, created_at) values "
                    + "('00000000-0000-0000-0000-0000000000e4', '" + EMPLOYEE + "', 0.5, "
                    + "'yarım gün', '" + MANAGER + "', '2026-11-09T09:00:00Z')");
            assertThat(scalar(statement, "select business_days from leave_request where id = "
                    + "'00000000-0000-0000-0000-0000000000e3'")).isEqualByComparingTo("0.5");
            assertThat(scalar(statement, "select days from leave_adjustment where id = "
                    + "'00000000-0000-0000-0000-0000000000e4'")).isEqualByComparingTo("0.5");

            // The checks survive the type change and speak the decimal unit.
            assertRejected(statement, leaveRequest(0));
            assertRejected(statement, leaveRequest(-0.5));
            assertRejected(statement, "insert into leave_adjustment "
                    + "(id, employee_id, days, reason, created_by, created_at) values "
                    + "('00000000-0000-0000-0000-0000000000e5', '" + EMPLOYEE + "', 0, "
                    + "'sıfır', '" + MANAGER + "', '2026-11-09T09:00:00Z')");
        }
    }

    private static String leaveRequest(double businessDays) {
        return "insert into leave_request "
                + "(id, employee_id, type, start_date, end_date, business_days, status, created_at) values "
                + "('" + java.util.UUID.randomUUID() + "', '" + EMPLOYEE + "', 'ANNUAL', "
                + "'2026-11-16', '2026-11-18', " + businessDays + ", 'PENDING', "
                + "'2026-11-09T09:00:00Z')";
    }

    /** data_type, numeric_precision, numeric_scale of one column. */
    private static java.util.List<String> column(Statement statement, String table, String name)
            throws SQLException {
        try (ResultSet row = statement.executeQuery(
                "select data_type, numeric_precision, numeric_scale from information_schema.columns "
                        + "where table_name = '" + table + "' and column_name = '" + name + "'")) {
            assertThat(row.next()).as("%s.%s exists", table, name).isTrue();
            return java.util.List.of(row.getString("data_type"),
                    String.valueOf(row.getInt("numeric_precision")),
                    String.valueOf(row.getInt("numeric_scale")));
        }
    }

    private static BigDecimal scalar(Statement statement, String sql) throws SQLException {
        try (ResultSet row = statement.executeQuery(sql)) {
            assertThat(row.next()).isTrue();
            return row.getBigDecimal(1);
        }
    }

    /** A check violation is SQLState 23514; the database, not the application, is the authority. */
    private static void assertRejected(Statement statement, String sql) throws SQLException {
        try {
            statement.execute(sql);
            fail("the database accepted a row the check constraint must refuse: " + sql);
        } catch (SQLException expected) {
            assertThat(expected.getSQLState()).isEqualTo("23514");
        }
    }

    private static Connection connection() throws SQLException {
        return DriverManager.getConnection(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
    }
}

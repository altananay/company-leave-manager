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
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.fail;

/**
 * D17/D19's migration half (spec 0004, phase B2): V8 adds {@code users.birth_date},
 * {@code users.has_school_age_child} and {@code leave_request.kinship}, replaces V3's two-type check
 * with BR-10's eight types, and states the three kinship rules as database checks.
 *
 * <p>A V7-era database keeps every row: the two existing request types are part of the new list, the
 * new columns are nullable/defaulted, and a new user without the flag gets {@code false}.
 */
@Testcontainers
class V8MigrationIT {

    private static final String MANAGER = "00000000-0000-0000-0000-0000000000f1";
    private static final String EMPLOYEE = "00000000-0000-0000-0000-0000000000f2";

    private static final List<String> SPECIAL_TYPES = List.of(
            "ANNUAL", "EXCUSE", "MARRIAGE", "BEREAVEMENT", "SPOUSE_BIRTH",
            "SCHOOL_REPORT", "BIRTHDAY", "FIRST_SCHOOL_DAY");

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:18");

    @Test
    void shouldAddTheSpecialLeaveColumnsAndChecks() throws Exception {
        Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .target(MigrationVersion.fromVersion("7"))
                .load()
                .migrate();

        try (Connection connection = connection(); Statement statement = connection.createStatement()) {
            statement.execute("insert into users (id, email, display_name, role, password_hash) "
                    + "values ('" + MANAGER + "', 'migration-lead-v8@acme.test', "
                    + "'Migration Lead V8', 'MANAGER', '$2a$10$abcdefghijklmnopqrstuv')");
            statement.execute("insert into users (id, email, display_name, role, password_hash, manager_id) "
                    + "values ('" + EMPLOYEE + "', 'migration-v8@acme.test', "
                    + "'Migration Person V8', 'EMPLOYEE', '$2a$10$abcdefghijklmnopqrstuv', '" + MANAGER + "')");
            // V7-era rows: the new type check must keep them, and the new kinship column stays null.
            statement.execute("insert into leave_request "
                    + "(id, employee_id, type, start_date, end_date, business_days, reason, status, created_at) "
                    + "values ('00000000-0000-0000-0000-0000000000e7', '" + EMPLOYEE + "', "
                    + "'ANNUAL', '2026-11-16', '2026-11-18', 3, 'aile', 'APPROVED', "
                    + "'2026-11-09T08:00:00Z')");
            statement.execute("insert into leave_request "
                    + "(id, employee_id, type, start_date, end_date, business_days, reason, status, created_at) "
                    + "values ('00000000-0000-0000-0000-0000000000e8', '" + EMPLOYEE + "', "
                    + "'EXCUSE', '2026-11-19', '2026-11-19', 1, 'doktor', 'PENDING', "
                    + "'2026-11-09T08:00:00Z')");
        }

        int applied = Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .target(MigrationVersion.fromVersion("8"))
                .load()
                .migrate()
                .migrationsExecuted;
        assertThat(applied).isEqualTo(1);

        try (Connection connection = connection(); Statement statement = connection.createStatement()) {
            // The three columns and their nullability/defaults.
            assertThat(column(statement, "users", "birth_date"))
                    .as("users.birth_date is a nullable date")
                    .isEqualTo(new Column("date", "YES", null, null));
            assertThat(column(statement, "users", "has_school_age_child"))
                    .as("users.has_school_age_child is a non-null boolean defaulting to false")
                    .isEqualTo(new Column("boolean", "NO", null, "false"));
            assertThat(column(statement, "leave_request", "kinship"))
                    .as("leave_request.kinship is a nullable varchar(16)")
                    .isEqualTo(new Column("character varying", "YES", 16, null));

            // A V7-era account keeps working and a new one gets the flag's default.
            assertThat(scalarString(statement,
                    "select birth_date from users where id = '" + EMPLOYEE + "'")).isNull();
            assertThat(scalarBoolean(statement,
                    "select has_school_age_child from users where id = '" + EMPLOYEE + "'")).isFalse();
            statement.execute("insert into users (id, email, display_name, role, password_hash) "
                    + "values ('00000000-0000-0000-0000-0000000000f3', 'migration-default-v8@acme.test', "
                    + "'Migration Default V8', 'EMPLOYEE', '$2a$10$abcdefghijklmnopqrstuv')");
            assertThat(scalarBoolean(statement,
                    "select has_school_age_child from users where id = '00000000-0000-0000-0000-0000000000f3'"))
                    .isFalse();
            assertThat(scalarString(statement,
                    "select birth_date from users where id = '00000000-0000-0000-0000-0000000000f3'")).isNull();

            // Existing rows survive and are accepted by the eight-type check.
            assertThat(scalarString(statement,
                    "select type from leave_request where id = '00000000-0000-0000-0000-0000000000e7'"))
                    .isEqualTo("ANNUAL");
            assertThat(scalarString(statement,
                    "select type from leave_request where id = '00000000-0000-0000-0000-0000000000e8'"))
                    .isEqualTo("EXCUSE");
            assertThat(scalarString(statement,
                    "select kinship from leave_request where id = '00000000-0000-0000-0000-0000000000e7'"))
                    .isNull();
            assertThat(scalarLong(statement, "select count(*) from leave_request")).isEqualTo(2);

            // Each of BR-10's eight types is accepted; bereavement carries its kinship.
            for (String type : SPECIAL_TYPES) {
                statement.execute(leaveRequest(type, "BEREAVEMENT".equals(type) ? "'CHILD'" : "null"));
            }
            assertThat(scalarLong(statement, "select count(*) from leave_request")).isEqualTo(10);

            // An unknown type is still refused by the database, not stored.
            assertRejected(statement, leaveRequest("SICK", "null"));

            // The three kinship checks: mandatory on bereavement, one of four values, absent elsewhere.
            assertRejected(statement, leaveRequest("BEREAVEMENT", "null"));
            assertRejected(statement, leaveRequest("BEREAVEMENT", "'COUSIN'"));
            assertRejected(statement, leaveRequest("ANNUAL", "'SPOUSE'"));
            assertRejected(statement, leaveRequest("EXCUSE", "'CHILD'"));
            assertRejected(statement, leaveRequest("SCHOOL_REPORT", "'PARENT'"));
            statement.execute(leaveRequest(
                    "00000000-0000-0000-0000-0000000000e9", "BEREAVEMENT", "'SPOUSE'"));
            assertThat(scalarString(statement,
                    "select kinship from leave_request where id = '00000000-0000-0000-0000-0000000000e9'"))
                    .isEqualTo("SPOUSE");
        }
    }

    private static String leaveRequest(String type, String kinship) {
        return leaveRequest(UUID.randomUUID().toString(), type, kinship);
    }

    private static String leaveRequest(String id, String type, String kinship) {
        return "insert into leave_request "
                + "(id, employee_id, type, start_date, end_date, business_days, kinship, status, created_at) "
                + "values ('" + id + "', '" + EMPLOYEE + "', '" + type + "', "
                + "'2027-03-01', '2027-03-01', 1, " + kinship + ", 'PENDING', "
                + "'2026-11-09T09:00:00Z')";
    }

    /** data_type, is_nullable, character_maximum_length and column_default of one column. */
    private static Column column(Statement statement, String table, String name) throws SQLException {
        try (ResultSet row = statement.executeQuery(
                "select data_type, is_nullable, character_maximum_length, column_default "
                        + "from information_schema.columns where table_name = '" + table
                        + "' and column_name = '" + name + "'")) {
            assertThat(row.next()).as("%s.%s exists", table, name).isTrue();
            int length = row.getInt("character_maximum_length");
            Integer maxLength = row.wasNull() ? null : length;
            return new Column(
                    row.getString("data_type"),
                    row.getString("is_nullable"),
                    maxLength,
                    row.getString("column_default"));
        }
    }

    private record Column(String dataType, String nullable, Integer length, String defaultValue) {
    }

    private static String scalarString(Statement statement, String sql) throws SQLException {
        try (ResultSet row = statement.executeQuery(sql)) {
            assertThat(row.next()).isTrue();
            return row.getString(1);
        }
    }

    private static long scalarLong(Statement statement, String sql) throws SQLException {
        try (ResultSet row = statement.executeQuery(sql)) {
            assertThat(row.next()).isTrue();
            return row.getLong(1);
        }
    }

    private static boolean scalarBoolean(Statement statement, String sql) throws SQLException {
        try (ResultSet row = statement.executeQuery(sql)) {
            assertThat(row.next()).isTrue();
            return row.getBoolean(1);
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

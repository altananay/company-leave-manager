package com.company.leavemanager.migration;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.assertj.core.api.Assertions.assertThat;

@Testcontainers
class FlywayIdempotencyIT {

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:18");

    @Test
    void shouldApplyNothingOnSecondStart() {
        Flyway flyway = Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .load();

        assertThat(flyway.migrate().migrationsExecuted).isPositive();
        assertThat(flyway.migrate().migrationsExecuted).isZero();
        assertThat(flyway.info().applied()).isNotEmpty();
    }
}

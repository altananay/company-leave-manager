package com.company.leavemanager.health;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import static org.assertj.core.api.Assertions.assertThat;

/** AC-2 (down): with an unreachable database the same endpoint answers 503 and {"status":"DOWN"}. */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {
                "spring.datasource.url=jdbc:postgresql://localhost:1/leave_manager",
                "spring.datasource.username=leave",
                "spring.datasource.password=leave",
                // Never fail fast at startup: the point of this test is the health answer, not a boot failure.
                "spring.datasource.hikari.initialization-fail-timeout=-1",
                "spring.flyway.enabled=false",
                // JPA validation and the session repository must not connect while the database is down.
                "spring.jpa.hibernate.ddl-auto=none",
                "spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.PostgreSQLDialect",
                "spring.jpa.properties.hibernate.boot.allow_jdbc_metadata_access=false",
                "spring.session.jdbc.initialize-schema=never"
        })
class HealthDownIT {

    @Value("${local.server.port}")
    int port;

    @Test
    void shouldReturn503WhenDatabaseIsDown() throws Exception {
        HttpResponse<String> response = HttpClient.newHttpClient().send(
                HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/health")).GET().build(),
                HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).isEqualTo(503);
        assertThat(response.body()).isEqualTo("{\"status\":\"DOWN\"}");
    }
}

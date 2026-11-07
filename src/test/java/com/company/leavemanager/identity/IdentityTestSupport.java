package com.company.leavemanager.identity;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;

import java.io.IOException;
import java.net.CookieManager;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Shared setup for the identity integration tests: a real PostgreSQL, a real HTTP server, and a
 * cookie-aware client per session so tests exercise the same path a browser does.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
public abstract class IdentityTestSupport {

    protected static final String HR_EMAIL = "hr@acme.test";
    protected static final String HR_PASSWORD = "hr-password-123456";
    protected static final String CEO_EMAIL = "ceo@acme.test";
    protected static final String CEO_PASSWORD = "ceo-password-123456";

    /**
     * One container for the whole test JVM: every identity test class shares the same database, so a
     * cached Spring context never points at a container that another class already stopped.
     */
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:18");

    static {
        POSTGRES.start();
    }

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("app.seed.hr-email", () -> HR_EMAIL);
        registry.add("app.seed.hr-password", () -> HR_PASSWORD);
        registry.add("app.seed.ceo-email", () -> CEO_EMAIL);
        registry.add("app.seed.ceo-password", () -> CEO_PASSWORD);
    }

    @Value("${local.server.port}")
    protected int port;

    protected Session session;

    @BeforeEach
    void freshSession() {
        session = new Session();
    }

    /** One browser-like session: its own cookie jar and its own CSRF token. */
    public final class Session {

        private final HttpClient client = HttpClient.newBuilder().cookieHandler(new CookieManager()).build();
        private String csrf;

        public HttpResponse<String> get(String path) throws IOException, InterruptedException {
            return client.send(HttpRequest.newBuilder(URI.create(base() + path)).GET().build(),
                    HttpResponse.BodyHandlers.ofString());
        }

        public HttpResponse<String> post(String path, String json) throws IOException, InterruptedException {
            return client.send(HttpRequest.newBuilder(URI.create(base() + path))
                    .header("Content-Type", "application/json")
                    .header("X-CSRF-TOKEN", csrf())
                    .POST(HttpRequest.BodyPublishers.ofString(json))
                    .build(), HttpResponse.BodyHandlers.ofString());
        }

        public HttpResponse<String> postWithoutCsrf(String path, String json) throws IOException, InterruptedException {
            return client.send(HttpRequest.newBuilder(URI.create(base() + path))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(json))
                    .build(), HttpResponse.BodyHandlers.ofString());
        }

        public HttpResponse<String> login(String email, String password) throws IOException, InterruptedException {
            return post("/api/auth/login", "{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}");
        }

        public String csrf() throws IOException, InterruptedException {
            if (csrf == null) {
                HttpResponse<String> response = get("/api/auth/csrf");
                csrf = extract(response.body(), "token");
                if (csrf == null) {
                    throw new IllegalStateException(
                            "no csrf token: " + response.statusCode() + " " + response.body());
                }
            }
            return csrf;
        }
    }

    protected String base() {
        return "http://localhost:" + port;
    }

    protected static String extract(String json, String field) {
        Matcher matcher = Pattern.compile("\"" + field + "\":\"([^\"]*)\"").matcher(json);
        return matcher.find() ? matcher.group(1) : null;
    }

    protected static boolean hasSessionCookie(HttpResponse<String> response) {
        return response.headers().allValues("set-cookie").stream()
                .anyMatch(cookie -> cookie.startsWith("SESSION="));
    }
}

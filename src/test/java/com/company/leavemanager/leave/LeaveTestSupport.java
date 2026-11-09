package com.company.leavemanager.leave;

import com.company.leavemanager.identity.IdentityTestSupport;

import java.net.http.HttpResponse;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Setup shared by the leave integration tests: accounts with a manager and a hire date, a signed-in
 * session whose temporary password is already changed, and date helpers that keep every request in
 * the future so no test depends on the day it runs.
 */
abstract class LeaveTestSupport extends IdentityTestSupport {

    protected static final ZoneId BUSINESS_ZONE = ZoneId.of("Europe/Istanbul");
    protected static final String NEW_PASSWORD = "member-password-123";

    protected record Account(UUID id, String email, String displayName, String temporaryPassword) {
    }

    protected void loginAsHr() throws Exception {
        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);
    }

    protected Account createAccount(String role, UUID managerId, LocalDate hireDate) throws Exception {
        String stamp = Long.toString(System.nanoTime());
        String email = role.toLowerCase(Locale.ROOT) + "-" + stamp + "@acme.test";
        String displayName = "Leave " + role + " " + stamp;
        StringBuilder body = new StringBuilder()
                .append("{\"email\":\"").append(email)
                .append("\",\"displayName\":\"").append(displayName)
                .append("\",\"role\":\"").append(role).append('"');
        if (managerId != null) {
            body.append(",\"managerId\":\"").append(managerId).append('"');
        }
        if (hireDate != null) {
            body.append(",\"hireDate\":\"").append(hireDate).append('"');
        }
        body.append('}');
        HttpResponse<String> created = session.post("/api/users", body.toString());
        assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
        return new Account(
                UUID.fromString(extract(created.body(), "id")),
                email,
                displayName,
                extract(created.body(), "temporaryPassword"));
    }

    /** Signs a new account in and replaces its temporary password; the returned session is usable. */
    protected Session signIn(Account account) throws Exception {
        Session member = new Session();
        HttpResponse<String> login = member.login(account.email(), account.temporaryPassword());
        assertThat(login.statusCode()).as(login.body()).isEqualTo(200);
        HttpResponse<String> changed = member.post("/api/auth/password",
                "{\"currentPassword\":\"" + account.temporaryPassword() + "\","
                        + "\"newPassword\":\"" + NEW_PASSWORD + "\","
                        + "\"confirmPassword\":\"" + NEW_PASSWORD + "\"}");
        assertThat(changed.statusCode()).as(changed.body()).isEqualTo(204);
        return member;
    }

    protected HttpResponse<String> createLeave(Session member,
                                               String type,
                                               LocalDate start,
                                               LocalDate end,
                                               String reason) throws Exception {
        return member.post("/api/leave/requests", "{\"type\":\"" + type
                + "\",\"startDate\":\"" + start
                + "\",\"endDate\":\"" + end
                + "\",\"reason\":\"" + reason + "\"}");
    }

    protected HttpResponse<String> approve(Session manager, String requestId) throws Exception {
        return manager.post("/api/leave/requests/" + requestId + "/approve", "{}");
    }

    protected HttpResponse<String> reject(Session manager, String requestId, String note) throws Exception {
        return manager.post("/api/leave/requests/" + requestId + "/reject", "{\"note\":\"" + note + "\"}");
    }

    protected HttpResponse<String> cancel(Session member, String requestId) throws Exception {
        return member.post("/api/leave/requests/" + requestId + "/cancel", "{}");
    }

    protected static LocalDate today() {
        return LocalDate.now(BUSINESS_ZONE);
    }

    /** A Monday at least three weeks ahead: a full working week starts there. */
    protected static LocalDate nextMonday() {
        LocalDate day = today().plusDays(21);
        while (day.getDayOfWeek() != DayOfWeek.MONDAY) {
            day = day.plusDays(1);
        }
        return day;
    }

    protected static int number(String json, String field) {
        Matcher matcher = Pattern.compile("\"" + field + "\":(-?\\d+)").matcher(json);
        return matcher.find() ? Integer.parseInt(matcher.group(1)) : Integer.MIN_VALUE;
    }

    protected static boolean jsonNull(String json, String field) {
        return Pattern.compile("\"" + field + "\":null").matcher(json).find();
    }

    protected static String errorCode(HttpResponse<String> response) {
        return extract(response.body(), "code");
    }
}

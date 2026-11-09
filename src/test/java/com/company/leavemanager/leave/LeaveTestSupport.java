package com.company.leavemanager.leave;

import com.company.leavemanager.identity.IdentityTestSupport;
import com.company.leavemanager.testing.WorkingDays;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;
import java.net.http.HttpResponse;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Setup shared by the leave integration tests: accounts with a manager and a hire date, a signed-in
 * session whose temporary password is already changed, and date helpers that keep every request in
 * the future so no test depends on the day it runs.
 *
 * <p>The date helpers know the weekend <em>and</em> the {@code public_holiday} rows the database
 * seeds (spec 0004 review round 3, N-02). Round 2's fixtures said "the next Monday" and then asserted
 * five business days; on Kurban Bayramı that Monday is a holiday and the count is four, so CI failed
 * on a day nobody touched.
 */
abstract class LeaveTestSupport extends IdentityTestSupport {

    protected static final ZoneId BUSINESS_ZONE = ZoneId.of("Europe/Istanbul");
    protected static final String NEW_PASSWORD = "member-password-123";

    /** The same rows the production calendar reads (BR-4): never a hard-coded holiday list. */
    @Autowired
    protected JdbcTemplate jdbc;

    protected record Account(UUID id, String email, String displayName, String temporaryPassword) {
    }

    protected void loginAsHr() throws Exception {
        assertThat(session.login(HR_EMAIL, HR_PASSWORD).statusCode()).isEqualTo(200);
    }

    protected Account createAccount(String role, UUID managerId, LocalDate hireDate) throws Exception {
        return createAccount(role, managerId, hireDate, null, false);
    }

    /**
     * The same account with BR-10's personal-data fields (D17): the birth date for the birthday
     * window and the school-age-child flag for the two school types. A null/false field is left out
     * of the body, exactly like the HR form does, so the column default applies.
     */
    protected Account createAccount(String role,
                                    UUID managerId,
                                    LocalDate hireDate,
                                    LocalDate birthDate,
                                    boolean hasSchoolAgeChild) throws Exception {
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
        if (birthDate != null) {
            body.append(",\"birthDate\":\"").append(birthDate).append('"');
        }
        if (hasSchoolAgeChild) {
            body.append(",\"hasSchoolAgeChild\":true");
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

    /** The same request with a half-day selection (D15); {@code NONE} is a whole-day request. */
    protected HttpResponse<String> createLeave(Session member,
                                               String type,
                                               LocalDate start,
                                               LocalDate end,
                                               String halfDay,
                                               String reason) throws Exception {
        return member.post("/api/leave/requests", "{\"type\":\"" + type
                + "\",\"startDate\":\"" + start
                + "\",\"endDate\":\"" + end
                + "\",\"halfDay\":\"" + halfDay
                + "\",\"reason\":\"" + reason + "\"}");
    }

    /**
     * A BR-10 special request (D17/D19): {@code kinship} is sent only when it is non-null, so the
     * bereavement case carries it and the other five types really omit it.
     */
    protected HttpResponse<String> createSpecialLeave(Session member,
                                                      String type,
                                                      LocalDate start,
                                                      LocalDate end,
                                                      String kinship,
                                                      String reason) throws Exception {
        StringBuilder body = new StringBuilder()
                .append("{\"type\":\"").append(type)
                .append("\",\"startDate\":\"").append(start)
                .append("\",\"endDate\":\"").append(end).append('"');
        if (kinship != null) {
            body.append(",\"kinship\":\"").append(kinship).append('"');
        }
        body.append(",\"reason\":\"").append(reason).append("\"}");
        return member.post("/api/leave/requests", body.toString());
    }

    /** HR records a request on behalf of an employee (BR-11's exception path). */
    protected HttpResponse<String> createLeaveFor(Session hr,
                                                  UUID employeeId,
                                                  String type,
                                                  LocalDate start,
                                                  LocalDate end,
                                                  String reason) throws Exception {
        return hr.post("/api/leave/requests", "{\"type\":\"" + type
                + "\",\"startDate\":\"" + start
                + "\",\"endDate\":\"" + end
                + "\",\"reason\":\"" + reason
                + "\",\"employeeId\":\"" + employeeId + "\"}");
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

    /** The public-holiday rows as they stand now, so a fixture can see the same calendar as BR-4. */
    protected Set<LocalDate> publicHolidays() {
        return Set.copyOf(jdbc.queryForList("select day from public_holiday", LocalDate.class));
    }

    /**
     * The first Monday at least three weeks ahead whose four-week window (the week before it
     * included) holds no public holiday. Every range a test starts there counts exactly five business
     * days per whole week, so a fixed expectation cannot shift with the calendar (N-02).
     */
    protected LocalDate nextMonday() {
        return WorkingDays.holidayFreeMonday(today().plusDays(21), 4, publicHolidays());
    }

    /** A working day {@code days} ago: a weekend or a holiday is stepped back over (N-02). */
    protected LocalDate workingDayDaysAgo(int days) {
        return WorkingDays.previousWorkingDay(today().minusDays(days), publicHolidays());
    }

    /** A working day {@code years} ago, for a fixture that must sit before a hire date (N-02). */
    protected LocalDate workingDayYearsAgo(int years) {
        return WorkingDays.previousWorkingDay(today().minusYears(years), publicHolidays());
    }

    protected static int number(String json, String field) {
        Matcher matcher = Pattern.compile("\"" + field + "\":(-?\\d+)").matcher(json);
        return matcher.find() ? Integer.parseInt(matcher.group(1)) : Integer.MIN_VALUE;
    }

    /** A day amount from a JSON body, keeping the decimal unit ({@code 0.5}, {@code 13.0}, D16). */
    protected static BigDecimal decimal(String json, String field) {
        Matcher matcher = Pattern.compile("\"" + field + "\":(-?\\d+(?:\\.\\d+)?)").matcher(json);
        assertThat(matcher.find()).as("%s in %s", field, json).isTrue();
        return new BigDecimal(matcher.group(1));
    }

    protected static boolean jsonNull(String json, String field) {
        return Pattern.compile("\"" + field + "\":null").matcher(json).find();
    }

    protected static String errorCode(HttpResponse<String> response) {
        return extract(response.body(), "code");
    }
}

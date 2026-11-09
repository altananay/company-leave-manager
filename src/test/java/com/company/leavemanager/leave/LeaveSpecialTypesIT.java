package com.company.leavemanager.leave;

import com.company.leavemanager.testing.WorkingDays;
import org.junit.jupiter.api.Test;

import java.net.http.HttpResponse;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * AC-14/AC-15's HTTP half (spec 0004, phase B2): BR-10's six special types end to end —
 * create, approve, the seven new codes, the half-day refusal, the untouched balance and the quota
 * re-check at approval. The arithmetic itself is {@link SpecialLeavePolicyTest}'s job.
 */
class LeaveSpecialTypesIT extends LeaveTestSupport {

    private static final List<String> SPECIAL_TYPES = List.of(
            "MARRIAGE", "BEREAVEMENT", "SPOUSE_BIRTH",
            "SCHOOL_REPORT", "BIRTHDAY", "FIRST_SCHOOL_DAY");

    private record Team(Account employee, Session member, Session managerSession) {
    }

    /** A manager and a report whose personal-data fields are the ones the test needs (D17). */
    private Team team(LocalDate birthDate, boolean hasSchoolAgeChild) throws Exception {
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(2),
                birthDate, hasSchoolAgeChild);
        return new Team(employee, signIn(employee), signIn(manager));
    }

    /**
     * A holiday-free Monday far enough ahead for all six fixtures (seven holiday-free weeks are
     * reserved, while the fixtures end at day 23), moved one week forward if the following Monday
     * would fall in the next calendar year so the two school-quota dates share a year.
     */
    private LocalDate semesterStart() {
        LocalDate monday = WorkingDays.holidayFreeMonday(today().plusDays(21), 7, publicHolidays());
        if (monday.getYear() != monday.plusDays(7).getYear()) {
            monday = monday.plusDays(7);
        }
        return monday;
    }

    private static LocalDate birthdayOn(LocalDate leaveDate) {
        return leaveDate.minusYears(30);
    }

    // ---------------------------------------------------------------- allowed

    @Test
    void shouldOpenEachSpecialTypeWithoutDeductingTheBalance() throws Exception {
        LocalDate monday = semesterStart();
        Team team = team(birthdayOn(monday.plusDays(22)), true);
        int remainingBefore = number(team.member().get("/api/leave/balance").body(), "remaining");

        record Case(String type, LocalDate start, LocalDate end, String kinship, String days) {
        }
        List<Case> cases = List.of(
                new Case("MARRIAGE", monday, monday.plusDays(4), null, "5"),
                new Case("BEREAVEMENT", monday.plusDays(7), monday.plusDays(11), "SPOUSE", "5"),
                new Case("SPOUSE_BIRTH", monday.plusDays(14), monday.plusDays(18), null, "5"),
                new Case("SCHOOL_REPORT", monday.plusDays(21), monday.plusDays(21), null, "1"),
                new Case("BIRTHDAY", monday.plusDays(22), monday.plusDays(22), null, "1"),
                new Case("FIRST_SCHOOL_DAY", monday.plusDays(23), monday.plusDays(23), null, "1"));

        for (Case special : cases) {
            HttpResponse<String> created = createSpecialLeave(team.member(), special.type(),
                    special.start(), special.end(), special.kinship(), "aile");
            assertThat(created.statusCode()).as(special.type() + ": " + created.body()).isEqualTo(201);
            assertThat(decimal(created.body(), "businessDays")).as(special.type())
                    .isEqualByComparingTo(special.days());

            UUID id = UUID.fromString(extract(created.body(), "id"));
            if (special.kinship() == null) {
                assertThat(jsonNull(created.body(), "kinship")).as(special.type()).isTrue();
                assertThat(jdbc.queryForObject("select kinship from leave_request where id = ?",
                        String.class, id)).as(special.type()).isNull();
            } else {
                // D17: the kinship is stored on the request itself and nowhere else.
                assertThat(extract(created.body(), "kinship")).isEqualTo(special.kinship());
                assertThat(jdbc.queryForObject("select kinship from leave_request where id = ?",
                        String.class, id)).isEqualTo(special.kinship());
            }

            HttpResponse<String> approved = approve(team.managerSession(), id.toString());
            assertThat(approved.statusCode()).as(special.type() + ": " + approved.body()).isEqualTo(200);
            assertThat(approved.body()).contains("\"status\":\"APPROVED\"");
        }

        // BR-9/AC-14: none of the six moves the annual balance, pending or approved.
        assertThat(number(team.member().get("/api/leave/balance").body(), "remaining")).isEqualTo(remainingBefore);
    }

    @Test
    void shouldKeepTheReasonOptionalForTheSpecialTypes() throws Exception {
        // BR-10's six types are recorded with an optional reason; only EXCUSE keeps its own gate.
        LocalDate monday = semesterStart();
        Team team = team(null, false);

        HttpResponse<String> created = createSpecialLeave(team.member(), "BEREAVEMENT",
                monday, monday.plusDays(2), "CHILD", "");

        assertThat(created.statusCode()).as(created.body()).isEqualTo(201);
        assertThat(approve(team.managerSession(), extract(created.body(), "id")).statusCode()).isEqualTo(200);
    }

    // --------------------------------------------------------------- refusals

    @Test
    void shouldRefuseAMarriageLongerThanFiveBusinessDays() throws Exception {
        LocalDate monday = semesterStart();
        Team team = team(null, false);

        // Six business days: one over BR-10's upper bound (D19).
        HttpResponse<String> response = createSpecialLeave(team.member(), "MARRIAGE",
                monday, monday.plusDays(7), null, "aile");

        assertThat(response.statusCode()).as(response.body()).isEqualTo(400);
        assertThat(errorCode(response)).isEqualTo("LEAVE_SPECIAL_TOO_LONG");
        assertThat(number(team.member().get("/api/leave/requests").body(), "total")).isZero();
    }

    @Test
    void shouldRefuseAMultiDayOneDayType() throws Exception {
        LocalDate monday = semesterStart();
        Team team = team(null, true);

        // Karne is exactly one business day (D19); two days answer with its own code, not merely the
        // five-day duration code.
        HttpResponse<String> response = createSpecialLeave(team.member(), "SCHOOL_REPORT",
                monday, monday.plusDays(1), null, "karne");

        assertThat(response.statusCode()).as(response.body()).isEqualTo(400);
        assertThat(errorCode(response)).isEqualTo("LEAVE_SPECIAL_ONE_DAY");
    }

    @Test
    void shouldRequireKinshipForBereavement() throws Exception {
        LocalDate monday = semesterStart();
        Team team = team(null, false);

        HttpResponse<String> response = createSpecialLeave(team.member(), "BEREAVEMENT",
                monday, monday.plusDays(4), null, "vefat");

        assertThat(response.statusCode()).as(response.body()).isEqualTo(400);
        assertThat(errorCode(response)).isEqualTo("LEAVE_KINSHIP_REQUIRED");
        assertThat(number(team.member().get("/api/leave/requests").body(), "total")).isZero();
    }

    @Test
    void shouldRefuseTheSchoolTypesWithoutTheSchoolAgeChild() throws Exception {
        LocalDate monday = semesterStart();
        Team team = team(null, false);

        for (String type : List.of("SCHOOL_REPORT", "FIRST_SCHOOL_DAY")) {
            HttpResponse<String> response = createSpecialLeave(team.member(), type,
                    monday, monday, null, "okul");
            assertThat(response.statusCode()).as(type + ": " + response.body()).isEqualTo(400);
            assertThat(errorCode(response)).as(type).isEqualTo("LEAVE_NO_SCHOOL_AGE_CHILD");
        }
    }

    @Test
    void shouldRefuseTheBirthdayWithoutABirthDate() throws Exception {
        LocalDate monday = semesterStart();
        Team team = team(null, false);

        HttpResponse<String> response = createSpecialLeave(team.member(), "BIRTHDAY",
                monday, monday, null, "doğum günü");

        assertThat(response.statusCode()).as(response.body()).isEqualTo(400);
        assertThat(errorCode(response)).isEqualTo("LEAVE_NO_BIRTH_DATE");
    }

    @Test
    void shouldRefuseTheBirthdayOutsideTheWindow() throws Exception {
        LocalDate monday = semesterStart();
        // The most recent birthday is monday − 181 days, one day past the 180-day window (D19).
        LocalDate birthDate = monday.minusDays(181).minusYears(30);
        Team team = team(birthDate, false);

        HttpResponse<String> response = createSpecialLeave(team.member(), "BIRTHDAY",
                monday, monday, null, "doğum günü");

        assertThat(response.statusCode()).as(response.body()).isEqualTo(400);
        assertThat(errorCode(response)).isEqualTo("LEAVE_BIRTHDAY_WINDOW");
    }

    @Test
    void shouldRefuseKinshipOnANonBereavementType() throws Exception {
        // D17 says "absent on every other type"; the service answers 400 instead of reaching the
        // database check and turning a client mistake into a 500.
        LocalDate monday = semesterStart();
        Team team = team(null, false);

        HttpResponse<String> response = createSpecialLeave(team.member(), "MARRIAGE",
                monday, monday.plusDays(1), "SPOUSE", "aile");

        assertThat(response.statusCode()).as(response.body()).isEqualTo(400);
        assertThat(errorCode(response)).isEqualTo("INVALID_PARAMETER");
    }

    @Test
    void shouldRefuseASecondSchoolReportInTheSameYear() throws Exception {
        LocalDate monday = semesterStart();
        Team team = team(null, true);

        assertThat(createSpecialLeave(team.member(), "SCHOOL_REPORT", monday, monday, null, "karne")
                .statusCode()).isEqualTo(201);
        HttpResponse<String> second = createSpecialLeave(team.member(), "SCHOOL_REPORT",
                monday.plusDays(7), monday.plusDays(7), null, "ikinci karne");

        // The first request is still pending, and pending requests count (D19).
        assertThat(second.statusCode()).as(second.body()).isEqualTo(400);
        assertThat(errorCode(second)).isEqualTo("LEAVE_SPECIAL_QUOTA_USED");
        assertThat(number(team.member().get("/api/leave/requests").body(), "total")).isEqualTo(1);
    }

    @Test
    void shouldRecheckTheQuotaOnApproval() throws Exception {
        LocalDate monday = semesterStart();
        Team team = team(null, true);

        // The first school report is approved and uses the year's one day.
        HttpResponse<String> first = createSpecialLeave(team.member(), "SCHOOL_REPORT",
                monday, monday, null, "karne");
        assertThat(first.statusCode()).as(first.body()).isEqualTo(201);
        assertThat(approve(team.managerSession(), extract(first.body(), "id")).statusCode()).isEqualTo(200);

        // A second request is created for the next calendar year, when the quota is still free.
        LocalDate nextYearMonday = WorkingDays.holidayFreeMonday(
                monday.plusYears(1), 1, publicHolidays());
        HttpResponse<String> second = createSpecialLeave(team.member(), "SCHOOL_REPORT",
                nextYearMonday, nextYearMonday, null, "gelecek yıl");
        assertThat(second.statusCode()).as(second.body()).isEqualTo(201);
        String secondId = extract(second.body(), "id");

        // Out of band (no date-edit endpoint exists) the request moves into the used year: approval
        // must re-read the quota, exclude only itself, and refuse.
        jdbc.update("update leave_request set start_date = ?, end_date = ? where id = ?",
                monday.plusDays(7), monday.plusDays(7), UUID.fromString(secondId));

        HttpResponse<String> approval = approve(team.managerSession(), secondId);
        assertThat(approval.statusCode()).as(approval.body()).isEqualTo(400);
        assertThat(errorCode(approval)).isEqualTo("LEAVE_SPECIAL_QUOTA_USED");
        // The refusal left the request pending; the manager can reject it instead.
        assertThat(team.member().get("/api/leave/requests").body())
                .contains("\"id\":\"" + secondId + "\"")
                .contains("\"status\":\"PENDING\"");
    }

    @Test
    void shouldRefuseHalfDayForEverySpecialType() throws Exception {
        // D15/AC-12: a half day exists only for a single-day ANNUAL/EXCUSE; BR-10's six are full
        // days, so the half-day gate answers before any type rule runs.
        LocalDate monday = semesterStart();
        Team team = team(birthdayOn(monday), true);

        for (String type : SPECIAL_TYPES) {
            HttpResponse<String> response = createLeave(team.member(), type,
                    monday, monday, "AM", "yarım gün");
            assertThat(response.statusCode()).as(type + ": " + response.body()).isEqualTo(400);
            assertThat(errorCode(response)).as(type).isEqualTo("LEAVE_HALF_DAY_INVALID");
        }
        assertThat(number(team.member().get("/api/leave/requests").body(), "total")).isZero();
    }
}

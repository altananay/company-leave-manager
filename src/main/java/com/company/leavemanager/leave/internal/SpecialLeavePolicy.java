package com.company.leavemanager.leave.internal;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.MonthDay;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * BR-10's special-leave rules as pure functions (spec 0004, phase B2; D19). The service decides
 * <em>when</em> to ask and maps the answer to an {@link LeaveError}; the numbers, the windows and the
 * quota arithmetic live here, so a unit test can prove them without a database or an HTTP call.
 *
 * <p>Every method returns the refusal to apply, or empty when the rule does not concern the type.
 * {@code ANNUAL} and {@code EXCUSE} pass through every call: BR-10 only constrains the six special
 * types, and their own rules (balance, excuse bounds) stay where they are.
 */
public final class SpecialLeavePolicy {

    /** D19: birthday leave is valid for 180 days after the most recent birthday, then it drops. */
    static final int BIRTHDAY_WINDOW_DAYS = 180;

    /** The one-day types' frozen count, in the decimal day unit (D16). */
    private static final BigDecimal ONE_DAY = BigDecimal.ONE.setScale(LeaveBalance.SCALE);

    private SpecialLeavePolicy() {
    }

    /**
     * D19's one-day types are exactly one business day: a single calendar day whose frozen count is
     * {@code 1}. A range that happens to contain one working day is not "tek gün".
     */
    public static Optional<LeaveError> checkOneDay(LeaveType type,
                                                   LocalDate startDate,
                                                   LocalDate endDate,
                                                   BigDecimal businessDays) {
        if (!type.singleDay()) {
            return Optional.empty();
        }
        boolean oneDay = startDate.equals(endDate) && businessDays.compareTo(ONE_DAY) == 0;
        return oneDay ? Optional.empty() : Optional.of(LeaveError.SPECIAL_ONE_DAY);
    }

    /** BR-10's duration is an upper bound (D19): five business days or one, never more. */
    public static Optional<LeaveError> checkDuration(LeaveType type, BigDecimal businessDays) {
        int max = type.maxBusinessDays();
        if (max > 0 && businessDays.compareTo(BigDecimal.valueOf(max)) > 0) {
            return Optional.of(LeaveError.SPECIAL_TOO_LONG);
        }
        return Optional.empty();
    }

    /**
     * D17: bereavement must carry one of BR-10's four kinships; every other type must not carry one
     * at all. A kinship sent with another type is a data-entry error, not a value to store.
     */
    public static Optional<LeaveError> checkKinship(LeaveType type, Kinship kinship) {
        if (type.requiresKinship()) {
            return kinship == null ? Optional.of(LeaveError.KINSHIP_REQUIRED) : Optional.empty();
        }
        return kinship == null ? Optional.empty() : Optional.of(LeaveError.INVALID_PARAMETER);
    }

    /** BR-10: the school types need the employee's school-age-child flag to be set by HR. */
    public static Optional<LeaveError> checkSchoolAgeChild(LeaveType type, boolean hasSchoolAgeChild) {
        return type.requiresSchoolAgeChild() && !hasSchoolAgeChild
                ? Optional.of(LeaveError.NO_SCHOOL_AGE_CHILD)
                : Optional.empty();
    }

    /** BR-10: birthday leave cannot be placed without a birth date. */
    public static Optional<LeaveError> checkBirthDate(LeaveType type, LocalDate birthDate) {
        return type.requiresBirthDate() && birthDate == null
                ? Optional.of(LeaveError.NO_BIRTH_DATE)
                : Optional.empty();
    }

    /**
     * D19's birthday window: the leave starts inside the 180 days that follow the most recent
     * birthday on or before the leave date. A leave before the birthday belongs to the previous
     * year's (last) window, so a date that has not had its birthday yet is usually outside it.
     */
    public static Optional<LeaveError> checkBirthdayWindow(LeaveType type,
                                                           LocalDate birthDate,
                                                           LocalDate leaveDate) {
        if (!type.requiresBirthDate() || birthDate == null) {
            return Optional.empty();
        }
        return insideBirthdayWindow(birthDate, leaveDate)
                ? Optional.empty()
                : Optional.of(LeaveError.BIRTHDAY_WINDOW);
    }

    /** Whether {@code leaveDate} is within {@link #BIRTHDAY_WINDOW_DAYS} after the last birthday. */
    public static boolean insideBirthdayWindow(LocalDate birthDate, LocalDate leaveDate) {
        return !leaveDate.isAfter(mostRecentBirthday(birthDate, leaveDate).plusDays(BIRTHDAY_WINDOW_DAYS));
    }

    /**
     * The most recent occurrence of the birth date's month/day on or before {@code onOrBefore}.
     *
     * <p>{@link MonthDay#atYear(int)} maps 29 February to 28 February in a non-leap year, which is
     * exactly D19's rule: the window is placed on the day the birthday can be observed that year.
     */
    public static LocalDate mostRecentBirthday(LocalDate birthDate, LocalDate onOrBefore) {
        MonthDay monthDay = MonthDay.from(birthDate);
        LocalDate birthday = monthDay.atYear(onOrBefore.getYear());
        return birthday.isAfter(onOrBefore) ? monthDay.atYear(onOrBefore.getYear() - 1) : birthday;
    }

    /**
     * D19's quotas: the school types may take one business day per calendar year, birthday leave one
     * business day per birthday window. The count is the employee's <strong>approved and pending</strong>
     * requests of the same type in that window (BR-8: rejected and cancelled do not count), and the
     * request under approval is excluded by id so the check at request and approval time share one
     * rule.
     */
    public static Optional<LeaveError> checkQuota(LeaveType type,
                                                  LocalDate startDate,
                                                  BigDecimal businessDays,
                                                  LocalDate birthDate,
                                                  List<LeaveRequest> active,
                                                  UUID excludedRequestId) {
        int yearlyQuota = type.yearlyQuotaDays();
        boolean birthdayQuota = type.requiresBirthDate();
        if (yearlyQuota == 0 && !birthdayQuota) {
            return Optional.empty();
        }
        if (birthdayQuota && birthDate == null) {
            // checkBirthDate already refuses this; no window can be placed without a birth date.
            return Optional.empty();
        }
        BigDecimal used = LeaveBalance.zero();
        for (LeaveRequest request : active) {
            if (request.getType() != type
                    || request.getId().equals(excludedRequestId)
                    || !request.getStatus().isActive()) {
                continue;
            }
            if (sameQuotaWindow(type, birthDate, startDate, request.getStartDate())) {
                used = used.add(request.getBusinessDays());
            }
        }
        BigDecimal quota = BigDecimal.valueOf(yearlyQuota == 0 ? 1 : yearlyQuota);
        return used.add(businessDays).compareTo(quota) > 0
                ? Optional.of(LeaveError.SPECIAL_QUOTA_USED)
                : Optional.empty();
    }

    /** The calendar-year window, or the birthday window the two dates fall in (same last birthday). */
    private static boolean sameQuotaWindow(LeaveType type,
                                           LocalDate birthDate,
                                           LocalDate requestedStart,
                                           LocalDate otherStart) {
        if (type.requiresBirthDate()) {
            return mostRecentBirthday(birthDate, requestedStart)
                    .equals(mostRecentBirthday(birthDate, otherStart));
        }
        return requestedStart.getYear() == otherStart.getYear();
    }
}

package com.company.leavemanager.leave;

import com.company.leavemanager.identity.IdentityTestSupport;
import com.company.leavemanager.leave.internal.PublicHoliday;
import com.company.leavemanager.leave.internal.PublicHolidayRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The holiday calendar is the balance's data source (BR-4); a wrong or missing seed silently shifts
 * every balance, so each seeded year is pinned here. 2027 arrived with review round 1 (L-08).
 */
class PublicHolidaySeedIT extends IdentityTestSupport {

    @Autowired
    PublicHolidayRepository holidays;

    @Test
    void shouldSeedTheFourteen2026PublicHolidays() {
        List<LocalDate> days = holidays.findAllByOrderByDayAsc().stream()
                .map(PublicHoliday::getDay)
                .filter(day -> day.getYear() == 2026)
                .toList();

        assertThat(days).containsExactly(
                LocalDate.of(2026, 1, 1),   // Yılbaşı
                LocalDate.of(2026, 3, 20),  // Ramazan Bayramı 1. gün
                LocalDate.of(2026, 3, 21),  // Ramazan Bayramı 2. gün
                LocalDate.of(2026, 3, 22),  // Ramazan Bayramı 3. gün
                LocalDate.of(2026, 4, 23),  // Ulusal Egemenlik ve Çocuk Bayramı
                LocalDate.of(2026, 5, 1),   // Emek ve Dayanışma Günü
                LocalDate.of(2026, 5, 19),  // Atatürk'ü Anma, Gençlik ve Spor Bayramı
                LocalDate.of(2026, 5, 27),  // Kurban Bayramı 1. gün
                LocalDate.of(2026, 5, 28),  // Kurban Bayramı 2. gün
                LocalDate.of(2026, 5, 29),  // Kurban Bayramı 3. gün
                LocalDate.of(2026, 5, 30),  // Kurban Bayramı 4. gün
                LocalDate.of(2026, 7, 15),  // Demokrasi ve Millî Birlik Günü
                LocalDate.of(2026, 8, 30),  // Zafer Bayramı
                LocalDate.of(2026, 10, 29)); // Cumhuriyet Bayramı
        assertThat(holidays.findAll())
                .allSatisfy(holiday -> assertThat(holiday.getName()).isNotBlank());
    }

    @Test
    void shouldSeedThe2027PublicHolidays() {
        // Same source as 2026: the official list. The religious days follow the Hijri year, eleven
        // days earlier than 2026; 19 May is both a national day and Kurban's fourth day, so it is
        // one row and its name says both.
        List<LocalDate> days = holidays.findAllByOrderByDayAsc().stream()
                .map(PublicHoliday::getDay)
                .filter(day -> day.getYear() == 2027)
                .toList();

        assertThat(days).containsExactly(
                LocalDate.of(2027, 1, 1),   // Yılbaşı
                LocalDate.of(2027, 3, 9),   // Ramazan Bayramı 1. gün
                LocalDate.of(2027, 3, 10),  // Ramazan Bayramı 2. gün
                LocalDate.of(2027, 3, 11),  // Ramazan Bayramı 3. gün
                LocalDate.of(2027, 4, 23),  // Ulusal Egemenlik ve Çocuk Bayramı
                LocalDate.of(2027, 5, 1),   // Emek ve Dayanışma Günü
                LocalDate.of(2027, 5, 16),  // Kurban Bayramı 1. gün
                LocalDate.of(2027, 5, 17),  // Kurban Bayramı 2. gün
                LocalDate.of(2027, 5, 18),  // Kurban Bayramı 3. gün
                LocalDate.of(2027, 5, 19),  // Kurban Bayramı 4. gün + Atatürk'ü Anma
                LocalDate.of(2027, 7, 15),  // Demokrasi ve Millî Birlik Günü
                LocalDate.of(2027, 8, 30),  // Zafer Bayramı
                LocalDate.of(2027, 10, 29)); // Cumhuriyet Bayramı
        assertThat(holidays.findAll())
                .allSatisfy(holiday -> assertThat(holiday.getName()).isNotBlank());
    }
}

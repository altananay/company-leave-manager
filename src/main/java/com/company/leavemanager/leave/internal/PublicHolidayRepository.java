package com.company.leavemanager.leave.internal;

import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface PublicHolidayRepository extends JpaRepository<PublicHoliday, LocalDate> {

    List<PublicHoliday> findAllByOrderByDayAsc();
}

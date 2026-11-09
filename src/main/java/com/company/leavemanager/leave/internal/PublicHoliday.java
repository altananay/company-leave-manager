package com.company.leavemanager.leave.internal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDate;

/** A Turkish public holiday; the business calendar subtracts it from every request's duration (BR-4). */
@Entity
@Table(name = "public_holiday")
public class PublicHoliday {

    @Id
    private LocalDate day;

    @Column(nullable = false)
    private String name;

    protected PublicHoliday() {
        // for JPA
    }

    public LocalDate getDay() {
        return day;
    }

    public String getName() {
        return name;
    }
}

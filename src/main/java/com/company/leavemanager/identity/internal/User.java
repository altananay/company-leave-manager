package com.company.leavemanager.identity.internal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "users")
public class User {

    @Id
    private UUID id;

    @Column(nullable = false)
    private String email;

    @Column(name = "display_name", nullable = false)
    private String displayName;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Role role;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(name = "must_change_password", nullable = false)
    private boolean mustChangePassword;

    @Column(nullable = false)
    private boolean active;

    @Column(name = "failed_attempts", nullable = false)
    private int failedAttempts;

    @Column(name = "locked_until")
    private Instant lockedUntil;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    /** The direct manager in the org tree (BR-7); null until HR connects the employee (AC-8). */
    @Column(name = "manager_id")
    private UUID managerId;

    /** The hire date; null on every account that V2 created (the migration keeps them untouched). */
    @Column(name = "hire_date")
    private LocalDate hireDate;

    /**
     * BR-10's birthday window needs the date (D17); null until HR fills it in. It is personal data:
     * it appears only in HR's user endpoints, never in {@code /me}, balance or leave responses (D18).
     */
    @Column(name = "birth_date")
    private LocalDate birthDate;

    /** BR-10's two school types need this flag; false is the safe default (D17/D18). */
    @Column(name = "has_school_age_child", nullable = false)
    private boolean hasSchoolAgeChild;

    protected User() {
        // for JPA
    }

    public static User create(String email, String displayName, Role role, String passwordHash, Instant now) {
        return create(email, displayName, role, passwordHash, null, null, null, false, now);
    }

    public static User create(String email,
                              String displayName,
                              Role role,
                              String passwordHash,
                              UUID managerId,
                              LocalDate hireDate,
                              LocalDate birthDate,
                              boolean hasSchoolAgeChild,
                              Instant now) {
        User user = new User();
        user.id = UUID.randomUUID();
        user.email = email.toLowerCase(java.util.Locale.ROOT);
        user.displayName = displayName;
        user.role = role;
        user.passwordHash = passwordHash;
        user.mustChangePassword = true;
        user.active = true;
        user.failedAttempts = 0;
        user.createdAt = now;
        user.updatedAt = now;
        user.managerId = managerId;
        user.hireDate = hireDate;
        user.birthDate = birthDate;
        user.hasSchoolAgeChild = hasSchoolAgeChild;
        return user;
    }

    /** Records a failed login; locks the account once the attempt limit is reached. */
    public void registerFailure(Instant now, int maxAttempts, Duration lockDuration) {
        failedAttempts++;
        if (failedAttempts >= maxAttempts) {
            lockedUntil = now.plus(lockDuration);
        }
        updatedAt = now;
    }

    public void resetFailures(Instant now) {
        failedAttempts = 0;
        lockedUntil = null;
        updatedAt = now;
    }

    public boolean isLocked(Instant now) {
        return lockedUntil != null && lockedUntil.isAfter(now);
    }

    public void changePassword(String newPasswordHash, boolean mustChange, Instant now) {
        this.passwordHash = newPasswordHash;
        this.mustChangePassword = mustChange;
        this.updatedAt = now;
    }

    public void deactivate(Instant now) {
        this.active = false;
        this.updatedAt = now;
    }

    /**
     * HR sets the org data of an existing account (spec 0004 review round 1, L-04): the manager link,
     * the hire date and — since phase B2 — the birth date and the school-age-child flag BR-10 needs.
     * A null clears a date; nothing else about the account changes here. The whole set is replaced on
     * every call, so an absent field really means "not set".
     */
    public void updateOrg(UUID managerId,
                          LocalDate hireDate,
                          LocalDate birthDate,
                          boolean hasSchoolAgeChild,
                          Instant now) {
        this.managerId = managerId;
        this.hireDate = hireDate;
        this.birthDate = birthDate;
        this.hasSchoolAgeChild = hasSchoolAgeChild;
        this.updatedAt = now;
    }

    public UUID getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public String getDisplayName() {
        return displayName;
    }

    public Role getRole() {
        return role;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public boolean isMustChangePassword() {
        return mustChangePassword;
    }

    public boolean isActive() {
        return active;
    }

    public Instant getLockedUntil() {
        return lockedUntil;
    }

    public int getFailedAttempts() {
        return failedAttempts;
    }

    public UUID getManagerId() {
        return managerId;
    }

    public LocalDate getHireDate() {
        return hireDate;
    }

    public LocalDate getBirthDate() {
        return birthDate;
    }

    public boolean hasSchoolAgeChild() {
        return hasSchoolAgeChild;
    }
}

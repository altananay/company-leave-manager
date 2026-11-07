package com.company.leavemanager.identity.internal;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

@ConfigurationProperties(prefix = "app.identity")
public class IdentityProperties {

    /** Failed logins before the account is locked. */
    private int maxFailedAttempts = 5;

    /** How long the account stays locked. */
    private Duration lockoutDuration = Duration.ofMinutes(15);

    /** Absolute session lifetime, independent of activity. */
    private Duration sessionMaxAge = Duration.ofHours(8);

    public int getMaxFailedAttempts() {
        return maxFailedAttempts;
    }

    public void setMaxFailedAttempts(int maxFailedAttempts) {
        this.maxFailedAttempts = maxFailedAttempts;
    }

    public Duration getLockoutDuration() {
        return lockoutDuration;
    }

    public void setLockoutDuration(Duration lockoutDuration) {
        this.lockoutDuration = lockoutDuration;
    }

    public Duration getSessionMaxAge() {
        return sessionMaxAge;
    }

    public void setSessionMaxAge(Duration sessionMaxAge) {
        this.sessionMaxAge = sessionMaxAge;
    }
}

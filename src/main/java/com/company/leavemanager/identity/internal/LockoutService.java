package com.company.leavemanager.identity.internal;

import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Instant;

@Service
public class LockoutService {

    private final UserRepository users;
    private final IdentityProperties properties;
    private final Clock clock;

    public LockoutService(UserRepository users, IdentityProperties properties, Clock clock) {
        this.users = users;
        this.properties = properties;
        this.clock = clock;
    }

    /**
     * An expired lock clears the counter first: otherwise one wrong password after the lockout
     * would immediately lock the account again for another full period.
     */
    public boolean isLocked(User user) {
        Instant now = clock.instant();
        if (!user.isLocked(now) && user.getLockedUntil() != null) {
            user.resetFailures(now);
            users.save(user);
        }
        return user.isLocked(now);
    }

    /** Counts one failed attempt and locks the account when the limit is reached. */
    public void registerFailure(User user) {
        Instant now = clock.instant();
        user.registerFailure(now, properties.getMaxFailedAttempts(), properties.getLockoutDuration());
        users.save(user);
    }

    public void reset(User user) {
        user.resetFailures(clock.instant());
        users.save(user);
    }
}

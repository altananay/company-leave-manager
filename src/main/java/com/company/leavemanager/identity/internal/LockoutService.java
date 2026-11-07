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

    public boolean isLocked(User user) {
        return user.isLocked(clock.instant());
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

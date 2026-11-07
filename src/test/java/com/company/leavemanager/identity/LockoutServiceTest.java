package com.company.leavemanager.identity;

import com.company.leavemanager.identity.internal.IdentityProperties;
import com.company.leavemanager.identity.internal.LockoutService;
import com.company.leavemanager.identity.internal.Role;
import com.company.leavemanager.identity.internal.User;
import com.company.leavemanager.identity.internal.UserRepository;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class LockoutServiceTest {

    @Test
    void shouldLockAfterTheConfiguredFailuresAndReset() {
        UserRepository repository = mock(UserRepository.class);
        when(repository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        IdentityProperties properties = new IdentityProperties();
        properties.setMaxFailedAttempts(5);
        properties.setLockoutDuration(Duration.ofMinutes(15));

        Clock clock = Clock.fixed(Instant.parse("2026-11-07T10:00:00Z"), ZoneOffset.UTC);
        LockoutService service = new LockoutService(repository, properties, clock);
        User user = User.create("a@b.test", "A", Role.EMPLOYEE, "hash", clock.instant());

        for (int attempt = 0; attempt < 4; attempt++) {
            service.registerFailure(user);
        }
        assertThat(service.isLocked(user)).isFalse();

        service.registerFailure(user);

        assertThat(service.isLocked(user)).isTrue();
        assertThat(user.getLockedUntil()).isEqualTo(Instant.parse("2026-11-07T10:15:00Z"));

        service.reset(user);
        assertThat(service.isLocked(user)).isFalse();
    }
}

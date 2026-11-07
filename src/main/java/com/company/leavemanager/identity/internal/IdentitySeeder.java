package com.company.leavemanager.identity.internal;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.Clock;

/**
 * Creates the first HR and CEO accounts from the environment on an empty database.
 * Without the variables the application still starts — it only warns, so tests and CI can run.
 */
@Component
public class IdentitySeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(IdentitySeeder.class);

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final Clock clock;

    private final String hrEmail;
    private final String hrPassword;
    private final String ceoEmail;
    private final String ceoPassword;

    public IdentitySeeder(UserRepository users,
                          PasswordEncoder encoder,
                          Clock clock,
                          @Value("${app.seed.hr-email:}") String hrEmail,
                          @Value("${app.seed.hr-password:}") String hrPassword,
                          @Value("${app.seed.ceo-email:}") String ceoEmail,
                          @Value("${app.seed.ceo-password:}") String ceoPassword) {
        this.users = users;
        this.encoder = encoder;
        this.clock = clock;
        this.hrEmail = hrEmail;
        this.hrPassword = hrPassword;
        this.ceoEmail = ceoEmail;
        this.ceoPassword = ceoPassword;
    }

    @Override
    public void run(ApplicationArguments args) {
        seed(Role.HR, "HR Admin", hrEmail, hrPassword);
        seed(Role.CEO, "CEO", ceoEmail, ceoPassword);
    }

    private void seed(Role role, String displayName, String email, String password) {
        if (isBlank(email) || isBlank(password)) {
            log.warn("Seed for {} is not configured (SEED_{}_EMAIL / SEED_{}_PASSWORD); no account created.",
                    role, role, role);
            return;
        }
        if (users.existsByEmailIgnoreCase(email)) {
            return;
        }
        try {
            PasswordPolicy.validate(password);
        } catch (IllegalArgumentException invalid) {
            log.warn("Seed password for {} is shorter than {} characters; no account created.",
                    role, PasswordPolicy.MIN_LENGTH);
            return;
        }
        User user = User.create(email, displayName, role, encoder.encode(password), clock.instant());
        // Seeded accounts are configured deliberately by the operator: no forced password change.
        user.changePassword(encoder.encode(password), false, clock.instant());
        users.save(user);
        // Personal data stays out of the logs (docs/conventions.md, Data rules).
        log.info("Seeded {} account with id {}", role, user.getId());
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}

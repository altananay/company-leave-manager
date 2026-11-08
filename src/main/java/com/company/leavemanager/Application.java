package com.company.leavemanager;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;

import java.time.Clock;

@SpringBootApplication
public class Application {

    public static void main(String[] args) {
        SpringApplication.run(Application.class, args);
    }

    /** Every time-dependent decision reads this clock, so tests can replace it. */
    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }
}

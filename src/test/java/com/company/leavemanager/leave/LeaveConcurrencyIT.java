package com.company.leavemanager.leave;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;
import java.net.http.HttpResponse;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.IntFunction;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * L-07: the write paths are serialised per employee. Without the row lock
 * ({@code SELECT … FOR UPDATE} on the employee), two requests can both pass the overlap/balance
 * check on the same uncommitted state and both insert — the balance then goes negative, which the
 * domain forbids. These tests start their calls together and assert exactly one wins.
 */
class LeaveConcurrencyIT extends LeaveTestSupport {

    private static final int THREADS = 6;


    @Autowired
    DataSource dataSource;

    @Test
    void shouldSerialiseConcurrentCreatesForOneEmployee() throws Exception {
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session first = signIn(employee);
        assertThat(first.get("/api/leave/balance").statusCode()).isEqualTo(200);

        // Six signed-in browsers of the same employee, six non-overlapping ranges of eight business
        // days each: the 14-day entitlement can fund exactly one of them.
        List<Session> sessions = new ArrayList<>();
        sessions.add(first);
        for (int index = 1; index < THREADS; index++) {
            Session session = new Session();
            assertThat(session.login(employee.email(), NEW_PASSWORD).statusCode()).isEqualTo(200);
            sessions.add(session);
        }
        LocalDate monday = nextMonday();

        List<Outcome> outcomes = runConcurrently(THREADS, index -> () -> {
            LocalDate start = monday.plusWeeks(2L * index);
            HttpResponse<String> response = createLeave(sessions.get(index), "ANNUAL",
                    start, start.plusDays(9), "yarış " + index);
            return new Outcome(response.statusCode(),
                    response.statusCode() == 201 ? number(response.body(), "businessDays") : 0);
        });

        List<Outcome> winners = outcomes.stream().filter(outcome -> outcome.status() == 201).toList();
        assertThat(winners).hasSize(1);
        assertThat(outcomes.stream().filter(outcome -> outcome.status() == 409)).hasSize(THREADS - 1);
        // The invariant the lock protects: exactly one range took its days, whatever that range was
        // (a range can cross a public holiday, so its length is read from the winner's answer).
        int wonDays = winners.getFirst().businessDays();
        assertThat(wonDays).isBetween(5, 8);
        String balance = first.get("/api/leave/balance").body();
        assertThat(number(balance, "pending")).isEqualTo(wonDays);
        assertThat(number(balance, "remaining")).isEqualTo(14 - wonDays);
    }

    @Test
    void shouldDecideARequestOnlyOnceUnderConcurrentApprovals() throws Exception {
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusYears(1));
        Session employeeSession = signIn(employee);
        LocalDate monday = nextMonday();
        String requestId = extract(createLeave(employeeSession, "ANNUAL", monday, monday.plusDays(2), "aile").body(), "id");

        List<Session> managerSessions = new ArrayList<>();
        managerSessions.add(signIn(manager));
        for (int index = 1; index < THREADS; index++) {
            Session session = new Session();
            assertThat(session.login(manager.email(), NEW_PASSWORD).statusCode()).isEqualTo(200);
            managerSessions.add(session);
        }

        List<Outcome> outcomes = runConcurrently(THREADS, index -> () ->
                new Outcome(approve(managerSessions.get(index), requestId).statusCode(), 0));

        // One approval lands; the others see the committed decision, not the PENDING row they read.
        assertThat(outcomes.stream().filter(outcome -> outcome.status() == 200)).hasSize(1);
        assertThat(outcomes.stream().filter(outcome -> outcome.status() == 409)).hasSize(THREADS - 1);
        Integer approved = jdbc.queryForObject(
                "select count(*) from leave_request where id = ? and status = 'APPROVED'",
                Integer.class, java.util.UUID.fromString(requestId));
        assertThat(approved).isEqualTo(1);
    }

    /**
     * M-03: the create reads the employee before it takes the row lock, and the lock is what makes
     * that read authoritative. A hire-date edit that commits while the create waits must be what the
     * rules see — otherwise the request is judged against a snapshot the lock has already outgrown.
     *
     * <p>The race is made deterministic instead of hoped for: a second connection holds the row lock
     * and edits the hire date, the create blocks behind it, and the test waits until PostgreSQL
     * reports the create's own lock wait before releasing the edit. One month of service funds no
     * entitlement (BR-2); two completed years fund the five requested days, so the stale snapshot
     * answers 409 and the fresh row answers 201.
     */
    @Test
    void shouldSeeAConcurrentHireDateEditAfterTheRowLock() throws Exception {
        loginAsHr();
        Account manager = createAccount("MANAGER", null, null);
        Account employee = createAccount("EMPLOYEE", manager.id(), today().minusMonths(1));
        Session member = signIn(employee);
        LocalDate monday = nextMonday();

        ExecutorService pool = Executors.newSingleThreadExecutor();
        try (Connection blocker = dataSource.getConnection()) {
            blocker.setAutoCommit(false);
            try (PreparedStatement hold = blocker.prepareStatement(
                    "select 1 from users where id = ? for update")) {
                hold.setObject(1, employee.id());
                hold.execute();
            }

            Future<HttpResponse<String>> create = pool.submit(
                    () -> createLeave(member, "ANNUAL", monday, monday.plusDays(4), "eşzamanlı izin"));

            // The create has read the old row and is now provably inside the lock wait.
            awaitALockWait(create);
            try (PreparedStatement edit = blocker.prepareStatement(
                    "update users set hire_date = ? where id = ?")) {
                edit.setObject(1, today().minusYears(2));
                edit.setObject(2, employee.id());
                edit.executeUpdate();
            }
            blocker.commit();

            HttpResponse<String> response = create.get(60, TimeUnit.SECONDS);

            assertThat(response.statusCode())
                    .as("the row lock returned the edit (the stale snapshot answers 409): "
                            + response.body())
                    .isEqualTo(201);
            assertThat(number(response.body(), "businessDays")).isEqualTo(5);
        } finally {
            pool.shutdownNow();
        }
    }

    /** Waits until another session is blocked on a lock: the create has reached the row lock. */
    private void awaitALockWait(Future<?> create) throws Exception {
        for (int attempt = 0; attempt < 200; attempt++) {
            if (create.isDone()) {
                throw new AssertionError("the create answered before it waited for the lock: " + create.get());
            }
            Integer waiting = jdbc.queryForObject(
                    "select count(*) from pg_stat_activity where wait_event_type = 'Lock'",
                    Integer.class);
            if (waiting != null && waiting > 0) {
                return;
            }
            Thread.sleep(50);
        }
        throw new AssertionError("the create never waited for the employee row lock");
    }

    /** One call's answer: the status, and the business days of a created request. */
    private record Outcome(int status, int businessDays) {
    }

    private static <T> List<T> runConcurrently(int threads, IntFunction<Callable<T>> task)
            throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CyclicBarrier barrier = new CyclicBarrier(threads);
        List<Future<T>> futures = new ArrayList<>();
        try {
            for (int index = 0; index < threads; index++) {
                final int position = index;
                Callable<T> call = task.apply(position);
                futures.add(pool.submit(() -> {
                    barrier.await(15, TimeUnit.SECONDS);
                    return call.call();
                }));
            }
            List<T> results = new ArrayList<>();
            for (Future<T> future : futures) {
                results.add(future.get(60, TimeUnit.SECONDS));
            }
            return results;
        } finally {
            pool.shutdownNow();
        }
    }
}

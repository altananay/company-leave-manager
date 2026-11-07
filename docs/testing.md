# Testing

## The contract

- Every acceptance criterion maps to at least one test (criterion ↔ test map lives in the plan).
- Tests assert **behavior**, not implementation details or mere status codes.
- The whole suite runs inside `scripts/check` — one command, everywhere.

## Frameworks & layout

| Layer | Tool | Location |
|---|---|---|
| Unit | **JUnit 5 + Mockito** | `src/test/java/.../<module>/**Test.java` |
| Architecture | **ArchUnit** (`ModuleBoundariesTest`) | `src/test/java/.../architecture/` |
| Integration | **Spring Boot Test + MockMvc + Testcontainers (PostgreSQL 18)** | `src/test/java/.../**IT.java` |
| Component (UI) | **Vitest + Testing Library** | `web/src/**/*.test.tsx` |
| E2E | **Playwright 1.65** (Chromium) | `e2e/*.spec.ts` |

- Unit tests never touch the database; integration tests use a fresh Testcontainers database per
  run (resource hygiene, rule 5).
- The SPA's API client is typed from the OpenAPI document; component tests stub the client, not
  `fetch`.
- Determinism: the backend injects `Clock` (never `LocalDate.now()` directly), the SPA's clock and
  locale are fixed in test setup, seeds are fixed, animations/transitions are off.

## What must be tested

- Every business rule **BR-1 … BR-14** in `docs/domain.md`, at the lowest layer that fails for the
  right reason.
- The **authorization matrix**: each of the four roles against each read/write scope
  (BR-12, sensitive area *Yetkilendirme*) — a denied case is as important as an allowed one.
- The forbidden dependencies (ArchUnit), in the same `check` run.
- The single e2e journey: **employee requests annual leave → manager approves → balance decreases**.

## Test layers

1. **The cheapest test that proves the criterion.** Unit first, then component or integration
   (UI states render in component tests), and a browser end-to-end test only for what no lower
   layer can prove. A test sits at the lowest layer that fails for the right reason.
2. **e2e is optional, and budgeted.** This project has exactly **one** e2e journey (above), a budget
   of **~2 minutes**, one worker, headless. Over budget, no e2e test is added: the next test goes a
   layer down, or an existing one moves down.
3. **What exists runs in check.** Every test, e2e included, is a check step — slow suites
   full-only (Two speeds). A suite outside check costs its upkeep and proves nothing: it is never
   evidence, and nobody sees it break.
4. A UI criterion also needs a screenshot against the spec's User experience (Evidence for UI
   criteria). The agent captures it and the human judges it at SHIP. The screenshot is no reason
   for an e2e test: the states are tested at the lowest layer that can (rule 1).

## Protected-tests rule

Weakening asserts, deleting, or skipping tests to reach green is forbidden. A red test triggers
`prompts/recovery/red-test.md` (R-02) — first decide what is wrong: code, test, or spec.

**Lists that grow.** A list that later work extends (navigation, menus, report columns):
- its test asserts what its criterion needs — the items it adds, in order where order matters —
  not the whole list, unless the exact list is the behavior;
- when a shipped test pins an exact list and a criterion of the new spec adds an item, adding
  that item to the expected list is an allowed edit: it removes no expectation. It is on the
  plan's file list and named in the commit message; no spec revision is needed;
- except where the list's exactness is itself the behavior — an allow-list (roles, permissions,
  accepted values: "nothing else is accepted") or any list in a sensitive area (`docs/domain.md`).
  There an added item removes the expectation that it is refused, so that change is its own
  mini-spec (CHANGE lane, `workflows/change-request.md`) — even when a feature spec needs it —
  with `Supersedes: <NNNN>/AC-x` naming the shipped criterion; the shipped spec stays as it is;
- removing or loosening an expectation stays forbidden, and reordering an exact list changes
  behavior — it needs the criterion that orders it.

## Characterization tests

Before refactoring untested code (`workflows/refactor.md`) and for brownfield change requests
(`workflows/change-request.md`, Preserved behavior), pin the current behavior first — warts
included. They are written from observation, not from what the code "should" do.

## Evidence for UI criteria

A screenshot is evidence for a UI criterion; for change requests, before/after screenshots that
also show the preserved behavior. Tests prove the states (Test layers 1); the screenshot is the
human's visual sign-off.

**The agent captures, the human looks.**
1. **Capture.** The session running VERIFY captures one screenshot per screen and state listed in
   the spec's User experience:
   - with a scripted, headless browser (the project's choice: Playwright);
   - with the app in its deterministic mode (Determinism) and its data stubbed;
   - with the script and the images outside the repo and outside check, in a temporary directory
     that is deleted after the SHIP gate. They are never stored in the repo (Evidence policy).
2. **Look.** The SHIP gate shows them as one gallery (state → image). The ship approval covers
   looking at them; it is not a separate decision. The evidence table records `S-1…S-n
   agent-captured, judged by <name> at SHIP, <date>`.
3. **PR.** With a PR, the human may attach the screenshots before the gate closes; without one,
   the gate is enough.
4. **Fallback.** A human captures a state only when the agent cannot reach it (a real device, an
   external system), and the table says so.

A screenshot proves a criterion only against the spec's "User experience": every state it lists
(empty, loading, error, success, no permission), compared with the linked design if there is one.

## Evidence policy

1. **Evidence is referenced, not stored.** Each acceptance criterion's evidence is a pointer: the
   test's name and the command that reproduces it (`./scripts/check`). The criterion ↔ evidence
   table in the spec/plan is the only evidence artifact that lives in the repo.
2. **Reproducible evidence is never filed.** No saved check output, console dumps, coverage reports
   or log copies in the repo — git history and CI runs already archive every execution.
3. **Non-reproducible evidence** (a human-captured screenshot, a one-off measurement, an
   external-system confirmation) goes into the pull request (description or attachment), or,
   with no PR, is shown at the SHIP gate; the evidence table links to it or names it. It is the
   exception, not the rule. Agent-captured screenshots follow Evidence for UI criteria.
4. **Never clone or copy the repository inside its own working tree.** Clean-clone verification
   runs in a temporary directory outside the repo; only the one-line result (command + green/red)
   is recorded in the evidence table. The clone is always deleted, never kept.
5. **There is no `evidence/` (or `.evidence/`) directory in this workspace.** An agent that feels
   the need to create one is about to violate rule 1. `scripts/doctor` warns on both violations.

## Resource hygiene

1. **A check run leaves nothing running.** No survivors of any kind: build/compile daemons,
   package-manager services, test hosts and parallel workers, watch modes, browsers, the application
   under test, containers or emulators started for the run. Agents run check an order of magnitude
   more often than humans; per-run residue compounds into machine starvation.
2. **The residue test** (the rule's definition, not advice): run `./scripts/check` twice back to
   back; after each run, no process that check started is still alive. `./scripts/residue` runs
   it (`--fast` for the fast profile) and judges every new survivor by its parent chain:
   - an orphan (parent gone, or handed to init or a subreaper) is check's, named with its
     command line;
   - a process under a live parent from before the first run (another session, an OS service)
     is listed as "not from check" with its parent and never fails the test, so no idle machine
     is needed. The known limit: work a step hands to a process that ran before the first run
     (an earlier daemon, a browser a URL opener reuses) counts as not from check too.
   Memory is reported, not judged. Kernel threads (`[kworker/…]` on Linux) are left out: no step
   can start one. Zombies still count. The agent runs both profiles whenever `scripts/check.conf`
   changes. That is part of BUILD's Done, never an acceptance criterion. The gate shows one line,
   `Residue: clean (fast + full)`. A human decides only on RESIDUE FOUND, given the leaking step
   and a proposed fix.
3. Warm-process caches trade memory for speed for humans who build rarely; with an agent, trade the
   seconds back for a flat memory profile.
4. Interactive modes (watchers, dev servers, REPLs) never belong in check. e2e, where a project
   has it, runs single-worker and headless by default; one component owns the app-under-test
   lifecycle — started for the run, stopped at the end, including on failure and timeout.
5. **Data counts too.** Every run starts from a known state: what a run writes — database rows,
   files, queues, uploaded objects — never reaches the next run, also after a run killed halfway.
   Use a fresh database (or schema) per run, or seed and clean up inside the same step, keeping its
   exit code. The residue test measures processes and memory only; tests that pass on a clean state
   and fail on a used one are this rule failing, not the code (R-02, environment first).

Project specifics: Maven runs without a daemon; Testcontainers starts a throwaway PostgreSQL per
run and reaps it; Playwright runs `--workers=1` headless and starts/stops the app itself (no dev
server in check); `npm --prefix web run test -- --run` never watches.

## Two speeds, one contract

1. `./scripts/check` is still the one way to ask "is this good?"; `--fast` is a speed of the
   contract, not a second contract.
2. **Fast green is a working state; only full green is evidence.** Per step, per finding, per
   iteration → `--fast`. Segment exits, PROVE steps, recovery-ramp exits, the verify table and CI
   → `CHECK GREEN (full, …)`. `scripts/doctor` warns when a shipped spec, or in CI the pull
   request description, shows `CHECK GREEN (fast, …)` and no `(full, …)`.
3. Fast: compile and the quick tests (unit, component, lint). Full only: integration (Testcontainers)
   and e2e, and any single step over ~1 minute — the minute is a per-step threshold, not a total
   for the fast profile; fast has no fixed total. The walking skeleton tags the steps `[fast]` in
   check.conf.
4. **Split a test step by a selector, never by a list.** The fast step selects with a filter
   (Surefire `*Test` vs Failsafe `*IT`, a Vitest project/tag) and the full-only step runs the same
   filter inverted, so "fast ∪ the rest = every test" holds by construction.
5. Durations come from check itself (`<== <step> (n s)` per step, the total in the green line).
   Decide a split, or report a profile's duration, on the median of at least 3 runs.
6. **A full green is evidence for its commit — run it once.** When `CHECK GREEN (full, …)` exists
   for the exact commit at hand (the builder's handoff, or a CI run), review, verify and the gates
   cite it — the line, plus the CI run link and its commit SHA, which must equal HEAD — instead of
   running full again. A new commit needs a new full run — with one exception: a commit whose
   diff against the commit with the cited full green touches only `specs/` (the ship commit:
   spec moved to done/, criteria ticked, evidence table, scorecard) inherits that green — once
   `./scripts/doctor --strict` has judged the ship itself before it is committed, output shown
   (the inherited green never saw the move or the ticks). The evidence names both SHAs and the
   proof: `git diff --name-only <green-sha> HEAD -- . ':!specs/'` prints nothing (a tree diff;
   the green commit need not be an ancestor).
7. **Writing one test runs that test.** While writing or fixing a single test, run it alone with
   the test tool's own filter, without the suites that depend on it. That is authoring, never
   evidence.
8. **Before a push, run the touched area.** `--fast`, plus the full-only tests that cover what
   changed, selected with the test tool's own filter. When CI runs the full profile on the pushed
   commit, that run is the full green: do not also run full locally before pushing.
9. **A step states what it needs of the machine.** A step that needs a toolchain version, a
   container runtime or a service gets `requires <step>: <command>` in check.conf — a command the
   project writes, exit 0 = met. check runs them before the first step (unmet → red, never
   skipped); doctor says which profile this machine can run. A profile that cannot run here is
   decided at bootstrap or plan time, not found at BUILD's end (R-13).

## Determinism

Flaky tests are fixed, not retried or skipped — see R-03. Evidence of a fix: 5 consecutive green
runs. An infrastructure failure outside the tests (mirror timeout, lost runner) is not a flake:
rerun only the failed jobs and write the cause down (R-03 tells the two apart).

**The app under test runs in a deterministic mode.** Animations and transitions are off; the
clock, time zone, locale and random seeds are fixed; third-party services are replaced by stubs.
A test that measures or asserts while an animation runs is waiting on time, not on state — its
result depends on the machine's speed. Turn motion off in both places the stack offers: the test
tool's setting (Playwright `reducedMotion: 'reduce'`) and the app's own switch for test builds
(a `prefers-reduced-motion` stylesheet and a test-build flag that disables transitions).

This project's determinism settings: backend `Clock` bean fixed in tests (Europe/Istanbul, no
wall-clock reads outside it); Testcontainers database seeded by Flyway with a fixed baseline; the
SPA's date formatting pinned to `tr-TR`/`Europe/Istanbul`; Playwright `--workers=1`, headless,
`reducedMotion: 'reduce'`, fixed viewport and locale.

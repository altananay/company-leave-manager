# Security

> **Filled at bootstrap.** Baseline rules agents must honor in every plan and review.

## Secrets

- Secrets never enter the repo, specs, prompts, or chat. `.env` is gitignored; `.env.example`
  documents every variable with a placeholder.
- Agents never print secret values, even when debugging.
- Local development: **Docker Compose** reads `.env` (gitignored) for the database container; the
  **application** reads plain environment variables (`DB_URL`, `DB_USER`, `DB_PASSWORD`) — it does
  not parse `.env` itself. CI and production read environment variables (or the platform's secret
  store). No real secret is committed: `compose.yaml` and `.env.example` carry dev-only defaults
  (`leave`/`leave`) that production overrides.

## Input & output

- **Validation at the boundary:** Jakarta Bean Validation on every request DTO; business invariants
  (BR-1 … BR-14) live in domain services, not in controllers.
- **Output:** RFC 9457 Problem Details only. No stack traces, SQL, class names or internal IDs in a
  response; 5xx carries `requestId` and nothing else.
- **Escaping:** React escapes by default; `dangerouslySetInnerHTML` is forbidden.
- **CSV import is untrusted input:** header allow-list, size limit, unknown columns rejected, every
  row validated before any write, and the whole import is one transaction.
- Request and response bodies are never logged (they carry personal data).

## Personal data (KVKK)

- **Minimal set (spec 0004, D17).** The six BR-10 leave types are verified with exactly three
  fields: `users.birth_date` (the birthday window), `users.has_school_age_child` (school report and
  first school day) and `leave_request.kinship` (bereavement only: `SPOUSE`, `CHILD`, `PARENT`,
  `SIBLING`). A child's name, birth date and school, and a relative's identity, are **never
  collected**: a flag and an enum answer the same question with far less data.
- **Purpose.** Only to verify the leave entitlement BR-10 grants; the fields are not used for
  profiling, reporting or any second purpose.
- **Visibility (D18).** The birth date and the school-age flag are readable and writable only
  through HR's user endpoints (`GET/POST/PATCH /api/users`). They are deliberately absent from
  `/api/auth/me`, the balance, the leave lists and every other response, so a manager or a peer
  cannot learn them. The employee cannot edit either field. `kinship` stays on its request row and
  is visible only to the employee, their **direct** manager and HR: the request list keeps BR-12's
  subtree scope but masks the field (`kinship: null`) for a manager above the direct one and for the
  CEO, and the queue/decision responses belong to the direct manager by construction.
- **Auditing.** An HR edit of either field writes `USER_UPDATED` with the before/after values
  (BR-13), so the change is attributable.
- **Retention.** Personal data is kept for the employment period plus the statutory retention
  period. Deactivated accounts are not deleted, so the leave history and its audit trail stay
  complete (`docs/domain.md`, `docs/conventions.md`). Request and response bodies are never logged,
  so these values do not reach the application logs.

## AuthN / AuthZ

- **AuthN (V1):** corporate e-mail + password, BCrypt hashing. No self-service sign-up; İK creates
  users and resets passwords. **Lockout:** five failed attempts lock the account for 15 minutes
  (counter and lock time live in the database, so a restart does not reset them; an expired lock
  clears the counter, so the next failure starts a fresh count). Because the lockout is per account,
  a targeted attack can keep one known account locked: the reverse proxy must add per-IP rate
  limiting, which this application does not do itself.
- **Session:** server-side session stored in PostgreSQL (Spring Session JDBC) so a restart does not
  log 1,000 people out; the stored principal carries **no password hash**; cookie `HttpOnly`,
  `SameSite=Lax`, and `Secure` in production (the `prod` profile defaults it to `true`;
  `SESSION_COOKIE_SECURE` can override).
  **30 minutes idle / 8 hours absolute**; the session id changes on login (fixation protection).
  CSRF token required for every state-changing request — the SPA reads it from
  `GET /api/auth/csrf` and sends `X-CSRF-TOKEN`. A state-changing request without a session is
  answered with **401** (a lost session), not 403.
- **Error contract:** every error is RFC 9457 (`type`, `title`, `status`, plus the project's stable
  English `code`, `errors[]` for validation, and `requestId` on a 5xx). An unauthenticated request
  gets **401**, an authenticated but unauthorized one **403** (a CSRF refusal carries its own
  `CSRF_INVALID` code). The SPA sends the user back to the login screen with an "session ended"
  message **when a session really ended** — a first visit and a failed login keep their own message —
  and shows the forbidden screen on 403.
- **AuthZ:** RBAC (role) **and** data scope, enforced server-side on every request — the SPA hiding
  a button is UX, never authorization. Default deny: only the SPA shell, its assets, `/error`,
  `/api/health`, `/api/auth/login` and `/api/auth/csrf` are public; every other path is denied.
  İK can assign only `EMPLOYEE` and `MANAGER`; the `HR`/`CEO` roles come from the environment seed.
  İK cannot deactivate itself, reset its own password, or edit its own org data through the admin
  screen, and cannot deactivate, reset or edit a seeded `HR`/`CEO` account (`403 PROTECTED_ACCOUNT`):
  those accounts are managed by the environment only. A `PATCH /api/users/{id}` carries the same two
  gates (`SELF_ACTION_NOT_ALLOWED`, `PROTECTED_ACCOUNT`) as deactivate and reset-password, plus the
  domain guards the edit could break: clearing the manager of an account with a `PENDING` request is
  refused (`409 MANAGER_HAS_PENDING_REQUESTS`, because only the direct manager could decide it), a
  hire-date change that would push the balance below zero is refused
  (`409 USER_EDIT_WOULD_GO_NEGATIVE`) — the balance stays non-negative through org edits too, and the
  row is left untouched — and a hire date moved past the start of an active leave is refused
  (`400 INVALID_HIRE_DATE`): "izin işe girişten önce başlayamaz" holds after an edit, not only when
  the request is created (review round 3, N-01). A hire date outside 1950…today is refused on
  creation with the same code and the same validator (N-03/N-06).
- **SPA routes:** the shell is served at `/` and for the client routes under `/leave/**` and
  `/users` (spec 0004, backlog B-4; L-09): opening `/leave/requests` or `/users` directly returns
  the shell and the SPA picks the screen. The allow-list is explicit — a route is added to
  `SecurityConfig` and `SpaController` together; any other non-API path is still denied rather than
  forwarded to `index.html`.
- **Object-level checks:** every endpoint that takes an employee or request identifier verifies the
  caller's scope *in the query that loads the object*, not after loading it. A decision loads the
  request through the manager's own reports, a cancellation through the owner's id, and a balance
  checks self/subtree/HR first; an identifier outside that scope answers **404**, exactly like one
  that does not exist, so the endpoint never confirms that the row is real. Role and self gates
  that need no object (HR/CEO never decide, an employee never approves) answer **403** without
  loading anything — AC-4 names those codes.
- **`GET /api/leave/days` ("izinli günlerim") is self-only:** the endpoint takes no employee or
  request identifier, and the days are always the session's own approved leave. A manager and HR
  therefore read their own list here, never a report's or another employee's (D20); the
  read-anyone scopes live on `/api/leave/requests` and `/api/leave/balance`.

| Role | Scope | May write |
|---|---|---|
| Employee | own requests and balance | create/cancel own requests |
| Manager | own subtree (read, balance included), direct reports (approve) | approve/reject direct reports' requests |
| HR | company-wide | users, departments, balances (audited adjustments), imports, reports |
| CEO | company-wide, read-only | nothing |

- **Sensitive areas** (`docs/domain.md`): personal data and authorization. A spec touching one
  carries `Sensitive area: …` and gets the stricter gates in every mode.

## Dependencies

- A new dependency is justified in the plan, license-checked, maintained, and free of known critical
  CVEs; the human approves it at the plan gate. Prefer the Spring Boot BOM's managed versions.
- Frontend: the lockfile (`package-lock.json`) is committed and CI installs with `npm ci`.
- No dependency is added for formatting or convenience alone.
- Logging (spec 0006): the optional `logging` profile ships the app's JSON stdout to Elasticsearch
  and keeps it for **30 days** (ILM `leave-manager-logs`), then deletes it. Log lines carry no
  personal data or secrets; the profile binds its services (app, Elasticsearch, Kibana, db) to
  `127.0.0.1` and runs without auth/TLS for local development — production must use a managed
  cluster with TLS and authentication. Elasticsearch/Kibana are Elastic License 2.0 / SSPL (free for internal use);
  OpenSearch (Apache 2.0) is the alternative if the company's license policy requires it.

## Review lens

Security is a mandatory dimension of every independent review (see `prompts/review.md`), not a
separate afterthought phase.

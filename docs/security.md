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
  İK cannot deactivate itself or reset its own password through the admin screen.
- **No SPA deep links:** the shell is served at `/`; client-side routes are view state, so an
  unknown non-API path is denied rather than forwarded to `index.html`.
- **Object-level checks:** every endpoint that takes an employee or request identifier verifies the
  caller's scope before loading the object, not after.

| Role | Scope | May write |
|---|---|---|
| Employee | own requests and balance | create/cancel own requests |
| Manager | own subtree (read), direct reports (approve) | approve/reject direct reports' requests |
| HR | company-wide | users, departments, balances (audited adjustments), imports, reports |
| CEO | company-wide, read-only | nothing |

- **Sensitive areas** (`docs/domain.md`): personal data and authorization. A spec touching one
  carries `Sensitive area: …` and gets the stricter gates in every mode.

## Dependencies

- A new dependency is justified in the plan, license-checked, maintained, and free of known critical
  CVEs; the human approves it at the plan gate. Prefer the Spring Boot BOM's managed versions.
- Frontend: the lockfile (`package-lock.json`) is committed and CI installs with `npm ci`.
- No dependency is added for formatting or convenience alone.
- License note for the deferred logging spec (`specs/backlog.md` B-1): Elasticsearch/Kibana are
  Elastic License 2.0 / SSPL — free for internal use; OpenSearch (Apache 2.0) is the alternative if
  the company's license policy requires it.

## Review lens

Security is a mandatory dimension of every independent review (see `prompts/review.md`), not a
separate afterthought phase.

# Security

> **Filled at bootstrap.** Baseline rules agents must honor in every plan and review.

## Secrets

- Secrets never enter the repo, specs, prompts, or chat. `.env` is gitignored; `.env.example`
  documents every variable with a placeholder.
- Agents never print secret values, even when debugging.
- Local development reads `.env`; CI and production read environment variables (or the platform's
  secret store). No secret in `docker-compose.yml`, no secret in the SPA bundle.

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

- **AuthN (V1):** corporate e-mail + password, BCrypt hashing (Spring Security's delegating
  encoder). No self-service sign-up; İK creates users and resets passwords. Login rate limiting sits
  at the reverse proxy.
- **Session:** server-side session stored in PostgreSQL (Spring Session JDBC) so a restart does not
  log 1,000 people out; cookie `HttpOnly`, `Secure`, `SameSite=Lax`; CSRF token required for every
  state-changing request.
- **AuthZ:** RBAC (role) **and** data scope, enforced server-side on every request — the SPA hiding
  a button is UX, never authorization. Default deny: a missing rule denies.
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

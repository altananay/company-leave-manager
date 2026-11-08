# Conventions

> **Filled at bootstrap.** Only rules that are real: every rule here is either enforced by tooling
> (preferred) or checked in review.

## Language

- Chat language (interviews, sessions): **Turkish**
- Document language (docs/, specs, plans, ADRs, review and verify reports): **Turkish**
- Always English (protocol, not prose): ANEW core files, template headings and field labels,
  `Status:` values (Draft / Approved / In progress / Shipped), `Approved by / on:`, `Source:`.
- Code identifiers, branch names, commit messages: **English** — commit subject and body are both
  English (Conventional Commits).
- UI language: **Turkish + English**, user-selectable (TR/EN control); the default comes from the
  browser language (tr → Turkish, en → English, anything else → Turkish). All user-facing text
  lives in the SPA catalogue (`web/src/i18n/messages.ts`) — never inline in a component.
- Agent messages (handoff summaries, refusals, `Next:` lines): chat language; command names, file
  paths and protocol fields verbatim.

## Language & framework versions

| Layer | Version | Note |
|---|---|---|
| Java | **25 LTS** (25.0.2 on the dev machine) | `pom.xml` targets 25 |
| Spring Boot | **4.1.2** | Spring Framework 7.0.10, Spring Security 7.1.2, Hibernate 7.4.13 |
| PostgreSQL | **18** | JDBC driver 42.7.14 (BOM-managed) |
| Build | **Maven** + Maven Wrapper (`./mvnw`) | no build daemon (resource hygiene) |
| Node | **24 LTS** (24.11.1) | Vite 8 requires `>=22.12` |
| React | **19.3.1** | no LTS line — current stable, pinned |
| Vite | **8.3.6** | no LTS line — current stable, pinned |
| TypeScript | **7.0.2** | native compiler; `typescript-eslint` does not support it yet, so lint is **oxlint** (plan 0001 A-1) |
| Vitest / Playwright | **5.1.0** / **1.65.0** | component / e2e |
| Docker | 28.5.1 | local PostgreSQL and deployment |

Upgrades keep `scripts/check` green; a major upgrade that changes behavior is its own spec.

## Naming

- Java: packages lowercase (`com.company.leavemanager.<module>`), classes `PascalCase`,
  methods/fields `camelCase`, constants `UPPER_SNAKE_CASE`.
- Database: `snake_case`, singular table names (`leave_request`, not `leave_requests`).
- REST: kebab-case plural paths (`/api/leave-requests`), JSON fields `camelCase`.
- Tests: Java `should_<expected>_when_<condition>`; TypeScript `should <expected> when <condition>`.
- Branches: `feature/<spec-no>-<slug>`, `fix/<report-id>-<slug>`, `refactor/<spec-no>-<slug>`,
  `trivial/<slug>`, `chore/bootstrap`.

## Error handling

- Every error is **RFC 9457 Problem Details**: `type`, `title`, `status`, plus `code`
  and, for validation, `errors[]` (field → message). A 5xx also carries `requestId`. `instance` is
  optional in RFC 9457 and this project does not set it.
- One `@RestControllerAdvice` produces the error shape: `ApiExceptionHandler.problem(...)` is the
  only place a body is built, and controllers return its result — they never format JSON themselves.
- Business codes: `NOT_AUTHENTICATED`, `NOT_AUTHORIZED`, `CSRF_INVALID`, `SESSION_EXPIRED`,
  `PASSWORD_CHANGE_REQUIRED`, `ACCOUNT_LOCKED`, `INVALID_PASSWORD`, `PASSWORD_MISMATCH`,
  `WEAK_PASSWORD`, `VALIDATION_FAILED`, `INVALID_REQUEST`, `INVALID_PARAMETER`, `INVALID_ROLE`,
  `ROLE_NOT_ASSIGNABLE`, `PROTECTED_ACCOUNT`, `EMAIL_EXISTS`, `SELF_ACTION_NOT_ALLOWED`, `NOT_FOUND`,
  `METHOD_NOT_ALLOWED`, `UNSUPPORTED_MEDIA_TYPE`, `CONFLICT`, `INTERNAL_ERROR`, and the leave
  codes `LEAVE_BALANCE_INSUFFICIENT`, `LEAVE_OVERLAP`, `LEAVE_PAST_DATE`.
- 5xx never leaks internals or stack traces; the response carries `requestId` and the server logs
  the detail against the same `requestId`. 4xx never carries a stack trace either.
- User-facing text comes from the UI catalogue (tr/en); the API returns a stable English `code` and
  no prose.

## Data rules

- Timestamps are stored as `timestamptz` in **UTC**; the API exchanges ISO-8601 with offset.
- Business dates are `LocalDate`; the business calendar is **Europe/Istanbul**, with Turkish public
  holidays as data, not code.
- IDs are **UUIDs generated in the application**; no sequential IDs on any externally visible record.
- No money fields in V1 (payroll is out of scope). If one appears, it is `BigDecimal`/`numeric`,
  never floating point.
- Deletion: employees are deactivated, never deleted; audit events are never deleted.
- Enums are stored as text, not ordinals.
- No personal data in application logs — only `userId` (UUID), `requestId` and technical fields.

## Frontend

- **Tailwind CSS v4 + shadcn/ui** (ADR 0003). Components live in `web/src/ui/`; a screen composes
  them instead of writing styles of its own.
- **Colours, radii and fonts come from tokens** in `web/src/index.css`. A colour literal anywhere
  else in `web/src` fails `scripts/tokens`; a line that genuinely needs one opts out with
  `tokens-allow`. Assets (`web/public/*.svg`) and `web/index.html` are outside that scan — an SVG
  cannot read a CSS variable.
- One component per job: `Button`, `Input`, `Field`, `Alert`, `Card`, `Badge`, `Table`, `Select`,
  `Dialog`. A second, hand-styled version of any of them is a defect.
- Icons come from `lucide-react`, only the ones used; the font is the system stack (no webfont).
- Accessibility is part of the definition of done: every screen is keyboard reachable, every field
  is labelled, errors use `role="alert"`, and `jest-axe` runs on every screen in the component tests
  for the structural rules. **Contrast is measured in the real browser**: text contrast by the axe
  scan in `web/e2e/accessibility.spec.ts`, control boundaries (WCAG 1.4.11) by the computed-colour
  check in `web/e2e/contrast.spec.ts` — jsdom has no stylesheet, and axe has no rule for the latter.
- Layout is mobile-first: 360 px is the smallest width to keep working, 1024 px and up is the target.

## Known traps

Starts empty. A line is added when triage marks a finding real and the reviewer says a build-time
rule would have caught it; the human approves it at triage as Amendment A-n and the Developer writes
it in the fix round. Builders read this section before the first plan step.

## Enforced by tooling

- `scripts/check` — the single gate: build, unit, component, integration and e2e steps.
- **ArchUnit** — the forbidden dependencies in `docs/architecture.md`, rules 1–4 (rule 3, JPA
  entities, arrived with spec 0002).
- **oxlint + Prettier** — frontend lint and formatting, in `check` (oxlint because it supports
  TypeScript 7; `typescript-eslint` does not yet).
- **`scripts/tokens`** — no colour literal outside `web/src/index.css` (ADR 0003).
- Compiler — Java 25 types and null-checks as configured; no Java format gate.
- **Formatting is not tool-enforced on the Java side:** IntelliJ IDEA's default formatter is the
  project style, pinned by `.editorconfig` (LF, UTF-8, 4-space Java / 2-space web). No
  google-java-format, no Spotless. The reviewer checks style; the author reformats in IntelliJ.

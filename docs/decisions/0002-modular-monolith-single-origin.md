# ADR 0002 — Modular monolith with a single-origin SPA

- Status: Accepted
- Date: 2026-11-07

## Context

The application has six functional areas (identity, org, leave, balance, reporting, audit), one
PostgreSQL database, one maintainer and 1,000+ users. The SPA and the API are released together,
and authentication uses HttpOnly session cookies, which are simplest on a single origin.

## Decision

Build a **modular monolith**: one Spring Boot deployable containing six modules under
`com.company.leavemanager.<module>`, each with a public API package and an `internal` package. The
same deployable serves the built SPA at `/`. Module boundaries are enforced by one ArchUnit test
class. Communication is in-process only — no events, no broker, and no separate frontend server in
production.

## Consequences

- **Buys:** one deployment artifact and one transaction boundary; same-origin cookies and no CORS;
  one place to debug; a module can later be extracted into a service along its public API if it ever
  needs independent scaling.
- **Costs:** scale-out is whole-application only; module discipline depends on the ArchUnit test
  staying green (a review-only boundary would rot); the SPA and the API ship as one version, so a
  breaking API change cannot be rolled out independently.

## Alternatives considered

- **Layered monolith without module boundaries** — cheapest today, but the codebase rots into a
  tangle as features accumulate; the boundary test is cheap insurance.
- **Microservices** — independent scaling and deploys, but distributed transactions across leave and
  balance plus operational overhead, for a single maintainer and one database; rejected as
  premature.
- **Separate nginx container serving the SPA and proxying `/api`** — the standard SPA deployment,
  but it adds CORS/cookie configuration and a second release while both artifacts ship together.

## Revisit triggers

A module needs independent scaling or deployment; a second team takes a module; a mobile app or a
third party needs a versioned public API; the SPA must be released on its own cadence.

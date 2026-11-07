# ADR 0001 — Stack and versions

- Status: Accepted
- Date: 2026-11-07

## Context

Greenfield internal application: leave management for one company with 1,000+ employees, personal
data and authorization in the sensitive-area set, long-lived maintenance by a single developer who
works in Java/Spring Boot. The development machine is Windows with Git Bash, the CI runner is
Ubuntu; Java 25 LTS, .NET 10, Node 24 and Python 3.13 are installed, PostgreSQL 18 and Docker are
available. The project needs a stack the maintainer can debug alone in two years.

## Decision

**Java 25 LTS + Spring Boot 4.1.2 + Maven** for the backend, **PostgreSQL 18** for storage,
**React 19.3.1 + Vite 8.3.6 + TypeScript 7.0.2 on Node 24 LTS** for the SPA, **Docker** for local
and deployed runtime, and JUnit 5 + Mockito, ArchUnit, Testcontainers, Vitest + Testing Library and
Playwright 1.65 as the test stack.

## Consequences

- **Buys:** one backend language the maintainer already knows; a mature security/auth stack
  (Spring Security 7.1.2) for the sensitive areas; compiler-checked types across the backend;
  Testcontainers gives integration tests a real PostgreSQL 18 with no shared state; Maven has no
  build daemon, which keeps the residue test simple.
- **Costs:** two languages (Java + TypeScript) and two build toolchains; Spring Boot 4.x is young
  and its minor upgrades move dependencies (Spring Framework 7, Hibernate 7.4); TypeScript 7 is the
  native compiler and some lint/editor tooling may lag; React and Vite have no LTS line, so their
  upgrades are deliberate, pinned work rather than free.

## Alternatives considered

- **.NET 10 LTS + ASP.NET Core + Razor Pages** — strong enterprise fit, but the maintainer is a Java
  developer; the stack would be maintained by someone who does not work in it daily.
- **Node 24 + TypeScript + NestJS + React** — one language end to end, but no team familiarity and
  weaker compile-time guarantees for the domain rules (BR-1…BR-14).
- **Python + Django** — fastest path to a working internal tool with a free admin panel, but weaker
  typing and no team familiarity.
- **Gradle instead of Maven** — faster incremental builds, but the daemon is a residue source that
  must be disabled on every run; Maven has no daemon.

## Revisit triggers

A Spring Boot 5 / Java 29 migration; TypeScript 7 tooling breakage that blocks the build; a second
developer with a different language background; a requirement the SPA cannot meet (server-side
rendering, offline use).

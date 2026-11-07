# Architecture

## System overview

Company Leave Manager is the internal leave-management application of a single company with
1,000+ employees: an employee requests leave, their direct manager approves or rejects it, and
balances are tracked per entitlement period. The architectural style is a **modular monolith** —
one Spring Boot deployable (Java 25), one PostgreSQL 18 database, and a React 19 + Vite 8 SPA
served by the same deployable at `/`. One deployable, one transaction boundary and one place to
debug is the cheaper trade at this team size; the reasoning and the rejected alternatives are in
ADR 0002. Stack and versions: ADR 0001 and `docs/conventions.md`.

## Modules / components and ownership

Backend code lives under `com.company.leavemanager.<module>`.

| Module | Single responsibility | Owns |
|---|---|---|
| `identity` | Users, credentials, sessions, roles | `user`, `role`, `session` |
| `org` | Employees, departments, the manager tree, CSV import | `employee`, `department` |
| `leave` | Leave requests, approval/rejection, cancellation, leave-type rules | `leave_request`, `leave_type` |
| `balance` | Entitlement accrual, carryover, validity windows, manual adjustments | `entitlement`, `balance`, `adjustment` |
| `reporting` | Read-only reports and exports | — (reads other modules' public queries) |
| `audit` | Audit trail of write events | `audit_event` |

The SPA (`web/`) mirrors the same module names in feature folders. It holds no business rules —
the server is the only source of truth for balances, entitlements and authorization.

## Communication rules

- Modules call each other **in process** through a public API only (`<module>.api`); no events or
  message broker in V1.
- A module writes only its own tables. Cross-module work runs inside one use-case service that
  calls each module's public API; the transaction boundary is the use case.
- `reporting` is read-only and owns no tables.
- Notification delivery (in-app + e-mail) is a thin adapter used by `leave`; it is not a module of
  its own in V1.

## Forbidden dependencies (make them testable)

Enforced by one ArchUnit test class (`ModuleBoundariesTest`) in the backend test suite:

1. A module never depends on another module's `internal` package — only on its public API.
2. Web/controller classes never depend on repository classes directly.
3. JPA entities never leave their module — DTOs/maps at the boundary.
4. `reporting` never writes; there are no cyclic dependencies between modules.

## Deliberately out of scope

Multi-tenancy, microservices, an event bus/CQRS, SSO (Entra ID/Google), payroll/HRIS integration,
a native mobile app, a notification centre, and the ELK logging stack (separate infrastructure
spec, `specs/backlog.md` B-1).

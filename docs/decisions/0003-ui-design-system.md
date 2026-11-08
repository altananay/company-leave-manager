# ADR 0003 — shadcn/ui and Tailwind as the design system

- Status: Accepted
- Date: 2026-11-08

## Context

The first two slices shipped five screens written with hand-rolled CSS: one 179-line stylesheet with
`.card`, `.shell`, `.stack` and a handful of colour literals. Nothing was wrong with it until the
next slice: leave requests, approvals and balances mean many forms, tables and confirmations, built
by one maintainer, used daily by HR and occasionally — on a phone — by every employee. Every new
screen would either copy the existing classes or invent new ones, and accessibility was improvised
screen by screen.

## Decision

Adopt **Tailwind CSS v4** with the `@tailwindcss/vite` plugin and **shadcn/ui** primitives, copied
into `web/src/ui/`. Every colour, radius and font comes from a CSS variable in `web/src/index.css`;
a `scripts/tokens` step in `scripts/check` fails the build when a component writes a colour literal.
Icons come from `lucide-react` (only the used ones) and the font is the system stack.

## Consequences

- **Buys:** one place for the visual language; a new screen composes existing components instead of
  inventing styles; Radix primitives bring keyboard and screen-reader behaviour that would otherwise
  be rewritten per dialog and select; the components live in the repository, so there is no library
  version to be locked into and no theme to fight; the token file is the only thing a rebrand touches.
- **Costs:** the components are ours to maintain — a library upgrade is a copy, not an `npm update`;
  Tailwind class strings are verbose in JSX; the bundle grew from 73 KB to ~118 KB gzip for Radix and
  the icon set, which is acceptable for an internal application on the corporate network.
- **Guardrails:** `scripts/tokens` keeps colours in one file; `jest-axe` runs on every screen in the
  component tests, so an inaccessible component fails CI rather than review.

## Alternatives considered

- **Keep hand-written CSS** — zero dependencies and full control, but no shared vocabulary: the cost
  is paid on every future screen, and accessibility stays manual. Rejected as the codebase grows.
- **Tailwind alone** — the styling problem is solved, but the accessible behaviour of a dialog, a
  select and a form field is still written by hand on each screen.
- **Material UI (MUI)** — batteries included, fastest to a polished look, but ~300 KB of runtime and
  an opinionated Material appearance that is expensive to move away from. Rejected on bundle and on
  the amount of theme overriding it would need.
- **A component library with a runtime theme (Chakra, Mantine)** — similar weight to MUI plus a
  version coupling; the copy-in model of shadcn/ui avoids both.

## Revisit triggers

The component set grows past what a copy-in model can maintain (many contributors, frequent
upstream fixes); the design needs a brand identity that the token file cannot express; the bundle
becomes a measured problem on the target hardware.

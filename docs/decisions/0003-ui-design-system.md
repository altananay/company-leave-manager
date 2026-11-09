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
  Tailwind class strings are verbose in JSX; the bundle grew from 73 KB to ~119 KB gzip for Radix and
  the icon set, which is acceptable for an internal application on the corporate network. Three
  costs showed up while building it and are recorded here rather than discovered later:
  `jest-axe` runs in jsdom, where colour rules are disabled and no stylesheet is loaded, so contrast
  is measured in a Playwright scan (`e2e/accessibility.spec.ts`) and **not** by the component tests;
  the users list keeps real `<table>` semantics but becomes a stacked card layout under `md`, so its
  column headers are only announced on wide screens; and the native `<select>` is now a Radix listbox,
  which is better for screen readers and keyboard but is more markup to maintain.
- **Guardrails:** `scripts/tokens` keeps colours in one file; `jest-axe` runs on every screen in the
  component tests for the structural rules, the axe scan in `web/e2e/accessibility.spec.ts` covers
  text contrast, and `web/e2e/contrast.spec.ts` measures control boundaries — axe has no rule for
  WCAG 1.4.11, so the border of a field, a button or the role listbox is compared with its surface
  by computed colour.

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

## A-5 — the visual language, second pass (2026-11-08)

The first pass produced a correct but flat interface: one card per screen, one type size, no frame.
At the ship gate the human rejected it ("looks like Bootstrap, not shadcn") and asked for a real
design pass. The direction was chosen from four rendered mockups: **application shell + a measured
amount of life + a two-column sign-in**.

- **Shell over top bar.** The product is an internal tool used daily, and the leave flow adds
  destinations (requests, balances, reports). A 240 px sidebar carries them; a top bar with pills
  would not. Below 1024 px the same navigation becomes a sheet, so there is one navigation model.
- **Type scale, not sizes.** `--text-display … --text-label` carry size, line height, tracking and
  weight together, the way Vercel's Geist does it, and the semantic radius steps name the job
  (`chip`, `control`, `panel`, `card`, `pill`). Screens pick a step; `scripts/tokens` fails an
  arbitrary `text-[13px]`, `rounded-[10px]` or `shadow-[…]` and a named Tailwind step such as
  `text-sm`, `shadow-lg` or `rounded-lg`, so the scale cannot erode.
- **Dose of life.** One gradient (the sign-in panel and every primary action), three shadow steps,
  tinted status badges and 150–200 ms transitions. Everything else stays flat and quiet: a corporate
  tool that glows on every card is tiring to look at for eight hours.
- **Costs, stated.** Five new primitives to keep (`Avatar`, `Skeleton`, `Sheet`, `DropdownMenu`,
  `Breadcrumb`; `Separator` and `Tooltip` were never used, so they were never added at all), a
  shell that every screen now depends on, and a heavier first render (the SPA went from 374 KB to
  ~405 KB raw, 119 KB to ~127 KB gzip). The table gained client-side search, a role filter and
  pagination — state that has to be tested.
- **Guardrails.** The shell is the only place that draws navigation; `PageHeader` is the only way to
  start a screen; the token gate refuses named/arbitrary radii, shadows and text sizes; motion is
  token-driven and switches off under `prefers-reduced-motion`.

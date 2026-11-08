# Git

> **Set at bootstrap.** Defaults below are safe; loosen consciously, not accidentally.

## Branching

- `feature/<spec-no>-<short-name>` — **no branch without a spec.** Also for CHANGE-lane mini-specs.
- Refactors: `refactor/<spec-no>-<short-name>` (mini-spec with Changed behavior = none).
- Fixes: `fix/<report-id>-<short-name>` (bug fixes carry a report, not a spec number);
  incidents: `incident/<date>-<short-name>`; trivial changes: `trivial/<short-name>` (see below).
- Bootstrap: `chore/bootstrap` — the bootstrap output (`workflows/bootstrap.md`), merged like
  any branch.
- The default branch is `main` and it is protected: pull request required, `scripts/check` required,
  no direct pushes, no force push.

## Commits

- Conventional Commits, with a plan reference: `feat(leave): submit annual leave request [plan 0001/3]`.
  Review fixes name their fix round instead of the step:
  `fix(leave): empty page size [plan 0001/fix-2]` — the reviewer counts rounds from these
  (R-06 after round 3).
- **Subject and body are both English.**
- Agent commits follow the same standard: the agent writes the message, the human approves it
  through the gate before the commit, not one by one — an approved plan covers its
  `[plan NNNN/n]` and `[plan NNNN/fix-k]` commits, the ship approval the ship commit.
- Only `./scripts/check`'s own exit code gates a commit or a push. Never pipe its output into
  another command in the chain that decides it: in `./scripts/check | grep … && git commit` the
  chain takes grep's exit code, so a red check commits. Keep the output aside and gate on check
  alone: `./scripts/check > check.log 2>&1 && git commit …` (then show `check.log`).
- Commit named paths only: `git commit -- <paths>`, never `git add -A`, `git add .` or
  `commit -a`. Another session or tool may have written or staged files in the same tree.

## Forbidden

- Direct commits to the default branch.
- Force push, history rewriting on shared branches. Undo = `git revert` (see recovery R-11).

## Trivial changes

- Policy: **(1) PR + one reviewer, no spec.** Applies only to requests the change-request triage
  rubric (`workflows/change-request.md`) classifies as TRIVIAL: no acceptance criterion changes, no
  shared code.
- The reviewer is a read-only session or subagent — in a solo project that is the independent
  reviewer, not the author re-reading the diff.
- Always: one narrow commit, `scripts/check` green. A second file or a new test means re-triage.

## Pull requests

- PR template filled in: the purpose, a one-paragraph summary, and the spec/plan links. The gate
  records live in the plan file (`## Triage`, criterion ↔ test map) and in CI (`doctor`, `check`),
  so the PR does not repeat them.
- **Merge with a merge commit (GitHub's default), not a squash.** The branch history stays, and
  conflicts are resolved once on the branch instead of re-appearing at every squash.
- Solo project: **0 required approvals** (GitHub cannot approve your own PR); the independent review
  comes from a read-only reviewer session/subagent and is recorded in the PR. If a second developer
  joins, the rule becomes 1 required approval.

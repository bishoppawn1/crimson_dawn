# Crimson Dawn Agent Instructions

This file defines how coding agents should work in this repository. It should
contain operating rules, not game-design requirements. `spec.md` is the
authoritative source for player-facing behavior, balance, content, and product
direction.

## Start Every Task

- Read the user's full request, `spec.md`, and the relevant code and tests before
  making changes.
- Inspect `git status` before editing. Treat existing staged, unstaged, and
  untracked changes as user-owned unless the current task clearly created them.
- Preserve unrelated work. Do not discard, rewrite, stage, or commit another
  task's changes.
- Determine the root cause before implementing a fix. Avoid surface patches that
  leave the underlying behavior broken.
- Make reasonable, low-risk assumptions and proceed. Ask the user only when a
  missing decision would materially change the result or authorize broader work.

## Source of Truth

- Use `spec.md` for all game rules and intended player-facing behavior.
- Update `spec.md` whenever a completed implementation establishes, removes, or
  changes player-facing behavior.
- If the request conflicts with `spec.md`, follow the user's latest explicit
  direction and update `spec.md` to match.
- Record genuinely unresolved design decisions in `spec.md`; do not invent final
  lore, content, or balance to fill gaps silently.
- Keep detailed game rules out of `AGENTS.md`. Add them to `spec.md` instead.

## Implementation Standards

- Complete requested changes end to end when they are safely actionable. Do not
  stop after analysis or leave a known in-scope fix unfinished.
- Keep simulation, presentation, input, networking, and persistence concerns
  separated. Simulation behavior must remain deterministic and independently
  testable.
- Prefer data-driven definitions over repeated conditional logic for configurable
  content, costs, statistics, and effects.
- Reuse existing patterns and abstractions before introducing new ones. Keep the
  browser build dependency-light and runnable from a clean checkout.
- Do not grant one code path hidden exceptions merely to make a feature appear to
  work. Player, AI, replay, and multiplayer paths should share core rules wherever
  their intended behavior is the same.
- Add or update tests for every behavior change and regression fix. Favor focused,
  deterministic tests that prove the reported failure and the corrected behavior.
- Keep changes scoped. Avoid opportunistic refactors unless they are necessary for
  correctness or make the requested change substantially safer.
- Update comments and documentation when their claims become stale, but do not add
  comments that only restate obvious code.

## Repository Safety

- Use non-destructive Git operations. Never force-push, rewrite shared history, or
  run destructive cleanup commands unless the user explicitly requests them.
- Do not use `git reset --hard`, discard files, or overwrite broad paths to resolve
  a local conflict.
- When the worktree is dirty, isolate task work when practical and restore the
  user's exact staged and unstaged state after integration.
- Do not expose secrets, credentials, lobby tokens, private URLs, or local machine
  data in code, tests, logs, commits, or responses.
- Do not add dependencies or change deployment/configuration behavior without a
  concrete need for the requested task.

## Validation

Before committing every completed change, run all of the following from the
repository root:

1. `npm test`
2. `npm run check`
3. `git diff --check`

Also run any narrower tests useful during development. Do not push a knowingly
failing change. If a required check fails because of pre-existing or unrelated
work, verify that carefully and report the exact blocker.

For visual or interaction changes, exercise the affected browser flow when the
available environment supports it. Automated tests are still required for the
underlying behavior whenever practical.

## Commit and Push Workflow

- Every completed change must be committed and pushed to `origin/main` before
  handoff.
- Commit only files and hunks belonging to the current request. Never absorb
  unrelated workspace changes into the task commit.
- Write a concise imperative commit message that describes the completed outcome.
- Fetch current remote state before pushing. Integrate concurrent changes without
  force-pushing and rerun required validation after any rebase or conflict
  resolution.
- If the push is rejected, reconcile with `origin/main`, revalidate, and retry. If
  safe reconciliation is not possible, stop and report the blocker instead of
  risking another contributor's work.
- Confirm that the shared workspace ends on the pushed commit while preserving any
  pre-existing local changes.

## Communication and Handoff

- Give concise progress updates during longer tasks, especially after diagnosis,
  before lengthy validation, and when a blocker appears.
- Report concrete evidence rather than speculation: identify the cause, the files
  changed, and the validation performed.
- In the final handoff, lead with the outcome. Include the commit identifier,
  whether it was pushed, test/check results, and any remaining risk or blocker.
- Do not claim completion until implementation, documentation, validation, commit,
  and push are all complete.

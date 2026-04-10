# Antigravity Handoff

This document is the repo-local handoff for continuing `services/computer-use-mcp` work after the current verification hardening pass.

## Current branch state

- Branch: `codex/claude-inspired-toolsearch-design`
- Local-only commits already created before this handoff:
  - `68f68c39` `feat(computer-use-mcp): Cut 1 — structured verification evidence and handoff fulfillment`
  - `90f77b54` `feat(computer-use-mcp): Cut 2 — terminal hygiene: pagination detection and CWD heuristics`
  - `459ecee9` `refactor(computer-use-mcp): Cut 3 — strategy cleanup and anti-spam stabilization`

These commits are local. They were not pushed because the environment did not have working GitHub auth.

## What is actually landed locally

### Cut 1: Evidence + Handoff

Core files:

- `src/verification-evidence.ts`
- `src/server/verification-evidence-capture.ts`
- `src/server/handoff-fulfillment.ts`
- `src/lane-handoff-contract.ts`
- `src/server/register-tools.ts`
- `src/server/register-coding.ts`
- `src/server/action-executor.ts`
- `src/state.ts`

Tests:

- `src/server/action-executor.test.ts`
- `src/server/register-coding.test.ts`
- `src/server/verification-evidence-capture.test.ts`
- `src/server/handoff-fulfillment.test.ts`
- `src/server/integrated-tool-evidence.test.ts`

Important semantics:

- `coding_report_status` evidence is non-blocking.
- `verification-evidence.test.ts` was intentionally deleted because it only tested type shape and had no integration value.
- Handoff return evaluation must explicitly use `prior + current` evidence, not stale pre-capture state.

### Cut 2: Terminal Hygiene

Core files:

- `src/server/terminal-heuristics.ts`
- `src/server/register-pty.ts`

Tests:

- `src/server/terminal-heuristics.test.ts`

Important semantics:

- Pagination detection is observational only.
- CWD extraction is best-effort and prompt-based.
- Do not turn prompt parsing into hidden terminal mutation.

### Cut 3: Strategy Cleanup

Core files:

- `src/strategy.ts`
- `src/strategy.test.ts`

Important semantics:

- `click_likely_duplicate` is advisory only.
- Do not reintroduce a hard gate for duplicate click until the evidence model gets materially stronger.
- Recent fulfilled handoffs can count as a freshness signal for strategy, but only as a heuristic.

## Follow-up cleanup that must stay with these cuts

There are small but necessary compatibility/support files that were left out of the three cut commits and should be kept with this branch state:

- `src/server/formatters.ts`
- `src/server/workflow-formatter.test.ts`
- `src/workflows/surface-resolver.test.ts`
- `src/server/zero-issue-sync.test.ts`

Why they matter:

- `src/server/formatters.ts` adds `summarizeRunStateConcise`, which is used by the evidence capture layer.
- The two workflow-related tests need `handoffHistory` in base run state fixtures after `RunState` changed.
- `src/server/zero-issue-sync.test.ts` was updated to match current coding result shape.

## Validation commands

Run these before claiming the branch is stable:

```bash
pnpm -F @proj-airi/computer-use-mcp typecheck
pnpm -F @proj-airi/computer-use-mcp exec vitest run \
  src/server/action-executor.test.ts \
  src/server/register-coding.test.ts \
  src/server/verification-evidence-capture.test.ts \
  src/server/integrated-tool-evidence.test.ts \
  src/server/handoff-fulfillment.test.ts \
  src/server/terminal-heuristics.test.ts \
  src/strategy.test.ts
```

Optional focused lint for touched files:

```bash
pnpm -F @proj-airi/computer-use-mcp exec eslint \
  src/server/verification-evidence-capture.ts \
  src/server/verification-evidence-capture.test.ts \
  src/server/action-executor.ts \
  src/server/action-executor.test.ts \
  src/server/register-pty.ts \
  src/server/terminal-heuristics.ts \
  src/server/terminal-heuristics.test.ts \
  src/server/register-coding.ts \
  src/server/register-coding.test.ts \
  src/server/register-tools.ts \
  src/server/integrated-tool-evidence.test.ts \
  src/server/handoff-fulfillment.ts \
  src/server/handoff-fulfillment.test.ts \
  src/strategy.ts \
  src/strategy.test.ts \
  src/server/formatters.ts \
  src/server/workflow-formatter.test.ts \
  src/workflows/surface-resolver.test.ts \
  src/server/zero-issue-sync.test.ts
```

## Guardrails for future work

These are not suggestions. Treat them as constraints unless there is new evidence.

1. Do not start "Phase 8" style browser stabilization work on top of a dirty mixed tree.
2. Do not add new hard gates just because an advisory exists.
3. Do not use window title or app name alone as proof of success for a UI action.
4. Do not treat self-report as blocking verification evidence.
5. Do not add tests that only prove types can be instantiated when real handler/integration tests already exist.
6. Do not keep piling phase labels into summaries after implementation has moved into cleanup/review mode.

## Safe next steps

If continuing after this handoff, prefer this order:

1. Push the local branch once auth is available.
2. Open or prepare PR review around the four local commits.
3. Only after review of the current branch state, decide whether browser-side evidence needs a new iteration.
4. If browser work resumes, start with evidence capture and integration tests, not hard fail rules.

## Unsafe next steps

Do not do these first:

- Reintroduce duplicate-click hard blocking.
- Start DOM hash / staleness heuristics on top of this unreviewed branch.
- Add more lane contracts before current evidence/handoff behavior is reviewed.
- Hide terminal mutations inside hygiene heuristics.

## Files that should not be mixed into this line

Leave these alone unless the user explicitly wants them involved:

- `patches/@mediapipe__tasks-vision.patch`
- `patches/crossws@0.4.4.patch`
- `services/computer-use-mcp/Google antigravity活动.md`
- `services/computer-use-mcp/claude-code-heuristics.md`
- `uncommitted-cross-lane-verification.patch`


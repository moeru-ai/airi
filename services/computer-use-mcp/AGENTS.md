# computer-use-mcp Agent Notes

Scope: `services/computer-use-mcp/**`

## Mission

`computer-use-mcp` is Moeka's deterministic execution substrate.

- Moeka owns planning, chat UX, approval UX, provider integration, and MCP attachment.
- `computer-use-mcp` owns execution primitives, workflow orchestration, terminal/browser/desktop surfaces, trace, audit, and safety checks.
- Treat terminal, browser, editor, and desktop operations as one task system. Do not split them into disconnected demos.

## Agent Collaboration Policy

This policy is scoped to `services/computer-use-mcp/**`. Do not copy it into the
monorepo-level `AGENTS.md` as a global Moeka rule: other packages may not have
the same runtime risk profile, Spark agent setup, or review workflow.

Use `GPT-5.5 Controller + Spark / mini Read-only Worker Pool` as the default
shape for non-trivial work in this package.

- GPT-5.5 owns problem boundaries, conflicting evidence resolution, patch decisions, verification commands, and final judgment.
- Spark agents should be used more aggressively for read-only parallel work: code-path exploration, test-gap discovery, current-diff review, CI failure triage, and PR-split planning.
- If Spark is unavailable or quota-exhausted, use the GPT-5.4-mini read-only fallback workers for the same exploration, test-gap, and diff-review roles.
- Spark output must include concrete file paths and evidence. Treat unsupported Spark claims as guesses, not facts.
- Spark and mini workers are read-only by default. Do not let them write runtime, verification gate, coding runner, MCP permission-boundary, action-executor, or critical state-machine code unless the user explicitly asks for a writer agent.
- The main thread must re-check Spark findings against code/tests before editing. Test and runtime logs outrank every model conclusion.
- Keep `.codex/` agent configuration decisions separate from business-code PRs unless the PR is explicitly about contributor workflow.
- Treat GitHub Copilot as an external worker pool only: external review, candidate PRs, test-gap issues, and documentation cleanup. Do not trust or merge Copilot output without GPT-5.5 review.
- Prefer Copilot `gpt-5.4-mini` with high effort for routine external-worker tasks. Escalate hard Copilot-side reviews to `gpt-5.3-codex` with high effort.
- Use Copilot GPT-5 mini and GPT-4.1 aggressively for low-risk, high-frequency external work: broad file triage, repeated search, test-gap brainstorming, docs consistency checks, low-risk cleanup proposals, and extra diff-review opinions.
- Keep Copilot GPT-5 mini / GPT-4.1 in plan/review mode by default. They can propose patches or commands, but GPT-5.5 must verify against repository facts before any local edit is made.
- Treat Gemini CLI as a local external research/review worker only: large-context impact scanning, diff review, test-failure log analysis, Copilot PR third-party review, and documentation/instruction consistency checks.
- Let Gemini CLI choose its model unless there is a task-specific reason to pin one. Use Gemini while its daily quota is available; if it is exhausted, route the external-worker task to Copilot instead.
- Do not let Gemini CLI edit the same worktree concurrently with Codex. If Gemini needs to write candidate code, use a separate worktree and require GPT-5.5 review before adopting any patch.
- Keep Copilot governance files, `.codex/` configuration, GitHub labels, and business/runtime changes in separate commits or PRs.

## Current Status Snapshot

Updated for the current terminal-lane-v2 workstream.

The important truth is:

- `exec` is already a real mainline surface.
- `PTY` is no longer just a loose tool set; the workflow engine now has self-acquire support.
- Service-layer terminal E2Es for the current lane are present and treated as the terminal proof line.
- The Moeka chat terminal demo is now aligned with terminal lane v2 and no longer pre-creates PTY.
- The desktop shell now distinguishes `pty_session` from `terminal_and_apps`.
- Moeka chat self-acquire is now part of the strict release gate set, so PTY mainline support is no longer intentionally held back.

Do not rely on compressed chat summaries to resume this work. Use this file as the handoff source of truth and update it when terminal-lane behavior changes materially.

For terminal-lane facts, treat this file in alignment with:

- `README.md`
- `src/support-matrix.ts`
- `package.json` scripts
- implementation/tests for each referenced command or file

## Terminal Lane v2: What Is Already Landed

### 1. Terminal surface model exists

Terminal-capable workflow steps now have explicit terminal semantics instead of pure guesswork:

- `mode: 'exec' | 'auto' | 'pty'`
- `interaction: 'one_shot' | 'persistent'`

The main implementation lives in:

- `src/workflows/types.ts`
- `src/workflows/surface-resolver.ts`
- `src/terminal/interactive-patterns.ts`

### 2. Auto surface resolution is fixed to a small rule set

`auto` is intentionally narrow. It only upgrades to PTY when one of these is true:

1. The current `taskId + stepId` already has a bound PTY session.
2. The step explicitly declares `interaction: 'persistent'`.
3. The command matches `KNOWN_INTERACTIVE_COMMAND_PATTERNS`.
4. A failed/timed-out exec attempt surfaces one of `INTERACTIVE_OUTPUT_MARKERS`.

This rule set is covered by:

- `src/workflows/surface-resolver.test.ts`
- `src/terminal/interactive-patterns.test.ts`

### 3. Workflow engine can self-acquire PTY

The engine already contains the v2 shape:

- `AcquirePtyForStep`
- `StepTerminalProgress`
- suspension point `before_pty_acquire`
- PTY step family support:
  - `pty_send_input`
  - `pty_read_screen`
  - `pty_wait_for_output`
  - `pty_destroy_session`

The main implementation lives in:

- `src/workflows/engine.ts`

The intended behavior is:

- workflow resolves the terminal surface
- if PTY is needed, workflow acquires/binds PTY itself
- workflow continues inside the same workflow
- outward terminal reroute is now secondary, not the mainline proof

### 4. Service-layer PTY self-acquire E2E exists and is green

The current real terminal E2E for v2 is:

- `src/bin/e2e-terminal-self-acquire.ts`

This script now proves:

- **no pre-created PTY**
- workflow detects an interactive command
- engine self-acquires PTY
- command executes on PTY
- step succeeds without outward reroute
- run-state / binding / audit stay consistent

It currently uses:

- `workflow_validate_workspace`
- an interactive `checkCommand` of `vim --version`

This is the current service-level proof for terminal lane v2.

### 5. Moeka chat self-acquire demo

The chat-driven demo ran against the desktop app. That app is not part of this fork, so the demo
script and its package commands were removed. Use `e2e-terminal-self-acquire` for the same
workflow without the app UI.

### 6. Support matrix already reflects the new direction

Relevant entries in `src/support-matrix.ts`:

- `terminal_exec` → `product-supported`
- `terminal_pty` → `product-supported`
- `terminal_exec_to_pty_reroute` → `covered` and explicitly labeled legacy fallback
- `terminal_auto_surface_resolution` → `covered`
- `terminal_pty_self_acquire` → `product-supported`
- `terminal_pty_step_family` → `covered`

The current strict release gates are:

- `bun run --filter @proj-airi/computer-use-mcp e2e:developer-workflow`
- `bun run --filter @proj-airi/computer-use-mcp e2e:terminal-exec`
- `bun run --filter @proj-airi/computer-use-mcp e2e:terminal-pty`
- `bun run --filter @proj-airi/computer-use-mcp e2e:terminal-self-acquire`

## What Is Still Not Finished

These are the real gaps. Do not talk yourself into thinking terminal lane is fully shipped before they are closed.

### 1. Approval semantics need a web implementation

The desktop approval UI was removed with the desktop app. The scope model it introduced still
applies:

- `terminal_and_apps`
- `pty_session`

The intended behavior is:

- `terminal_exec` / `open_app` / `focus_app` keep session-scoped auto-approve behavior
- `pty_create` stores a `pty_session` grant scope
- `pty_create` does **not** auto-approve future PTY creation requests

The web app still needs an approval surface for these scopes.

## Where To Look First

If you are continuing terminal lane work, read these first:

1. `src/workflows/engine.ts`
2. `src/workflows/surface-resolver.ts`
3. `src/terminal/interactive-patterns.ts`
4. `src/bin/e2e-terminal-self-acquire.ts`
5. `src/support-matrix.ts`

That set is enough to reconstruct the current terminal-lane-v2 state without rereading the entire repo.

## Validation Commands

Use these as the baseline checks for terminal lane work:

### Service-level terminal lane

- `bun run --filter @proj-airi/computer-use-mcp e2e:terminal-exec`
- `bun run --filter @proj-airi/computer-use-mcp e2e:terminal-pty`
- `bun run --filter @proj-airi/computer-use-mcp e2e:terminal-self-acquire`
- `bun run --filter @proj-airi/computer-use-mcp e2e:airi-chat-terminal-self-acquire`

### Core test coverage

- `bun run --filter @proj-airi/computer-use-mcp exec vitest run --config ./vitest.config.ts`

### Typecheck

- `bun run --filter @proj-airi/computer-use-mcp typecheck`
- `bun run --filter @proj-airi/stage-ui typecheck`

If `bun run --filter @proj-airi/stage-web typecheck` behaves oddly in the current environment, inspect the
web app scripts in `apps/stage-web/package.json`.

## Handoff Rules

If you change terminal lane behavior, update this file before stopping.

At minimum, always rewrite these four facts:

1. Is PTY self-acquire the mainline, or does any path still depend on pre-created PTY?
2. Is Moeka chat E2E aligned with the service-level terminal lane, or still on an older path?
3. Is desktop approval using real `pty_session` semantics, or still old `terminal_and_apps` semantics?
4. Which terminal capabilities are `product-supported` vs only `covered` in `src/support-matrix.ts`?

If those four facts are stale, the next agent will lose time re-deriving context from code.

## Boundary Reminder

- Keep provider-specific behavior in Moeka / `packages/stage-ui/**`.
- Keep OS-executor and workflow orchestration logic here.
- Do not expand this workstream into browser, native click/type/press, or VS Code productization until terminal lane is actually closed.

## Agent Operating Guardrails

- Keep changes narrow and evidence-backed.
- Keep documentation/config changes separate from runtime logic changes.
- Do not touch desktop overlay, Electron bridge, Chrome extension, MCP handler registration, workspace memory, verification gate, or shell guard unless the task explicitly requires it.
- Keep planning, archive eligibility, compaction text, provider message emission, and runner semantics separate unless evidence requires a cross-layer change.
- Prefer pure helpers for shared contracts.
- Add regression tests for boundary behavior.
- Do not broaden refactors without evidence.
- Do not treat parser-level coverage as proof that projected provider messages are valid; add projector-level tests when the final message shape is the contract.

## Agent Report Checklist

- Exact files changed.
- Exact test command.
- Exit code.
- Relevant pass/fail output.
- Remaining risks and why they are out of scope.

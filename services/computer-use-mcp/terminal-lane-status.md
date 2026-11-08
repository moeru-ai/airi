# Terminal Lane Status

Scope: terminal lane work in `services/computer-use-mcp/**`.

## Executor discovery contract: 2026-11-08

MCP discovery includes the Terminal runner's configured Shell and platform before command preparation.
The local runner describes fresh Shell processes, default spawn directories, and relative cwd resolution.
`terminal_get_state` returns that contract with the current default directory without executing a command.
The tool name is an MCP method. It is not a command installed inside PowerShell.
The executor still accepts command text. Its syntax and effects require independent inspection.
Shell version is not probed or inferred from the executable name.
Approval still freezes argv and spawn cwd. Referenced scripts and their dependencies are not frozen.
These information changes grant no execution authority. Main approvals and GUI write restrictions remain unchanged.

## Windows Beta lifecycle: 2026-11-08

The bundled stdio service closes on input EOF, transport close, SIGINT and SIGTERM.
Shutdown stops Terminal admission and drains owned direct Shell processes.
The private prepared request passes protocol cancellation to the runner.
Cancellation after dispatch requests process termination. It does not reverse effects or prove zero dispatch.
Result readiness and direct Shell close remain separate. A timeout result does not release ownership.
Windows termination still covers the direct Shell only. Descendant cleanup remains unverified at this boundary.
The Main shared queue retains its existing unknown-result and descendant-risk protection.

Tests: `pnpm -F @proj-airi/computer-use-mcp exec vitest run src/server-lifecycle.test.ts src/terminal/runner-lifecycle.test.ts src/server/terminal-approval.test.ts`.
These controlled tests use mock processes and the real MCP protocol. They do not establish human production authorization.

## Terminal environment scope: 2026-11-07

Terminal responses retain the existing desktop `executionTarget` and `context` fields.
The `terminalBackend` field comes from the actual Terminal runner, independently of the desktop executor.
Desktop dry-run does not establish whether a Shell command executed.
Command results retain their actual exit code, timeout and possible side effects.

`backendResult.effectiveCwd` is the directory used for that command's spawn.
`terminalState.effectiveCwd` is the runner default for a later command.
Neither field tracks the current directory of an interactive Shell.
Controlled MCP and provider projection tests cover this information contract.
Native execution and business effects require their separate Host and Fixture evidence.

## Convergence authorization correction: 2026-11-05

The accepted integration baseline had three independent approval bypasses.
Agent-callable approval, workflow auto-approval/resume, and direct CDP mutations crossed the configured human-consent boundary.
Real MCP protocol tests reproduced them with mock executors before the correction.

- In `actions` and `all`, public pending-action approval now returns `denied`.
- Workflow automatic approval is derived from trusted `approvalMode=never`, rather than model arguments alone.
- A caller cannot claim approved workflow continuation while the server requires approval.
- Raw CDP evaluation, navigation, and optional delegated browser execution remain closed in those modes.
- Explicit `never` retains its broad operator-configured scope. The desktop executor does not sandbox shell commands.

Phase 5.1 adds an opt-in trusted Terminal approval adapter in Electron Main.
The adapter requires a Main-managed direct stdio connection and a registered Chat request.
A separate Main-created window presents the frozen command, shell arguments, executor identity and cwd source.
Only its actual main frame can return a decision. Model-facing approval remains denied.
Main consumes its existing PendingAction once inside the shared desktop execution queue.
The private executor protocol freezes spawn arguments before approval and waits for direct shell closure.

This slice has controlled tests and delegated UI operator evidence with a mock provider.
It does not establish real-model continuation or real-human production authorization.
Phase 5.2 verifies bounded cancellation and direct-process lifecycle cases with controlled barriers.
The final private dispatch boundary rechecks the MCP request signal and deadline.
Windows direct shell closure does not prove descendant termination. Terminal commands are not sandboxed.
B0-style notice delivery now uses the original Host request and existing Core FIFO and persistent message identity.
Controlled and delegated UI tests use a mock provider. Real-model acceptance remains a separate gate.
Native GUI writes remain closed.
The historical run-grant claims below do not establish current product support.
See `docs/ai/convergence/execution-authorization-boundary.md` from the repository root for evidence and remaining limits.

This file is the handoff record for terminal lane work. It moved here from `AGENTS.md` without content changes.

## Workflow result correction: 2026-11-06

Workflow exec steps now treat a reported nonzero exit code or timeout as failure.
The existing formatter forwards the exit code, timeout flag, and bounded error output in the step explanation.
The explanation preserves dispatch and possible side effects. Recovery requires inspecting the result before another decision.
Command exit zero does not verify an independent business outcome.

- PTY self-acquire routing and PTY completion semantics are unchanged.
- This correction uses controlled executor and provider boundaries. No new real AIRI Chat E2E ran.
- Public self-approval remains denied in approval modes. The Phase 5.1 adapter does not grant workflow auto-approval.
- Support-matrix labels are unchanged. Real GUI writes remain outside admission.

## Current Status Snapshot

Updated for the current terminal-lane-v2 workstream.

The important truth is:

- `exec` is already a real mainline surface.
- `PTY` is no longer just a loose tool set; the workflow engine now has self-acquire support.
- Service-layer terminal E2Es for the current lane are present and treated as the terminal proof line.
- The AIRI chat terminal demo is now aligned with terminal lane v2 and no longer pre-creates PTY.
- The desktop shell now distinguishes `pty_session` from `terminal_and_apps`.
- AIRI chat self-acquire is now part of the strict release gate set, so PTY mainline support is no longer intentionally held back.

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

### 5. AIRI chat self-acquire demo is now on the v2 path

`src/bin/e2e-airi-chat-terminal-self-acquire.ts` follows the same product story:

- no harness-side `pty_create`
- AIRI calls the real workflow
- the workflow self-acquires PTY for the interactive validation step
- AIRI finishes with a natural-language summary for demo use

The latest successful reports live under:

- `.computer-use-mcp/reports/airi-chat-terminal-self-acquire-*`

The current package commands are:

- `pnpm -F @proj-airi/computer-use-mcp e2e:airi-chat-terminal-self-acquire`
- `pnpm -F @proj-airi/computer-use-mcp demo:terminal-self-acquire`

### 6. Support matrix already reflects the new direction

Relevant entries in `src/support-matrix.ts`:

- `terminal_exec` → `product-supported`
- `terminal_pty` → `product-supported`
- `terminal_exec_to_pty_reroute` → `covered` and explicitly labeled legacy fallback
- `terminal_auto_surface_resolution` → `covered`
- `terminal_pty_self_acquire` → `product-supported`
- `terminal_pty_step_family` → `covered`

The current strict release gates are:

- `pnpm -F @proj-airi/computer-use-mcp e2e:developer-workflow`
- `pnpm -F @proj-airi/computer-use-mcp e2e:terminal-exec`
- `pnpm -F @proj-airi/computer-use-mcp e2e:terminal-pty`
- `pnpm -F @proj-airi/computer-use-mcp e2e:terminal-self-acquire`
- `pnpm -F @proj-airi/computer-use-mcp e2e:airi-chat-terminal-self-acquire`

## What Is Still Not Finished

These are the real gaps. Do not talk yourself into thinking terminal lane is fully shipped before they are closed.

### 1. Desktop approval semantics are improved, but still need one more explicit review

`apps/stage-tamagotchi/src/renderer/App.vue` now distinguishes:

- `terminal_and_apps`
- `pty_session`

and it no longer pretends a PTY approval is the same thing as a generic terminal/app grant.

The current intended behavior is:

- `terminal_exec` / `open_app` / `focus_app` keep the old session-scoped auto-approve behavior
- `pty_create` stores a `pty_session` grant scope
- `pty_create` does **not** auto-approve future PTY creation requests

This is much closer to the product model, but it is still worth reviewing whenever approval UX changes again.

## Where To Look First

If you are continuing terminal lane work, read these first:

1. `src/workflows/engine.ts`
2. `src/workflows/surface-resolver.ts`
3. `src/terminal/interactive-patterns.ts`
4. `src/bin/e2e-terminal-self-acquire.ts`
5. `src/bin/e2e-airi-chat-terminal-self-acquire.ts`
6. `src/support-matrix.ts`
7. `apps/stage-tamagotchi/src/renderer/App.vue`
8. `apps/stage-tamagotchi/src/renderer/modules/computer-use-approval.ts`

That set is enough to reconstruct the current terminal-lane-v2 state without rereading the entire repo.

## Validation Commands

Use these as the baseline checks for terminal lane work:

### Service-level terminal lane

- `pnpm -F @proj-airi/computer-use-mcp e2e:terminal-exec`
- `pnpm -F @proj-airi/computer-use-mcp e2e:terminal-pty`
- `pnpm -F @proj-airi/computer-use-mcp e2e:terminal-self-acquire`
- `pnpm -F @proj-airi/computer-use-mcp e2e:airi-chat-terminal-self-acquire`

### Core test coverage

- `pnpm -F @proj-airi/computer-use-mcp exec vitest run --config ./vitest.config.ts`

### Typecheck

- `pnpm -F @proj-airi/computer-use-mcp typecheck`
- `pnpm -F @proj-airi/stage-ui typecheck`

If `pnpm -F @proj-airi/stage-tamagotchi typecheck` behaves oddly in the current environment, run the two underlying commands directly:

- `pnpm -F @proj-airi/stage-tamagotchi run typecheck:node`
- `pnpm -F @proj-airi/stage-tamagotchi run typecheck:web`

## Handoff Rules

If you change terminal lane behavior, update this file before stopping.

At minimum, always rewrite these four facts:

1. Is PTY self-acquire the mainline, or does any path still depend on pre-created PTY?
2. Is AIRI chat E2E aligned with the service-level terminal lane, or still on an older path?
3. Is desktop approval using real `pty_session` semantics, or still old `terminal_and_apps` semantics?
4. Which terminal capabilities are `product-supported` vs only `covered` in `src/support-matrix.ts`?

If those four facts are stale, the next agent will lose time re-deriving context from code.

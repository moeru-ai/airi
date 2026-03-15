# computer-use-mcp Agent Notes

Scope: `services/computer-use-mcp/**`

## Mission

`computer-use-mcp` is AIRI's deterministic execution substrate.

- AIRI owns planning, chat UX, approval UX, provider integration, and MCP attachment.
- `computer-use-mcp` owns execution primitives, workflow orchestration, terminal/browser/desktop surfaces, trace, audit, and safety checks.
- Treat terminal, browser, editor, and desktop operations as one task system. Do not split them into disconnected demos.

## Current Status Snapshot

Updated for the current terminal-lane-v2 workstream.

The important truth is:

- `exec` is already a real mainline surface.
- `PTY` is no longer just a loose tool set; the workflow engine now has self-acquire support.
- The service-layer terminal E2Es are green.
- The AIRI chat terminal demo is now aligned with terminal lane v2 and no longer pre-creates PTY.
- The desktop shell now distinguishes `pty_session` from `terminal_and_apps`.
- AIRI chat self-acquire is now part of the strict release gate set, so PTY mainline support is no longer intentionally held back.

Do not rely on compressed chat summaries to resume this work. Use this file as the handoff source of truth and update it when terminal-lane behavior changes materially.

## Coding Surface v1.1: What Is Already Landed

`coding surface` is now a real capability layer inside `computer-use-mcp`, but it is **not** a second executor.

### Release posture

The current coding layer should be described honestly as:

- a **minimal but real** coding capability layer
- release-worthy for initial AIRI integration
- intentionally bounded in scope
- expected to keep evolving after launch

Do not describe the current coding layer as a Codex-equivalent system.
The correct framing for release notes and PRs is:

- the coding layer is now usable and testable
- the current release lands the minimum integrated kernel
- deeper planner / diagnosis / benchmark / dirty-world hardening remains follow-up work after launch

The current intended model is:

- coding tools own workspace review, file read/patch, search, context compression, and structured reporting
- terminal lane still owns command execution, PTY/exec surface choice, approval, and audit
- coding workflows must consume terminal state and command results instead of spawning a second command path

### 1. First-class coding tools exist

The current coding tools are:

- `coding_review_workspace`
- `coding_read_file`
- `coding_apply_patch`
- `coding_search_text`
- `coding_search_symbol`
- `coding_find_references`
- `coding_compress_context`
- `coding_report_status`

These are exposed both as MCP tools and as workflow action kinds. Do not fork them into separate "internal" and "external" implementations.

### 2. `workflow_coding_loop` is now search-assisted

`workflow_coding_loop` is no longer hard-wired to an explicit file-only path.

The current behavior is:

- `targetFile` may be omitted
- search hints (`searchQuery` and/or `targetSymbol`) may drive target discovery
- downstream `coding_read_file` / `coding_apply_patch` may consume `filePath: 'auto'`
- auto target resolution succeeds only when the latest search resolves to a single candidate
- ambiguous search results must fail explicitly instead of guessing a target file

This is intentionally still conservative: search helps resolve the target, but the workflow is not yet a fully autonomous multi-candidate planner.

### 3. Search path semantics are fixed to workspace-relative output

Search may run under a scoped `targetPath`, but returned file paths must remain **workspace-relative**.

This is important because:

- `coding_read_file`
- `coding_apply_patch`
- `coding_find_references`

all expect workspace-relative paths. Do not regress this by returning paths relative to a subdirectory search root.

### 4. TS/JS semantic navigation exists, but only as a v1.1 local capability

The current semantic navigation story is:

- `coding_search_text` works as general local text search
- `coding_search_symbol` and `coding_find_references` are local TypeScript-based capabilities
- the implementation is intentionally local to `computer-use-mcp`
- this is **not** a VS Code adapter, not an LSP bridge, and not a plugin platform

If you extend semantic navigation, keep the boundary clear:

- improve the local capability first
- do not drag VS Code, browser, GitHub, or provider-specific integration into this workstream

#### TODO: non-JS/TS semantic navigation roadmap (not in current release scope)

- Python: symbol definition + references via Python AST/indexing, deterministic unsupported fallback while incomplete.
- Rust: item/symbol navigation backed by rust-analyzer-compatible local indexing, deterministic unsupported fallback while incomplete.
- Go: package-aware symbol/references navigation with local module graph, deterministic unsupported fallback while incomplete.
- Other languages: only after Python/Rust/Go parity baseline; keep unsupported contract explicit and route users to `coding_search_text` until semantic support lands.

### 5. Current boundary reminder for coding work

Do:

- strengthen workspace review
- strengthen deterministic self-review/reporting
- improve local search/navigation
- improve patch/edit stability
- improve the coding loop while reusing terminal lane

Do not:

- invent another command executor
- bypass terminal state when summarizing validation
- turn coding surface into a generic plugin or MCP marketplace
- expand this lane into VS Code/browser/native adapter productization

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

## Boundary Reminder

- Keep provider-specific behavior in AIRI / `packages/stage-ui/**`.
- Keep OS-executor and workflow orchestration logic here.
- Do not expand this workstream into browser, native click/type/press, or VS Code productization until terminal lane is actually closed.

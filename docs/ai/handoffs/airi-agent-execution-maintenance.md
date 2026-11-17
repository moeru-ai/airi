# AIRI Agent Execution Maintenance Handoff

Status: active

This file tracks current AIRI Agent, Computer Use, Terminal approval, and execution-trace work for PR #3496. Stable decisions live in the [project memory](../references/agent-execution-memory.md).

## Current checkpoint

- Repository: `moeru-ai/airi`
- Pull request: [#3496](https://github.com/moeru-ai/airi/pull/3496)
- Local branch: `codex/feat/pr3496-current`
- Runtime validation checkpoint: `8f01472d05d87a8058205f3a4387f55f72447609`
- Current PR source head after mainline merge and MCP test fix: `433c656e674e22dbe8609de00b06d829541276be`
- Working tree was clean before this documentation update.
- GitHub API query on 2026-11-17 confirmed the merged PR base `27ff2f65bfb56b82540e2a12c06925ec02049efe`. The current head includes the MCP browser regression fix.
- Checks for the current head are in progress. The Godot build and Wayland render jobs are skipped by their workflow conditions.
- The local branch and PR source ref contain the maintenance documentation and contract separation changes.

The local SHA is a checkpoint, not proof of the current PR head. Query GitHub before any push or publication.

## Handoff lanes

| Lane | Owner | Status | Next work |
| --- | --- | --- | --- |
| Windows AUV runtime | Computer Use service and Electron Main | Integrated | Keep packaged runtime and approval tests current |
| Host approval and settlement | Electron Main | Integrated in source | Verify same-turn Agent continuation in a real-model run |
| Contract separation | Computer Use service and Core Agent | Implemented in source | Exercise all five records in a real-model trace |
| Agent behavior | Core Agent and Stage UI | Open | Run the complete DeepSeek Agent task and inspect every step |
| Compact continuity | Core Agent | Open for behavior acceptance | Verify that compaction preserves pending actions and prevents replay |
| PR publication | Main controller | Source ref updated | Read the current PR checks before further publication |

## Current implementation record

- Computer Use uses the real Windows AUV executor through `@auv-js/sdk` and an app-owned daemon. It is not configured as dry-run in the bundled Windows path.
- Commit `8f01472d0` fixes packaged AUV executable resolution when Electron clears `ELECTRON_RUN_AS_NODE` for the child process.
- The packaged runtime smoke returned real 2560x1440 PNG pixels, window metadata, and the AUV executor. The service lane record contains this evidence.
- AUV, Terminal, and PTY are direct tools in the bundled Agent catalog. Compact runs in Core Agent.
- Host approval owns Computer Use mutations. Terminal permission does not grant Computer Use authority.
- Action responses and session trace entries now separate `modelDecision`, `authorization`, `execution`, and `businessVerification`. Core Agent exposes a separate `ContextCompactionContract`.
- `computer_act` returns delivery evidence with a replay guard. `computer_verify` returns application-state evidence and can link it with `executionId`.
- A Beta package was rebuilt and installed for local experience. This does not prove that a real-model Agent task completed.
- DeepSeek-compatible API access returned HTTP 200 in a direct check. This does not prove that the Agent selected or completed a tool workflow.
- The most recent Computer Use suite record reports 749 passed and 1 skipped. Typecheck passed. These checks were not rerun during this documentation update.

## Open work

### 1. Complete a real-model Agent run

The isolated test profile did not complete its window and chat initialization. No full post-fix Agent round reached behavior acceptance.

Repair the test harness startup path. Then run a full Agent task through the bundled Windows app and the configured DeepSeek-compatible endpoint.

Record the user goal, model request, exposed tools, every tool call, Host decision, settlement result, fresh application observation, and final state. Keep API credentials out of logs and repository files.

Use a task that needs multiple observations and actions. The Slay the Spire 2 request is the target behavior scenario.

The Agent must inspect its actual AUV tools and game state. It must form a practical plan and act within approval policy. It must continue until it reaches a verified result or a concrete blocker.

### 2. Audit behavior from the complete trace

Review whether the Agent assesses its capability from the live tool catalog. Review whether it starts useful work without unnecessary refusal. Review whether it preserves progress across tool calls and compaction.

Track these design risks against observed behavior:

- An `executed` result can mean that AUV accepted input. The Agent needs a separate application-state verification before it reports task success.
- A lost response after dispatch leaves the outcome unknown. The execution layer must prevent replay until a fresh observation resolves the state.
- Direct tools and on-demand MCP discovery create two tool routes. Verify that the Agent selects the right route without repeated discovery calls.
- Read-only observation and state-changing input share Host attribution rules. Verify that approval policy does not block safe observation.
- Task memory is session-local. Verify that Compact retains the goal, verified facts, pending work, and blockers.
- No unified step or time budget is recorded here. Inspect actual loop limits before treating this as a defect.
- The contract types have focused unit coverage. Real-model behavior still must prove that the Agent reads each field and does not treat delivery as business success.

Do not turn these risks into code changes until the real-model trace reproduces them. Add one focused regression for each confirmed behavior defect.

### 3. Recheck publication state

The runtime code checkpoint passed PR checks before the handoff updates. The handoff and route now sit on the PR source ref. Read their CI status live before further publication.

## Validation record

Previous-run record from the active task handoff:

- Computer Use suite: 749 passed and 1 skipped. The command line was not captured.
- Computer Use typecheck: passed. The command line was not captured.

The runtime smoke evidence is in [`terminal-lane-status.md`](../../../services/computer-use-mcp/terminal-lane-status.md). The complete real-model Agent run remains open. Do not treat API HTTP 200, an MCP handshake, unit tests, or a screenshot as Agent behavior acceptance.

## Resume protocol

1. Read the [project memory](../references/agent-execution-memory.md), this handoff, the root `AGENTS.md`, and `services/computer-use-mcp/AGENTS.md`.
2. Run `git status --short --branch`, `git worktree list`, and `git log -4 --oneline`.
3. Query the live PR head and checks before a commit intended for publication.
4. Repair the test harness initialization before judging model behavior.
5. Run the complete Agent task through the actual bundled AUV runtime.
6. Update this handoff with exact commands, results, evidence links, and remaining work.

Never infer completion from a clean tree, a zero exit code, a successful API request, or an input-delivery receipt.

## Change log

### 2026-11-16

- Replaced stale status that described the bundled Windows Computer Use path as dry-run.
- Recorded the packaged AUV executable fix and the verified runtime smoke boundary.
- Separated stable project memory from the active task checkpoint.
- Kept the real-model Agent run open because its isolated profile did not finish initialization.
- Verified the live PR head and completed checks through the GitHub REST API.
- Published the handoff and project memory to the PR source ref with lease protection.

### 2026-11-17

- Added separate model-decision, authorization, execution, business-verification, and context-compaction contracts.
- Persisted the four action contracts in Computer Use MCP responses and session trace entries.
- Added `computer_verify.executionId` linking without merging verification into execution.
- Added structured compaction state with retained tool-call ids and explicit preservation flags.

Validation for this contract slice:

- Computer Use package: 61 test files, 756 passed, 1 skipped.
- Core Agent package: 43 test files, 508 passed.
- Electron MCP exposure tests: 35 passed.
- Stage UI MCP prompt test: 14 passed.
- Computer Use, Core Agent, Stage UI, and Electron typechecks passed.
- Full lint: 0 errors and 695 existing warnings.
- The full Stage UI suite remains environment-blocked. Its Node tests lack `localStorage`, and one browser VAD test lacks its Worker event. The focused MCP test passed.
- The PR source ref was rebased by merging upstream mainline before the contract changes were pushed. The current head includes the switch-selector regression fix.

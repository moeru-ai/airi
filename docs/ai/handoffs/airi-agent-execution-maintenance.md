# AIRI Agent Execution Maintenance Handoff

Status: active and maintained

This file is the project-level handoff for the AIRI Agent, Computer Use, Terminal approval, and execution-trace work for PR #3496. Update it when a boundary, owner, validation command, or publication target changes.

## Current checkpoint

- Pull request: [moeru-ai/airi#3496](https://github.com/moeru-ai/airi/pull/3496)
- PR head observed on 2026-11-16: `12f29ba28ded65938330a5df730702b9df731a55`
- Base observed: `62a01b287`
- Runtime integration checkpoint: `9947d7508`
- Working branch: `codex/feat/pr3496-current`
- The PR source branch is `3361559784/feat/computer-use-mcp-terminal-and-compact`.
- The PR source repository is `moeru-ai/airi`. The publication worktree's `origin` points to `3361559784/airi`, so verify the PR API before publishing.
- The publication worktree was clean when this checkpoint was written. Verify it before every edit, commit, and push.

The exact local worktree path is intentionally kept out of this repository. Find it from the active Codex workspace or `git worktree list`.

## Product contract

1. With Turbo disabled, every Computer Use mutation enters the AIRI-owned approval flow.
2. With Turbo enabled, the current Chat or Agent session can continue through approved mutations without one dialog per action. Turbo remains Host-authorized and session-scoped.
3. Computer Use has its own Host control credential. It never depends on Terminal being enabled or on Terminal Turbo being available.
4. Chat mode and Agent mode use the same Main-owned action, approval, settlement, and trace path.
5. Browser DOM writes, desktop input, Terminal actions, and workflow actions remain visible in one execution trace. A returned exit code does not prove the requested business outcome.
6. Computer Use approval returns settlement through the original pending MCP call. The same Chat or Agent turn continues without another user message or replay. Use `notifyConversation` only after the original call has ended.
7. Reuse AIRI's existing approval window manager, request queue, action manager, and IPC contracts. Do not add a parallel bridge or a second approval state machine.
8. Do not emit a boilerplate exit-status and business-result reminder. Let the Agent inspect application state and report the evidence it observed.

## Handoff lanes

| Lane | Owner | Responsibility | State |
| --- | --- | --- | --- |
| Boundary and nonce | Main controller | Split Computer Use Host control from Terminal control and preserve Host attribution | Done in working tree |
| Browser actions | `browser-actions` worker | Route Browser DOM writes through the existing action preparation, approval, execution, and settlement path | Done in working tree |
| Agent continuation | `agent-trace-review` worker | Confirm settlement wake, trace polling, and no-replay behavior for the original Agent request | Open |
| Approval reuse | `approval-boundary-review` worker | Keep one AIRI approval surface with stable reuse and a serialized pending-request queue | Window identity fixed. Queue follow-up remains |
| Verification and publication | Main controller | Run focused tests, typechecks, lint, diff/privacy review, then replace the PR source ref with lease protection | Open |

Workers are read-only unless the main controller explicitly assigns a writer slice. Every worker result must name concrete files, tests, and unresolved risks. Verify worker findings against the current source before editing.

## Known gaps at this checkpoint

- Computer Use now has independent Host control constants and environment wiring. The bundled server enables both lanes, while external servers opt into each lane separately.
- The Computer Use Turbo state and event names still use Terminal-specific names. Rename only the shared execution concept that must be public. Keep Terminal commit protocol names local to Terminal.
- Browser DOM mutation tools now build `ActionInvocation` values and use `executeAction`. They enter the shared policy, pending action, approval, trace, and settlement path. The Main approval flow holds the original MCP call open until settlement, so the Agent continues in the same turn.
- The packaged Computer Use server still uses `COMPUTER_USE_EXECUTOR=dry-run` and disables its Browser DOM bridge. It cannot control a native game or browser page. Keep this explicit until AIRI connects a real Windows execution adapter.
- Generic confirmation views now use a stable window-manager identity while retaining unique action IDs. Presentations still need explicit serialized queue behavior for concurrent prompts.

## Change order

1. Inspect the current PR head and all nested `AGENTS.md` files before editing.
2. Add independent Computer Use control constants and environment wiring. Keep Terminal nonce and Terminal metadata limited to `terminal_exec`. **Done in working tree.**
3. Extend the existing `ActionKind`, invocation preparation, policy, execution switch, pending action record, and settlement record for Browser DOM writes. Use the existing browser bridge as the executor. **Done in working tree.**
4. Route DOM writes through the same `approval_required` response used by desktop actions. Host approval must be the only approval authority. **Done in working tree.**
5. Make the approval presentation reuse a stable AIRI window and serialize pending prompts through the existing manager. Preserve action IDs for action identity, but do not use them as window-instance identity. **Window identity done. Queue remains.**
6. Verify that Host approval resolves the original MCP call and that the Agent reads its result before continuing. Use `notifyConversation` only for a detached call. **Verification remains open.**
7. Remove or rewrite the fixed exit-code wording in the English source locale only. Do not edit Crowdin-managed locales unless the task explicitly requires it.
8. Add focused regression tests before broad checks. Update this handoff with the exact command and result after each gate.

## File map

- Shared event contracts: `apps/stage-tamagotchi/src/shared/eventa/terminal-approval.ts`
- Main MCP routing: `apps/stage-tamagotchi/src/main/services/airi/mcp-servers/index.ts`
- Chat request and Turbo ownership: `apps/stage-tamagotchi/src/main/services/airi/computer-use/requests.ts`
- Main action lifecycle: `apps/stage-tamagotchi/src/main/services/airi/computer-use/action-manager.ts`
- Approval window: `apps/stage-tamagotchi/src/main/windows/terminal-approval/index.ts`
- Computer Use action contract and policy: `services/computer-use-mcp/src/types.ts`, `services/computer-use-mcp/src/policy.ts`
- Computer Use tool registration: `services/computer-use-mcp/src/server/register-tools.ts`
- Computer Use approval protocol: `services/computer-use-mcp/src/server/terminal-approval.ts`, `services/computer-use-mcp/src/server/responses.ts`
- Agent trace and settlement: `services/computer-use-mcp/src/workflows/engine.ts` and the existing Main settlement/notice modules
- Existing lane handoff source: `services/computer-use-mcp/terminal-lane-status.md`
- Shared Agent execution prompt: `packages/stage-ui/src/tools/mcp.ts`
- Shared MCP prompt registration: `apps/stage-tamagotchi/src/renderer/stores/tools/mcp.ts`

## Validation gates

Run the smallest relevant gate after each slice, then run the complete set on the final commit.

```powershell
pnpm -F @proj-airi/computer-use-mcp exec vitest run src/server/register-tools-pty-approval.test.ts src/server/terminal-approval.test.ts
pnpm -F @proj-airi/computer-use-mcp typecheck
pnpm -F @proj-airi/stage-ui typecheck
pnpm -F @proj-airi/stage-tamagotchi run typecheck:node
pnpm -F @proj-airi/stage-tamagotchi run typecheck:web
pnpm lint
```

The final evidence must include tests for:

- Computer Use approval without Terminal environment variables.
- Turbo off approval and Turbo on continuous execution.
- Turbo revocation cancelling queued work without replay.
- Each Browser DOM write returning `approval_required` in the normal mode.
- Browser DOM settlement appearing in the same execution trace as desktop and Terminal actions.
- Stable approval-window reuse and serialized prompts.
- Agent continuation after settlement with no duplicate execution.
- Independent business-result verification after a successful command.

## Publication protocol

Before publication:

1. Verify PR #3496 head owner, source repository, source ref, base ref, and current SHA.
2. Inspect `git diff --check`, the complete diff, tracked assets, and the commit for private data.
3. Verify the target remote and ref with `git remote -v` and `git ls-remote`.
4. Commit the reviewed change with a Conventional Commit message and an `Assisted-by:` trailer when applicable.
5. Replace the PR source ref with `--force-with-lease`, never an unprotected force push.
6. Verify the remote SHA and the PR head after the push.

Expected publication shape:

```powershell
git push --force-with-lease origin HEAD:3361559784/feat/computer-use-mcp-terminal-and-compact
git ls-remote origin refs/heads/3361559784/feat/computer-use-mcp-terminal-and-compact
gh pr view 3496 -R moeru-ai/airi --json headRefName,headRefOid,baseRefName,state
```

Do not claim the PR is replaced until the final remote SHA matches the reviewed commit.

## Resume protocol

The next agent must:

1. Read this file, the root `AGENTS.md`, and the nested notes for every package it will change.
2. Run `git status --short --branch`, `git worktree list`, and `git log -4 --oneline`.
3. Verify the live PR head. The checkpoint SHA in this file is historical evidence, not authority.
4. Read the relevant source and tests before applying a worker suggestion.
5. Update the lane table, known gaps, validation results, and change log before handing work onward.

Never infer completion from a clean worktree, a zero exit code, or a successful MCP handshake. Record the behavior-level evidence that proves the requested outcome.

## Change log

### 2026-11-16

- Created the project-level multi-handoff for PR #3496 replacement and ongoing AIRI Agent execution maintenance.
- Recorded the independent Computer Use nonce gap, Browser DOM approval gap, approval-window reuse gap, and Agent settlement wake requirement.
- Added the shared Agent execution prompt to MCP registration so Chat, background recipes, and Agent runs receive the same observe, act, approval, and verification contract.
- Added Browser DOM mutation action kinds and routed click, input, checkbox, select, and event writes through `executeAction`.
- Added independent Computer Use Host nonce constants and wiring. Terminal Turbo remains the session approval grant, but Computer Use no longer reuses the Terminal nonce.
- Reused a stable approval-window manager identity for generic confirmation prompts.
- Added focused policy, action-executor, registration, MCP manager, and background-task regression coverage. Current validation is recorded in the active task log. Publication remains pending.
- Validation passed: Computer Use typecheck, Stage UI and Stage Tamagotchi typechecks, Computer Use action and approval tests, MCP Main routing tests, background-task browser tests, i18n check, and full lint with existing warnings only.
- PR source ref was replaced through the GitHub refs API after verifying the previous head `12f29ba28ded65938330a5df730702b9df731a55`. Verify the live head through the PR API before resuming.

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
- The source repository is the `origin` remote for the publication worktree. The `upstream` remote is `https://github.com/moeru-ai/airi.git`.
- The publication worktree was clean when this checkpoint was written. Verify it before every edit, commit, and push.

The exact local worktree path is intentionally kept out of this repository. Find it from the active Codex workspace or `git worktree list`.

## Product contract

1. With Turbo disabled, every Computer Use mutation enters the AIRI-owned approval flow.
2. With Turbo enabled, the current Chat or Agent session can continue through approved mutations without one dialog per action. Turbo remains Host-authorized and session-scoped.
3. Computer Use has its own Host control credential. It never depends on Terminal being enabled or on Terminal Turbo being available.
4. Chat mode and Agent mode use the same Main-owned action, approval, settlement, and trace path.
5. Browser DOM writes, desktop input, Terminal actions, and workflow actions remain visible in one execution trace. A returned exit code does not prove the requested business outcome.
6. A settlement wakes the original Agent task through the existing conversation notification path. The task must not require a second user message and must not replay an already dispatched effect.
7. Reuse AIRI's existing approval window manager, request queue, action manager, and IPC contracts. Do not add a parallel bridge or a second approval state machine.
8. Do not emit the fixed sentence `命令以退出码 0 结束。业务目标仍需独立验证。` in product output. Keep independent result verification as behavior and evidence.

## Handoff lanes

| Lane | Owner | Responsibility | State |
| --- | --- | --- | --- |
| Boundary and nonce | Main controller | Split Computer Use Host control from Terminal control and preserve Host attribution | Open |
| Browser actions | `browser-actions` worker | Route Browser DOM writes through the existing action preparation, approval, execution, and settlement path | Open |
| Agent continuation | `agent-trace-review` worker | Confirm settlement wake, trace polling, and no-replay behavior for the original Agent request | Open |
| Approval reuse | `approval-boundary-review` worker | Keep one AIRI approval surface with stable reuse and a serialized pending-request queue | Open |
| Verification and publication | Main controller | Run focused tests, typechecks, lint, diff/privacy review, then replace the PR source ref with lease protection | Open |

Workers are read-only unless the main controller explicitly assigns a writer slice. Every worker result must name concrete files, tests, and unresolved risks. Verify worker findings against the current source before editing.

## Known gaps at this checkpoint

- `apps/stage-tamagotchi/src/main/services/airi/mcp-servers/index.ts` assigns `computerUseNonce = terminalNonce`. This makes Computer Use availability depend on Terminal control setup.
- The Computer Use Turbo state and event names still use Terminal-specific names. Rename only the shared execution concept that must be public. Keep Terminal commit protocol names local to Terminal.
- Browser DOM mutation tools in `services/computer-use-mcp/src/server/register-tools.ts` call the browser bridge directly. They do not yet create a pending action or enter the Host approval and settlement path.
- `apps/stage-tamagotchi/src/main/windows/terminal-approval/index.ts` creates a fresh UUID for generic confirmation views. The existing AIRI window manager is reused, but the approval presentation is not yet a stable single-window queue.
- The B0-style settlement wake path exists in the local AUV work and must be ported as a minimal slice. It must notify the original conversation and then let the next Agent turn read the actual execution trace.

## Change order

1. Inspect the current PR head and all nested `AGENTS.md` files before editing.
2. Add independent Computer Use control constants and environment wiring. Keep Terminal nonce and Terminal metadata limited to `terminal_exec`.
3. Extend the existing `ActionKind`, invocation preparation, policy, execution switch, pending action record, and settlement record for Browser DOM writes. Use the existing browser bridge as the executor.
4. Route DOM writes through the same `approval_required` response used by desktop actions. Host approval must be the only approval authority.
5. Make the approval presentation reuse a stable AIRI window and serialize pending prompts through the existing manager. Preserve action IDs for action identity, but do not use them as window-instance identity.
6. Port settlement wake and trace polling through the existing `notifyConversation` and Guard Approval Cards path. Add an idempotency check before notifying or continuing.
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
- No runtime code was changed by this documentation checkpoint.

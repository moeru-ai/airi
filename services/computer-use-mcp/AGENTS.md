# computer-use-mcp Agent Notes

Scope: `services/computer-use-mcp/**`

## Mission

`computer-use-mcp` is AIRI's deterministic execution substrate.

- AIRI owns planning, chat UX, approval UX, provider integration, and MCP attachment.
- `computer-use-mcp` owns execution primitives, workflow orchestration, terminal/browser/desktop surfaces, trace, audit, and safety checks.
- Treat terminal, browser, editor, and desktop operations as one task system. Do not split them into disconnected demos.

## Agent Collaboration Policy

This policy is scoped to `services/computer-use-mcp/**`. Do not copy it into the
monorepo-level `AGENTS.md` as a global AIRI rule: other packages may not have
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

## Terminal Lane Handoff

- Read [`terminal-lane-status.md`](terminal-lane-status.md) before you continue terminal lane work.
- If you change terminal lane behavior, update that file in the same change.

## Boundary Reminder

- Keep provider-specific behavior in AIRI / `packages/stage-ui/**`.
- Keep OS-executor and workflow orchestration logic here.
- Do not expand this workstream into browser, native click/type/press, or VS Code productization until terminal lane is actually closed.

## Agent Operating Guardrails

- Keep changes narrow and evidence-backed.
- Keep agent configuration changes separate from runtime logic changes. Update the documentation that describes the changed code, such as `terminal-lane-status.md`, in the same change.
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

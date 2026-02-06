---
name: minecraft-debug-mcp
description: Operate and debug the live Minecraft bot through its built-in MCP REPL server. Use when work requires starting the bot with `pnpm dev`, connecting to the local MCP endpoint, inspecting cognitive state/logs/history, injecting synthetic chat/events, or running targeted REPL code against the running brain during investigation and development.
---

# Minecraft Debug MCP

## Overview

Use this skill to run the local bot and interact with its MCP debug interface safely and quickly.

## Quick Start Workflow

1. Run `pnpm dev` from `/Users/rinshinohara/Repo/airi/services/minecraft` and keep it running.
2. Wait for `MCP REPL server running at http://localhost:3001` in logs.
3. Connect MCP client to `http://localhost:3001/sse`.
4. Verify readiness with a read-only call:
   - Read resource `brain://state`, or
   - Call tool `get_state`.
5. Continue with the smallest tool/action that answers the task.

## Execution Rules

- Start read-only, then escalate to mutation tools only when needed.
- Prefer `get_state`, `get_last_prompt`, and `get_logs` for diagnostics before `execute_repl`.
- Prefer `get_llm_trace` for structured per-attempt reasoning/content inspection.
- Keep `execute_repl` snippets minimal and reversible.
- Use `inject_chat` for conversational simulation and `inject_event` only when specific event-shape testing is required.
- Treat `inject_chat` as side-effectful: it can trigger actual in-game bot replies/actions.
- If MCP connection fails, check that `pnpm dev` is still running and port `3001` is free.

## Tooling Strategy

- Use `get_state` to inspect queue/processing state.
- Use `get_logs` with a small `limit` first.
- Use `get_last_prompt` to inspect latest LLM input.
- Use `execute_repl` for deep object inspection or one-off targeted calls on the running brain.
- Use `inject_chat` to simulate player chat and verify behavior loop.
- Use `get_llm_trace` to assert planner behavior in automation (for example, detect repeated `await skip()` on specific events).

Read `references/mcp-surface.md` for exact tool/resource names and argument schemas.

## Live-Tested Notes

- `get_state` returns a large variable snapshot; prefer it over REPL for first-pass health checks.
- `get_last_prompt` can return very large payloads; call only when prompt-level debugging is needed.
- `execute_repl` returns a structured result where `returnValue` is stringified; parse mentally as display output, not typed JSON.
- `get_logs(limit=10)` is enough to verify whether an injected event reached planner/executor.
- `get_llm_trace(limit, turnId?)` gives structured attempt-level trace data (messages, content, reasoning, usage, duration).
- `get_last_prompt` and `get_llm_trace` are compacted for MCP: system prompt/system-role messages are omitted to reduce token cost.
- If environment summary shows `"SOMETHING WENT WRONG, YOU SHOULD NOTIFY THE USER OF THIS"`, treat it as degraded runtime context and avoid high-confidence world actions.

## Live Testing Workflow

1. Confirm MCP health:
   - Call `get_state`.
2. Capture baseline inventory:
   - `execute_repl` with `query.inventory().list().map(i => ({ name: i.name, count: i.count }))`.
3. Trigger a task through normal cognition path:
   - Call `inject_chat` with a clear instruction (example: "please gather 3 dirt blocks").
4. Verify execution trace:
   - Call `get_logs(limit=10)` and check for:
     - bot acknowledgement chat
     - action tool feedback (for example `collectBlocks`)
     - planner result summary
   - Call `get_llm_trace(limit=5)` when you need exact model output/reasoning for assertions.
5. Re-check inventory using the same REPL snippet and compare against baseline.

Use this workflow when validating behavior changes, tool wiring, or regressions in planning/execution loops.

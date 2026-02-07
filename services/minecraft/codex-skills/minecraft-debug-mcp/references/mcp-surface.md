# Minecraft Debug MCP Surface

Implementation source: `/Users/rinshinohara/Repo/airi/services/minecraft/src/debug/mcp-repl-server.ts`.

## Endpoint

- Base server: `http://localhost:3001`
- MCP endpoint: `http://localhost:3001/sse`
- SSE fallback endpoint: `GET /sse` + `POST /messages`

The bot starts this server during normal runtime from:
- `/Users/rinshinohara/Repo/airi/services/minecraft/src/cognitive/index.ts`

## Resources

- `brain://state`
  - Summary state: processing, queue length, turn, give-up timer.
- `brain://context`
  - Current context view text.
- `brain://history`
  - Conversation history JSON.
- `brain://logs`
  - Latest LLM log entries JSON (last 50 in resource output).

## Tools

- `get_state()`
  - Returns current REPL/brain state JSON.

- `get_last_prompt()`
  - Returns latest LLM input JSON.
  - Returns error when no prompt exists yet.
  - Compacted payload: omits `systemPrompt` and drops `messages` items with `role: "system"`.

- `get_logs(limit?: number)`
  - Returns recent LLM logs; start with small limits.

- `get_llm_trace(limit?: number, turnId?: number)`
  - Returns structured LLM trace entries captured per attempt.
  - Includes: turn/source metadata, messages, generated content, reasoning (if available), token usage, and duration.
  - Use `turnId` to isolate trace for one injected test event.
  - Compacted payload: drops `messages` items with `role: "system"` to save tokens.

- `execute_repl(code: string)`
  - Executes debug REPL code in running brain context.
  - Use for focused inspection/action only.
  - Runtime global includes `forget_conversation()` for conversation-memory reset.

- `inject_chat(username: string, message: string)`
  - Injects a synthetic chat perception event.

- `inject_event(type, payload, source)`
  - `type`: `perception | feedback | world_update | system_alert`
  - `source.type`: `minecraft | airi | system`
  - `source.id`: string
  - Use only with deliberate, test-specific payloads.

## Troubleshooting

- Connection refused:
  - Ensure `pnpm dev` is running in the service directory.
  - Confirm logs include `MCP REPL server running at http://localhost:3001`.
- 404/invalid endpoint:
  - Use `/sse` as MCP entrypoint.
- Empty prompt/logs:
  - Trigger activity first (for example via `inject_chat`) and retry `get_last_prompt` or `get_logs`.

## Live-Tested Behavior Notes

- `inject_chat` is not a passive write: it enters the normal cognition pipeline and can cause the bot to send chat/actions.
- `get_last_prompt` may be very large (full system prompt + history); avoid repeated calls unless needed.
- `get_last_prompt` is now MCP-compacted (no raw system prompt text), which makes it cheaper for automation checks.
- `execute_repl` response includes metadata (`source`, `durationMs`, `actions`, `logs`) and a stringified `returnValue`.
- Query runtime now has LLM-friendly shortcuts for deterministic reads:
  - `query.self()`
  - `query.inventory().count(name)`
  - `query.inventory().has(name, atLeast?)`
  - `query.inventory().summary()`
  - `query.snapshot(range?)`
- Log verification pattern that worked reliably:
  1. `inject_chat(...)`
  2. `get_logs(limit: 10)`
  3. Confirm sequence: `turn_input` -> `llm_attempt` -> `feedback` -> `repl_result`

## Repeatable Smoke Test Recipe

Use this exact sequence for fast live validation:

1. Baseline
   - `get_state()`
   - `execute_repl("query.inventory().list().map(i => ({ name: i.name, count: i.count }))")`
   - Optional clean slate:
     - `execute_repl("forget_conversation()")`
2. Task trigger
   - `inject_chat({ username: \"codex-live-test\", message: \"please gather 3 dirt blocks\" })`
3. Execution proof
   - `get_logs({ limit: 10 })`
   - Expect acknowledgement chat + `collectBlocks` success feedback + REPL summary.
   - `get_llm_trace({ limit: 5 })`
   - Assert expected LLM behavior (for example response code, or repeated `await skip()`).
   - Assert trace payload does not include `role: "system"` entries.
4. Outcome proof
   - Run the same inventory `execute_repl` call again and compare item counts.

## Prompt-Behavior Check (Value-First)

To validate read->action behavior:
1. Inject a query-style chat (for example inventory question).
2. Confirm first REPL result is no-action with concrete return value (via `get_logs`/`get_llm_trace`).
3. Confirm follow-up turn uses that returned value to perform chat/action.

## Runtime Caveat

- The degraded environment sentinel can appear only when context has not been refreshed yet.
- With the current fix, `inject_chat` refreshes reflex context first, so this should not appear in normal MCP chat-injection tests.

# AIRI Coding CLI + Chafa Architecture

## Purpose

Define a narrow architecture for a terminal-facing AIRI coding CLI that can
optionally render an animated avatar through `chafa`, without coupling terminal
presentation to the `computer-use-mcp` runtime.

This document is a boundary and contract proposal. It is not an implementation
plan for a full CLI in this PR.

## Current Status

As of 2026-04-26, the main branch does not expose a stable coding runner event
stream. A CLI that renders real progress needs a runner contract first. Starting
with terminal animation before that contract exists would produce presentation
without reliable runtime state.

The correct dependency order is:

1. Define a coding runner event contract.
2. Emit deterministic runner events from the coding runner.
3. Build a text-first CLI that consumes those events.
4. Add optional `chafa` avatar rendering as a display adapter.

## Confirmed Decisions

1. Future CLI package location: `packages/airi-cli`.
2. First integration channel: in-process runner callback.
3. JSONL over stdin/file remains a follow-up adapter for replay, fixtures, and
   tooling interoperability.
4. `chafa` is optional presentation only.

## Hard Boundaries

1. No `chafa` dependency belongs in `services/computer-use-mcp` core runtime.
2. `computer-use-mcp` must remain headless-safe and CI-safe.
3. The CLI consumes runner events; it must not own planning, tool execution, or
   runtime policy.
4. Missing `chafa` must degrade to plain text rendering.
5. Non-TTY output must support plain text or JSONL output.
6. CLI rendering changes must not be mixed with coding memory or runner runtime
   refactors.

## Proposed Location Split

- Core runtime: `services/computer-use-mcp`.
- CLI package: `packages/airi-cli`.
- Event contract: initially colocated with the runner that emits it, then
  exported for CLI consumption.
- Text renderer: `packages/airi-cli/src/renderers/text.ts`.
- Chafa adapter: `packages/airi-cli/src/renderers/chafa-avatar.ts`.
- JSONL adapter: `packages/airi-cli/src/adapters/jsonl.ts`.

## Runner Event Contract Draft

Use an append-only event envelope. The first transport should be an in-process
callback. JSONL is an adapter over the same envelope.

```ts
interface RunnerEventEnvelope<TKind extends string = string, TPayload = unknown> {
  runId: string
  seq: number
  at: string
  kind: TKind
  payload: TPayload
}
```

Contract rules:

- `seq` is strictly increasing per `runId`.
- `at` is an ISO timestamp.
- events are append-only; later events must not rewrite earlier events.
- crash and timeout paths must emit deterministic terminal events.

## Minimum Event Kinds

- `run_started`
- `preflight_started`
- `preflight_completed`
- `step_started`
- `tool_call_started`
- `tool_call_completed`
- `assistant_message`
- `step_timeout`
- `report_status`
- `run_finished`
- `run_crashed`

## Minimum Payloads

`run_started`:

```ts
interface RunStartedPayload {
  workspacePath: string
  taskGoal: string
  maxSteps: number
  stepTimeoutMs: number
}
```

`step_started`:

```ts
interface StepStartedPayload {
  stepIndex: number
  maxSteps: number
}
```

`tool_call_started`:

```ts
interface ToolCallStartedPayload {
  toolName: string
  argsSummary: string
}
```

`tool_call_completed`:

```ts
interface ToolCallCompletedPayload {
  toolName: string
  ok: boolean
  status?: string
  summary: string
  error?: string
}
```

`assistant_message`:

```ts
interface AssistantMessagePayload {
  text: string
}
```

`report_status`:

```ts
interface ReportStatusPayload {
  status: 'completed' | 'failed' | 'blocked'
  summary?: string
}
```

`run_finished`:

```ts
interface RunFinishedPayload {
  finalStatus: 'completed' | 'failed' | 'blocked' | 'timeout'
  totalSteps: number
  error?: string
}
```

## CLI Architecture

The CLI should have three separable layers.

### 1. Input Adapter

Input adapters convert transport-specific input into `RunnerEventEnvelope`
events.

Initial adapters:

- in-process runner callback
- stdin JSONL
- JSONL file replay

### 2. State Reducer

The reducer builds deterministic `CliViewState` from events.

Rules:

- no terminal I/O in the reducer
- no process spawning in the reducer
- no animation timing in the reducer
- reducer tests should use fixture event streams

### 3. Renderer Adapter

Renderer adapters consume `CliViewState`.

Initial renderers:

- text renderer, always available
- JSONL passthrough renderer for tooling
- optional `chafa` avatar renderer

## Chafa Adapter

The `chafa` adapter should:

- probe `chafa` binary availability at startup
- disable itself when stdout is not a TTY
- convert sprite or frame assets to ANSI frames
- pace animation independently from runner event rate
- fall back to text-only rendering on failure

Initial CLI flags:

- `--avatar=chafa|none`
- `--no-avatar`
- `--events=runner|stdin|jsonl-file`
- `--output=pretty|jsonl`

## Testing Strategy

1. Contract tests for event schema and monotonic `seq`.
2. Reducer tests from fixture JSONL streams.
3. Text renderer snapshot tests.
4. Chafa adapter tests with mocked binary probing and mocked child process
   execution.
5. CI defaults to text mode and does not require `chafa`.

## Delivery Stages

### Stage 1: Contract

- define the runner event envelope
- add success, failure, and timeout fixture streams
- do not render terminal UI yet

### Stage 2: Text CLI

- scaffold `packages/airi-cli`
- consume runner events
- render run, step, tool, error, and final report state in plain text

### Stage 2.5: JSONL Adapter

- support stdin JSONL replay
- support JSONL file replay
- use fixtures for offline demos and tests

### Stage 3: Chafa Renderer

- add optional `chafa` renderer
- keep plain text as the default fallback
- keep CI and headless runs independent from `chafa`

## Acceptance Criteria

1. No `chafa` dependency is added under `services/computer-use-mcp`.
2. CLI works when `chafa` is not installed.
3. CI does not require `chafa`.
4. The reducer is testable from mocked event streams.
5. Terminal output degrades to plain text.
6. Runner behavior is not changed for animation-first UX.

## Review Checklist

Layering:

- no renderer code in `computer-use-mcp` runtime
- no `chafa` dependency in runtime packages
- CLI code stays under `packages/airi-cli`

Runtime:

- runner remains headless-safe
- runner emits events without depending on terminal state
- failures and timeouts produce deterministic events

Fallback:

- missing `chafa` does not fail CLI execution
- non-TTY mode uses text or JSONL output

Scope:

- do not mix CLI rendering with coding memory changes
- do not mix CLI rendering with desktop/browser runtime changes

## Out of Scope

- long-term memory promotion and governance
- desktop/browser runtime refactors
- terminal animation before a runner event contract exists
- changing coding runner completion semantics for display purposes

## Suggested Follow-up PRs

- `feat(cli): define coding runner event contract`
- `feat(cli): scaffold airi coding cli text renderer`
- `feat(cli): add optional terminal AIRI avatar renderer with chafa`

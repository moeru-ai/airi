# Planner Layer — Architecture Documentation

## Overview

The planner layer is a deterministic multi-step workflow orchestrator that composes existing AIRI capabilities (tasks, workers, tools, patches) into sequential or dependency-parallel plans. This is **NOT AI** — it is deterministic agent logic that executes predefined steps in a specified order.

## Design Principles

- **Deterministic execution**: Plans follow predefined step sequences with no autonomous reasoning.
- **Worker isolation**: Each step maps to a task; tasks execute in isolated workers.
- **Daemon ownership**: The PlanExecutor orchestrates; the TaskManager is authoritative for task state.
- **Event streaming**: All plan/step events flow through the EventBus for IPC broadcast and replay buffer.
- **No global singletons**: PlanRegistry and PlanExecutor are classes instantiated by the daemon.

## Architecture

### Plan → Step → Task → Worker Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│    Plan      │────▶│    Step      │────▶│    Task      │────▶│   Worker     │
│             │     │             │     │             │     │             │
│ - id        │     │ - id        │     │ - id        │     │ - process   │
│ - name      │     │ - name      │     │ - title     │     │ - isolate   │
│ - steps[]   │     │ - action    │     │ - moduleId  │     │ - execute   │
│ - status    │     │ - input     │     │ - state     │     │ - report    │
│             │     │ - deps[]    │     │ - result    │     │             │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │                   │
       └───────────────────┴───────────────────┴───────────────────┘
                                   │
                                   ▼
                          ┌─────────────────┐
                          │    EventBus      │
                          │                 │
                          │ - plan.started  │
                          │ - step.started  │
                          │ - step.completed│
                          │ - plan.completed│
                          │ - plan.failed   │
                          │ - plan.cancelled│
                          └─────────────────┘
                                   │
                                   ▼
                          ┌─────────────────┐
                          │   IPC Clients    │
                          │   Replay Buffer  │
                          └─────────────────┘
```

### Component Responsibilities

| Component | Responsibility |
|-----------|---------------|
| `PlanRegistry` | Stores plan definitions and runtime instances. CRUD operations. |
| `PlanExecutor` | Orchestrates step execution, dependency resolution, cancellation, timeout. |
| `TaskManager` | Owns task lifecycle (create, queue, start, complete, fail, cancel). |
| `EventBus` | Inter-module communication. All plan/step events published here. |
| `TaskReplayBuffer` | Records plan/step events for client reconnect. |

## Plan Lifecycle

### State Machine

```
draft ──▶ pending ──▶ running ──▶ completed
                         │
                         ├──▶ failed
                         │
                         └──▶ cancelled
```

| State | Description |
|-------|-------------|
| `draft` | Plan created but not yet submitted. |
| `pending` | Plan registered, awaiting execution. |
| `running` | Plan execution in progress. |
| `completed` | All steps completed successfully. |
| `failed` | A step failed, causing plan failure. |
| `cancelled` | Plan was cancelled (by user or system). |

### Step Lifecycle

```
pending ──▶ running ──▶ completed
               │
               ├──▶ failed
               │
               ├──▶ cancelled
               │
               └──▶ skipped (dependency failed)
```

| State | Description |
|-------|-------------|
| `pending` | Step awaiting execution (dependencies not yet met). |
| `running` | Step task has been created and queued. |
| `completed` | Step task completed successfully. |
| `failed` | Step task failed. |
| `cancelled` | Step task was cancelled. |
| `skipped` | Step skipped because a dependency failed. |

## Step Execution with Dependency Resolution

### Dependency Graph

Steps declare dependencies via `dependencyIds`. The executor builds a dependency graph and executes steps in topological order:

```
Example: Diamond dependency
    A
   / \
  B   C
   \ /
    D

Execution order: A → (B ∥ C) → D
```

### Concurrency

- **Independent steps** (no dependencies between them) execute in parallel.
- **Concurrency limit** (default: 2) controls the maximum number of simultaneously running steps.
- **Dependent steps** wait for all their dependencies to complete before starting.

### Algorithm

1. Build a map of step ID → dependency IDs.
2. Track completed, failed, and running step sets.
3. While pending steps remain:
   a. Mark steps with failed dependencies as "skipped".
   b. Find steps whose dependencies are all met (completed or failed/skipped).
   c. Launch ready steps up to the concurrency limit.
   d. Wait for any running step to complete.
   e. Update completed/failed sets.

## Cancellation and Failure Propagation

### Plan Cancellation

When a plan is cancelled:
1. The PlanExecutor cancels all running step tasks via `TaskManager.cancel()`.
2. The plan status is set to `cancelled`.
3. A `plan.cancelled` event is emitted.

### Step Failure Propagation

When a step fails:
1. The step status is set to `failed`.
2. All dependent steps are marked as `skipped`.
3. The plan status is set to `failed`.
4. A `plan.failed` event is emitted with the failure reason.

### Task-Level Cancellation

Step tasks are cancelled via the standard TaskManager cancellation mechanism:
- The task's `CancellationTokenSource` is triggered.
- The task transitions to `cancelled` state.
- A `task.cancelled` event is emitted.

## Timeout Enforcement

Each step can specify a `timeoutMs` override. If not specified, the default timeout (5 minutes) applies.

When a step times out:
1. The step's task is cancelled.
2. The step status is set to `failed`.
3. The plan fails with a timeout error.

## Event Types

### Plan Events

| Event | When Emitted | Key Fields |
|-------|-------------|------------|
| `plan.started` | Plan execution begins | `planId`, `name`, `stepCount` |
| `plan.completed` | All steps completed | `planId`, `name`, `durationMs` |
| `plan.failed` | A step failed | `planId`, `name`, `failureReason`, `failedStepId` |
| `plan.cancelled` | Plan cancelled | `planId`, `name`, `reason` |

### Step Events

| Event | When Emitted | Key Fields |
|-------|-------------|------------|
| `step.started` | Step execution begins | `planId`, `stepId`, `stepName`, `action` |
| `step.completed` | Step task completed | `planId`, `stepId`, `stepName`, `success`, `durationMs` |
| `step.failed` | Step task failed | `planId`, `stepId`, `stepName`, `error` |

## IPC API

The daemon exposes the following IPC methods for plan management:

### `plan.create`

Create a new plan.

**Params:**
- `name` (string, required): Plan name.
- `input` (CreatePlanInput, required): Plan definition with steps.
- `execute` (boolean, optional): Auto-execute after creation.

**Returns:** `{ plan: { id, name, status, stepCount, createdAt } }`

### `plan.cancel`

Cancel a running plan.

**Params:**
- `planId` (string, required): Plan ID.
- `reason` (string, optional): Cancellation reason.

**Returns:** `{ plan: { id, status } }`

### `plan.list`

List plans with optional filtering.

**Params:**
- `status` (string, optional): Filter by status.
- `sessionId` (string, optional): Filter by session.
- `name` (string, optional): Filter by name.

**Returns:** `{ plans: PlanSummary[] }`

### `plan.get`

Get a specific plan by ID.

**Params:**
- `planId` (string, required): Plan ID.

**Returns:** `{ plan: Plan }`

## Daemon Integration

The planner layer is integrated into the daemon at Phase 3c (after task orchestration, before IPC server):

```typescript
// Phase 3c: Create planner layer
const planRegistry = new PlanRegistry()
const planExecutor = new PlanExecutor(taskManager, core.events, logger, {
  concurrency: 2,
  defaultStepTimeoutMs: 300_000,
})

// Wire plan events → IPC broadcast + replay buffer
wirePlanEvents(core.events, planRegistry, replayBuffer)
```

### Shutdown Order

On daemon shutdown, the planner layer is stopped as part of the task orchestration shutdown:

1. Stop IPC server.
2. Stop worker manager.
3. Stop task scheduler.
4. Stop task manager.
5. Shutdown core.

The PlanExecutor does not need explicit stopping — it completes or cancels running plans when the task manager stops.

## File Structure

```
core/planner/
├── types.ts      # Core types (PlanId, StepId, Plan, PlanStep, etc.)
├── events.ts     # Plan/step event types
├── registry.ts   # PlanRegistry class
├── executor.ts   # PlanExecutor class
└── index.ts      # Barrel export
```

## Future: LLM-Driven Planning

The planner layer is designed to support future LLM-driven planning:

1. **Plan Generation**: An LLM generates a `CreatePlanInput` with steps and dependencies.
2. **Plan Execution**: The PlanExecutor executes the generated plan deterministically.
3. **Plan Adaptation**: Between steps, an LLM could modify remaining steps based on intermediate results.

The key insight is that the planner layer separates **plan definition** (which can be AI-generated) from **plan execution** (which is always deterministic).

## Testing

Tests are in `core/__tests__/planner.test.ts` and cover:

- Plan registry CRUD operations.
- Sequential step execution with dependencies.
- Parallel step execution with concurrency limits.
- Plan cancellation mid-execution.
- Step failure handling and propagation.
- Event emission order and correctness.
- Diamond dependency patterns.
- Step timeout enforcement.

All tests use mock task executors (no real worker processes).

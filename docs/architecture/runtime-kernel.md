# AIRI Runtime Kernel — Architecture Document

## Overview

The AIRI daemon is evolving from a simple module host into a true **agent runtime kernel**. This document describes the task orchestration layer that enables the daemon to manage, schedule, track, and cancel units of work (tasks) across all modules.

## Why Tasks Are Daemon-Owned

Tasks are owned by the daemon, not by individual modules, for several reasons:

1. **Centralized lifecycle management**: The daemon is the single source of truth for task state. Modules request task creation; the daemon manages transitions.
2. **Cross-module visibility**: Any module can observe any task's progress through the event bus.
3. **Graceful shutdown**: The daemon can cancel all running tasks during shutdown, ensuring clean teardown.
4. **Client reconnection**: The replay buffer allows clients to catch up on task state after a brief disconnect.
5. **Resource management**: Concurrency limits and priority scheduling are enforced centrally.

## Task Lifecycle State Machine

```
pending → queued → running → completed
                 ↘          ↗
                  failed
                  cancelled
```

### States

| State | Description |
|-------|-------------|
| `pending` | Task created, not yet queued for execution. |
| `queued` | Task waiting for an execution slot. |
| `running` | Task currently being executed by an executor. |
| `completed` | Task finished successfully. |
| `failed` | Task encountered an unrecoverable error. |
| `cancelled` | Task was cancelled before completion. |

### Valid Transitions

- `pending` → `queued` | `cancelled`
- `queued` → `running` | `cancelled`
- `running` → `completed` | `failed` | `cancelled`
- `completed`, `failed`, `cancelled` → *(terminal — no further transitions)*

Invalid transitions are rejected by the `TaskManager`. This ensures deterministic lifecycle behavior.

## Architecture Components

### TaskManager (`core/tasks/manager.ts`)

The central task lifecycle manager.

**Responsibilities:**
- Create tasks with auto-generated branded IDs.
- Enforce valid state transitions.
- Track cancellation token sources per task.
- Maintain bounded in-memory storage (configurable max, default 1000).
- Auto-cleanup completed tasks after TTL (configurable, default 5 minutes).
- Register and look up task executors by module.

**Key design decisions:**
- Class-based, not a global singleton. One instance per daemon.
- All state transitions go through `transition()` which validates via `isValidTransition()`.
- Each task has a `CancellationTokenSource` for cooperative cancellation.

### TaskScheduler (`core/tasks/scheduler.ts`)

Dispatches queued tasks to executors based on priority and concurrency limits.

**Responsibilities:**
- Pick the highest-priority queued task when a slot frees up.
- Enforce concurrency limits (configurable, default 4).
- Starvation prevention: tasks waiting longer than the threshold get a priority boost.
- Find the right executor for each task via `TaskManager.findExecutor()`.

**Selection order:**
1. Highest effective priority (with starvation boost).
2. FIFO within same priority level.

### TaskExecutor (`core/tasks/executor.ts`)

The interface that modules implement to execute tasks.

```ts
interface TaskExecutor {
  canExecute(task: Task): boolean
  execute(task: Task, ctx: TaskExecutionContext): Promise<TaskResult>
}
```

**Execution context provides:**
- The task being executed.
- A `CancellationToken` for cooperative cancellation.
- `reportProgress(percent, message)` for progress updates.
- The `EventBus` for emitting sub-events.
- A tagged `Logger`.

### TaskReplayBuffer (`core/tasks/replay-buffer.ts`)

Bounded in-memory event history for reconnecting clients.

**Responsibilities:**
- Store task state transitions with timestamps (configurable max, default 500).
- Replay recent events to reconnecting clients.
- Provide a snapshot of current task states on connect.

### TaskMetrics (`core/tasks/metrics.ts`)

In-memory runtime diagnostics.

**Tracks:**
- Active/queued/completed/failed/cancelled task counts.
- Average execution duration.
- Per-module task counts.
- Uptime.

### Cancellation Infrastructure (`core/tasks/cancellation.ts`)

Cooperative cancellation primitives.

**Key concepts:**
- `CancellationTokenSource` — the producer side. Owners call `cancel()`.
- `CancellationToken` — the consumer side. Executors check `isCancelled` or call `throwIfCancelled()`.
- Linked tokens — child tokens auto-cancel when the parent cancels.
- `withTimeout()` — wraps any promise with a deadline.

**Cancellation is cooperative, not preemptive.** Tasks must check the token at reasonable intervals. This is intentional — it avoids the complexity and unsafety of forced termination.

## IPC Integration

The daemon exposes task operations via IPC request handlers:

| Method | Description |
|--------|-------------|
| `task.create` | Create a new task. Params: `title`, `description?`, `priority?`, `moduleId?`, `metadata?` |
| `task.cancel` | Cancel a task. Params: `taskId`, `reason?` |
| `task.list` | List tasks. Params: `state?`, `moduleId?` |
| `task.get` | Get task details. Params: `taskId` |

Task events are streamed to all connected clients:

| Event | Description |
|-------|-------------|
| `task.queued` | Task was queued for execution. |
| `task.progress` | Task reported progress. |
| `task.failed` | Task failed with an error. |
| `task.cancelled` | Task was cancelled. |

### Reconnect Behavior

When a new client connects, the daemon sends a **replay snapshot** containing:
- Current state of all active/queued tasks.
- Recent state transition events (last 50).

This allows clients to catch up after a brief disconnect without missing task state changes.

## Module Integration

Modules participate in the task system by registering a `TaskExecutor`:

```ts
// In module activation:
const executor = new MyTaskExecutor()
taskManager.registerExecutor(moduleId, executor)
```

The executor's `canExecute()` method determines which tasks it handles. The scheduler uses this to find the right executor for each task.


## Scheduler Behavior

### Priority + FIFO

Tasks are dispatched in priority order: `critical` > `high` > `normal` > `low`. Within the same priority, tasks are dispatched FIFO (oldest first).

### Concurrency Limits

The scheduler enforces a maximum number of concurrently running tasks (default 4). When all slots are full, queued tasks wait. When a slot frees up, the highest-priority queued task is dispatched.

### Starvation Prevention

Tasks waiting longer than the starvation threshold (default 30 seconds) get their effective priority boosted by one level. This prevents low-priority tasks from being permanently blocked by a stream of high-priority tasks.

## Future Directions

### Persistence

Currently, all task state is in-memory. Future work could add:
- Write-ahead log for task state transitions.
- Periodic snapshots for fast recovery.
- Replay from log on daemon restart.

### Worker Processes

Currently, all task execution is in-process. Future work could add:
- Worker process pool for isolation.
- IPC between daemon and workers.
- Sandboxed execution for untrusted code.

### Task Dependencies

Future work could add:
- DAG-based task dependencies.
- Automatic scheduling when dependencies are met.
- Parallel execution of independent tasks.

### Retry Policies

Future work could add:
- Configurable retry counts per task.
- Exponential backoff for recoverable errors.
- Dead-letter queue for permanently failed tasks.

## Constraints

The current implementation deliberately does **not** include:
- **Planners or autonomous loops**: Tasks are created by external requests, not by the daemon itself.
- **Vector databases or embeddings**: No semantic search or memory.
- **Arbitrary shell command execution**: Tasks are executed by registered executors, not by shelling out.
- **Tight coupling to coding semantics**: The task system is generic and module-agnostic.
- **External queue systems**: Everything is in-memory. No Redis, RabbitMQ, etc.
- **Global singletons**: All components are class-based and instantiated per-daemon.

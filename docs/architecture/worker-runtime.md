# Worker Runtime Architecture

## Overview

The AIRI daemon has been transformed from a process that executes tasks directly into a **supervisory orchestration kernel** that dispatches tasks to isolated worker processes. This architecture ensures that a crashing executor cannot bring down the entire daemon.

```
┌─────────────────────────────────────────────────────────┐
│                    AIRI Daemon                          │
│                 (Orchestration Kernel)                  │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ TaskManager  │  │TaskScheduler  │  │WorkerManager │  │
│  │              │  │              │  │              │  │
│  │ task CRUD    │  │ priority     │  │ pool mgmt    │  │
│  │ state machine│  │ dispatch     │  │ crash recovery│  │
│  │ lifecycle    │  │              │  │ quarantine  │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │
│         │                 │                  │          │
│         └────────┬────────┘                  │          │
│                  │                           │          │
│           ┌──────▼───────────────────────────▼──────┐   │
│           │         EventBus (IPC)                   │   │
│           └──────┬───────────────────────────┬──────┘   │
│                  │                           │          │
└──────────────────┼───────────────────────────┼──────────┘
                   │                           │
    ┌──────────────┼──────────┐    ┌───────────┼──────────┐
    │              ▼          │    │           ▼          │
    │  ┌──────────────────┐   │    │  ┌──────────────────┐│
    │  │  IPC Server      │   │    │  │  Worker Pool     ││
    │  │  (Unix socket)   │   │    │  │                  ││
    │  └──────────────────┘   │    │  │  ┌────────────┐  ││
    │                          │    │  │  │ Worker #1  │  ││
    │                          │    │  │  │ (Node.js)  │  ││
    │                          │    │  │  └────────────┘  ││
    │                          │    │  │  ┌────────────┐  ││
    │                          │    │  │  │ Worker #2  │  ││
    │                          │    │  │  │ (Node.js)  │  ││
    │                          │    │  │  └────────────┘  ││
    │                          │    │  └──────────────────┘│
    └──────────────────────────┘    └──────────────────────┘
```

## Protocol

### Transport

Communication between daemon and workers uses **length-prefixed JSON** over stdio:

```
[4 bytes: message length (big-endian uint32)][N bytes: UTF-8 JSON]
```

This is the same framing used by the existing local-socket transport.

### Message Types

All messages carry `id`, `type`, and `timestamp` fields.

#### Worker → Daemon

| Message | Purpose |
|---------|---------|
| `worker.hello` | Worker announces itself with capabilities |
| `worker.ready` | Worker is idle and ready for a task |
| `worker.heartbeat` | Periodic liveness ping |
| `worker.shutdown` | Graceful shutdown notice |
| `task.progress` | Progress update during execution |
| `task.result` | Successful completion |
| `task.failure` | Execution failed |

#### Daemon → Worker

| Message | Purpose |
|---------|---------|
| `execute.task` | Assign a task for execution |

### Message Sequencing

```
Worker                          Daemon
  │                               │
  │──── worker.hello ────────────>│
  │<─── execute.task ─────────────│
  │──── task.progress ───────────>│
  │──── task.progress ───────────>│
  │──── task.result ─────────────>│
  │──── worker.ready ────────────>│
  │                               │
```

## Lifecycle

### Worker Startup

1. Worker process is spawned via `fork()` with `AIRIER_WORKER_ID` env var
2. Worker sends `worker.hello` with capabilities (supported module IDs)
3. Worker transitions to "ready" state
4. Worker starts sending `worker.heartbeat` every 10 seconds

### Task Assignment

1. Scheduler picks the highest-priority queued task
2. Daemon calls `WorkerManager.assignTask(task, executor)`
3. Manager finds a ready worker and sends `execute.task`
4. Worker transitions to "busy" state
5. Worker imports the module executor and runs it with a synthetic context

### Crash Recovery

```
Worker crashes during task execution
    │
    ▼
WorkerManager.handleWorkerExit()
    │
    ├── Mark worker as "dead"
    ├── Record crash timestamp
    ├── Fail the task with WORKER_CRASHED error
    ├── Emit task.failed event → TaskManager.fail()
    │
    ├── Check quarantine:
    │   ├── < 3 crashes in 60s → respawn worker
    │   └── >= 3 crashes in 60s → log error, stop respawning
    │
    └── Clean up transport
```

### Heartbeat Monitoring

- Daemon checks all workers every 10 seconds
- If no heartbeat received in 30 seconds → mark as "unresponsive"
- Kill unresponsive workers with SIGKILL
- Unresponsive workers are treated as crashed

### Quarantine Policy

If a worker crashes more than **3 times within 60 seconds**, it is quarantined:

- No replacement worker is spawned
- An error is logged
- This prevents infinite crash-respawn loops

### Graceful Shutdown

1. Daemon receives SIGTERM or shutdown signal
2. `WorkerManager.stop()` is called
3. All pending tasks are failed with `WORKER_CRASHED`
4. Shutdown signal sent to all workers
5. Wait up to 5 seconds for graceful exit
6. SIGKILL any remaining workers
7. Scheduler and TaskManager are stopped

## Task Execution Metadata

Tasks now include execution metadata fields:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `workerId` | `string?` | `undefined` | Worker process executing this task |
| `executionAttempt` | `number` | `0` | Incremented on worker crash retry |
| `isolationLevel` | `"process" \| "vm" \| "container"` | `"process"` | Execution isolation level |

## Error Codes

| Code | Description |
|------|-------------|
| `WORKER_CRASHED` | Worker process crashed during execution |
| `EXECUTOR_NOT_FOUND` | No executor found for the task module |
| `TASK_TIMEOUT` | Task execution timed out |
| `WORKER_INIT_FAILED` | Worker failed to initialize |
| `EXECUTION_ERROR` | Generic execution error |

## Future: Stronger Isolation

The `isolationLevel` field is designed for future isolation strategies:

- **`process`** (current): Each task runs in a separate Node.js subprocess
- **`vm"`**: Tasks run in a VM sandbox (e.g., `isolated-vm`)
- **`container"`**: Tasks run in a container (e.g., Docker, OCI runtime)

The worker architecture supports this by abstracting the execution environment behind the `WorkerTransport` interface.

# Runtime Persistence & Session Recovery

## Overview

Phase 10 transforms the AIRI runtime from process-bound orchestration into
recoverable persistent infrastructure. The runtime can now survive daemon
restarts by persisting state to disk and replaying events to reconstruct
in-memory state.

## Architecture

### Append-Only Event Store

The core persistence primitive is an **append-only event store**. Every
significant state transition (plan started, step completed, task failed, etc.)
is recorded as an immutable event with a monotonic sequence number.

```
Event ID format: evt_{sequence}_{timestamp}
Example: evt_42_1706119234567
```

Events are ordered by sequence number, not by timestamp. This guarantees
deterministic ordering even when multiple events share the same timestamp.

**Key properties:**
- Events are never mutated or deleted (append-only).
- Each event gets a unique, monotonically increasing sequence number.
- Events can be queried by: session, module, type, execution ID, or since a given event ID.

### Snapshot Strategy

Snapshots are **point-in-time captures** of the full runtime state. They are:
- **Versioned**: each save increments the version number.
- **Lightweight**: only essential state is serialized (plans, tasks, capabilities, sessions).
- **Prunable**: old snapshots are automatically removed, keeping only the N most recent.

Recovery loads the latest snapshot and replays events since that snapshot.
This bounds recovery time — instead of replaying all events from the beginning
of time, only events since the last snapshot need to be replayed.

### Deterministic Recovery Philosophy

Recovery is **deterministic**: given the same snapshot and the same events,
the recovered state is always the same. There is no "smart" recovery heuristics
or implicit magic.

**Recovery flow:**
1. Load the latest snapshot.
2. Replay events since the snapshot.
3. Restore planner state (active plans, pending steps).
4. Restore active executions (running tasks).
5. Restore session ownership.
6. Reconcile incomplete executions (mark running-but-not-actively-running as failed).

**Reconciliation:**
Executions that were running at snapshot time but are not actively running
at recovery time are marked as failed. This handles the case where the daemon
crashed mid-execution.

### Session Persistence

Sessions survive frontend disconnects. When a client disconnects:
- The session is marked as "detached" but retained.
- A recovery token is generated for reconnection.
- The session can be resumed by providing the recovery token.

Sessions are only destroyed on:
- Explicit cleanup (e.g., user logs out).
- Expiry (detached sessions older than a configurable threshold).

### Planner Persistence Integration

The `PlanExecutor` accepts an optional `EventStore`. When configured:
- All plan lifecycle events (plan.started, plan.completed, plan.failed, plan.cancelled)
  are persisted to the event store.
- All step lifecycle events (step.started, step.completed, step.failed) are persisted.
- Plans can be marked as `resumable` — they can be restored after a restart.
- Already-completed steps are skipped on replay (idempotent recovery).
- Cancelled plans remain cancelled after restart.

### Execution Persistence Integration

The `ExecutionTrace` accepts an optional `EventStore`. When configured:
- Each execution record is persisted to the event store.
- Execution IDs remain stable across restarts (they're already UUIDs).
- Failed recovery attempts become events in the store.

The `LocalToolRuntime` also accepts an optional `EventStore` for persisting
tool execution lifecycle events.

## File Structure

```
core/
  persistence/
    types.ts                    — Persistence abstractions (interfaces)
    event-store.ts              — InMemoryEventStore + PersistedEventStore
    snapshots.ts                — InMemorySnapshotStore + SnapshotManager
    index.ts                    — Barrel export
    adapters/
      filesystem/
        adapter.ts              — FilesystemPersistenceAdapter
        event-store.ts          — FilesystemEventStore
        snapshot-store.ts       — FilesystemSnapshotStore
        runtime-state-store.ts  — FilesystemRuntimeStateStore
        index.ts                — Barrel export
  session/
    types.ts                    — Persistent session types
    session-manager.ts          — PersistentSessionManager
  runtime/
    recovery.ts                 — RecoveryCoordinator
  planner/
    executor.ts                 — Modified: optional EventStore persistence
  runtime/
    execution-trace.ts          — Modified: optional EventStore persistence
    local-tool-runtime.ts       — Modified: optional EventStore persistence
  __tests__/
    persistence.test.ts         — Persistence layer tests
    filesystem-adapter.test.ts  — Filesystem adapter tests
```

## Why Persistence Precedes Autonomy

Before the runtime can support autonomous operation (self-directed task
execution, long-running plans), it must be able to survive restarts.
A plan that takes hours to complete cannot afford to lose progress because
of a daemon restart.

Persistence provides the foundation for:
- **Long-running plans**: plans that span daemon restarts.
- **Session continuity**: clients can disconnect and reconnect without losing state.
- **Auditability**: the event store provides a complete history of all state transitions.
- **Debugging**: replaying events to understand how a particular state was reached.

## Future Distributed Runtime Implications

The persistence abstractions are designed to support future distributed scenarios:

- **PersistenceAdapter** can be implemented for remote blob stores (S3, GCS).
- **EventStore** can be backed by distributed log systems (Kafka, Pulsar).
- **SessionOwnership** tracks which process owns a session, enabling session affinity.
- **RecoveryCoordinator** can be extended to coordinate recovery across multiple nodes.

## Known Limitations

1. **Filesystem-only**: Currently only filesystem-based persistence is implemented.
   No database or remote storage backends.

2. **Full event scan**: The filesystem event store does a full file scan for queries.
   This is acceptable for bounded event counts but will need indexing for large-scale use.

3. **No event pruning**: The event store does not yet prune old events.
   A future version should implement time-based or count-based retention.

4. **Single-process**: Recovery assumes a single daemon process. No distributed
   coordination is implemented.

5. **No encryption**: Data is stored in plaintext on disk. Sensitive data should
   be encrypted at rest in production deployments.

## Future Migration Recommendations

1. **Database backend**: Implement PersistenceAdapter for SQLite or PostgreSQL
   for better query performance and concurrent access.

2. **Event indexing**: Add an index layer (e.g., B-tree) for efficient event
   queries without full scans.

3. **Snapshot compression**: Compress snapshot files to reduce disk usage.

4. **Incremental snapshots**: Instead of full snapshots, store only the
   delta since the last snapshot.

5. **Distributed consensus**: For multi-node deployments, use a consensus
   protocol (Raft) to coordinate recovery.

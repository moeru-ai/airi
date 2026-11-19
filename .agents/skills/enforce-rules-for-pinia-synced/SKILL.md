---
name: enforce-rules-for-pinia-synced
description: Enforce AIRI's rules for Pinia stores that use pinia-plugin-synced for cross-window synchronization. Use when adding `synced` to a Pinia store, changing a synced store's state or actions, or writing watchers, persistence, or tests for synchronized state in AIRI renderers.
---

# Enforce AIRI Pinia Synchronization Rules

Apply these rules to every Pinia store that uses `pinia-plugin-synced`.

## Synchronization Model

- Treat `pinia-plugin-synced` as snapshot replication and leader-routed RPC. It does not share Vue refs between renderers.
- Add `synced` only to stores that need cross-window ownership. Synchronize the smallest serializable source-of-truth state.
- `state: true` sends a full-store proposal after each local mutation. Keep transient and high-frequency state in an unsynchronized store.
- State, action arguments, and action results must support `structuredClone`.
- Keep computed values, query status, runtime clients, controllers, pending promises, and component state outside synchronized state.

## Watchers and Invariants

- Remote snapshots run local Vue watchers. A watcher on synchronized state must not write synchronized state directly.
- A watcher can call a synchronized action to enforce a leader-owned invariant. The watcher must await the action. The action must be idempotent because each renderer can observe the same snapshot.
- Enforce cross-field invariants inside explicit actions before the state commit. Do not repair replicated state with a watcher.

## Actions

- Every returned function in a setup store is a Pinia action. Use computed values or pure helpers for read-only projections.
- List only leader-owned side-effecting actions under `synced.actions`. These actions must be asynchronous, and callers must await them.
- Unlisted actions run in the caller renderer. Their mutations become full-state proposals when `state: true`.

## Persistence and Leadership

- Keep synchronization and persistence as separate boundaries. Give persisted synchronized state one explicit persistence owner.
- Do not add bidirectional persistence composables or storage-event listeners to synchronized state. Use explicit persistence commands.
- Set the leadership mode explicitly for every Electron renderer. Utility and minimal windows must use `follower-only`.

## Tests

- Add a multi-window regression test for synchronization changes. A remote snapshot must not produce a local synchronized-state proposal.
- If a watcher calls a synchronized action, verify that repeated calls converge without repeated side effects.

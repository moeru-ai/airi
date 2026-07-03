/**
 * AIRI Core — Filesystem Persistence Adapters
 *
 * Barrel export for all filesystem-based persistence implementations.
 */

export { FilesystemPersistenceAdapter, FilesystemTransaction } from './adapter.js'
export { FilesystemEventStore } from './event-store.js'
export { FilesystemRuntimeStateStore } from './runtime-state-store.js'
export { FilesystemSnapshotStore } from './snapshot-store.js'

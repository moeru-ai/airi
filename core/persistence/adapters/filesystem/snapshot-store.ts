/**
 * AIRI Core — Filesystem Snapshot Store
 *
 * Implements SnapshotStore using the FilesystemPersistenceAdapter.
 *
 * Snapshots are stored as versioned JSON files.
 * Pruning removes old snapshots keeping only the N most recent.
 */

import type {
  RuntimeSnapshot,
  SnapshotStore,
} from '../../types.js'
import type { FilesystemPersistenceAdapter } from './adapter.js'

/**
 * Filesystem-backed snapshot store.
 *
 * Snapshots are stored as individual JSON files with versioned filenames.
 * Key format: "snapshots:v{version}" → basePath/snapshots/v{version}
 */
export class FilesystemSnapshotStore implements SnapshotStore {
  private readonly adapter: FilesystemPersistenceAdapter
  private readonly keyPrefix: string

  constructor(adapter: FilesystemPersistenceAdapter, keyPrefix = 'snapshots') {
    this.adapter = adapter
    this.keyPrefix = keyPrefix
  }

  // ── Lifecycle ────────────────────────────────────────────────────────

  /**
   * Initialize the snapshot store — ensure the base directory exists.
   */
  async initialize(): Promise<void> {
    await this.adapter.initialize()
  }

  // ── SnapshotStore interface ─────────────────────────────────────────

  async save(snapshot: RuntimeSnapshot): Promise<void> {
    const key = `${this.keyPrefix}:v${snapshot.version}`
    const data = Buffer.from(JSON.stringify(snapshot, null, 2), 'utf-8')
    await this.adapter.write(key, data)

    // Update the "latest" pointer.
    await this.adapter.write(
      `${this.keyPrefix}:latest`,
      Buffer.from(JSON.stringify({ version: snapshot.version }), 'utf-8'),
    )
  }

  async load(version: number): Promise<RuntimeSnapshot | null> {
    const key = `${this.keyPrefix}:v${version}`
    const buffer = await this.adapter.read(key)
    if (!buffer)
      return null
    return JSON.parse(buffer.toString('utf-8')) as RuntimeSnapshot
  }

  async getLatest(): Promise<RuntimeSnapshot | null> {
    // Try the latest pointer first.
    const latestBuffer = await this.adapter.read(`${this.keyPrefix}:latest`)
    if (latestBuffer) {
      const latest = JSON.parse(latestBuffer.toString('utf-8')) as { version: number }
      return this.load(latest.version)
    }

    // Fallback: scan for the highest version.
    const snapshots = await this.list()
    if (snapshots.length === 0)
      return null
    return snapshots[0] ?? null
  }

  async list(limit?: number): Promise<RuntimeSnapshot[]> {
    // List all keys under the snapshots prefix.
    // Keys are "snapshots:v1", "snapshots:v2", etc.
    // We list using the prefix "snapshots:" and filter for version files.
    const keys = await this.adapter.list(`${this.keyPrefix}:v`)
    const snapshots: RuntimeSnapshot[] = []

    for (const key of keys) {
      // Only load keys that match the version pattern (snapshots:v{N}).
      const match = key.match(/^snapshots:v(\d+)$/)
      if (!match)
        continue

      const buffer = await this.adapter.read(key)
      if (buffer) {
        snapshots.push(JSON.parse(buffer.toString('utf-8')) as RuntimeSnapshot)
      }
    }

    // Sort by version descending.
    snapshots.sort((a, b) => b.version - a.version)

    return limit !== undefined ? snapshots.slice(0, limit) : snapshots
  }

  async prune(keepCount: number): Promise<number> {
    const snapshots = await this.list()
    if (snapshots.length <= keepCount)
      return 0

    let removed = 0
    for (let i = keepCount; i < snapshots.length; i++) {
      const snapshot = snapshots[i]
      if (snapshot) {
        const key = `${this.keyPrefix}:v${snapshot.version}`
        await this.adapter.delete(key)
        removed++
      }
    }

    return removed
  }
}

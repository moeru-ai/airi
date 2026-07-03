/**
 * AIRI Core — Filesystem Runtime State Store
 *
 * Implements RuntimeStateStore using the FilesystemPersistenceAdapter.
 *
 * Each key is stored as an individual JSON file.
 * Directory-based organization for efficient listing.
 */

import type { RuntimeStateStore } from '../../types.js'
import type { FilesystemPersistenceAdapter } from './adapter.js'

/**
 * Filesystem-backed key-value runtime state store.
 *
 * Each key maps to an individual JSON file under the base path.
 */
export class FilesystemRuntimeStateStore implements RuntimeStateStore {
  private readonly adapter: FilesystemPersistenceAdapter
  private readonly keyPrefix: string

  constructor(adapter: FilesystemPersistenceAdapter, keyPrefix = 'state') {
    this.adapter = adapter
    this.keyPrefix = keyPrefix
  }

  // ── Lifecycle ────────────────────────────────────────────────────────

  /**
   * Initialize the state store — ensure the base directory exists.
   */
  async initialize(): Promise<void> {
    await this.adapter.initialize()
  }

  // ── RuntimeStateStore interface ─────────────────────────────────────

  async get<T>(key: string): Promise<T | null> {
    const fullKey = `${this.keyPrefix}:${key}`
    const buffer = await this.adapter.read(fullKey)
    if (!buffer)
      return null
    return JSON.parse(buffer.toString('utf-8')) as T
  }

  async set<T>(key: string, value: T): Promise<void> {
    const fullKey = `${this.keyPrefix}:${key}`
    const data = Buffer.from(JSON.stringify(value), 'utf-8')
    await this.adapter.write(fullKey, data)
  }

  async delete(key: string): Promise<void> {
    const fullKey = `${this.keyPrefix}:${key}`
    await this.adapter.delete(fullKey)
  }

  has(key: string): Promise<boolean> {
    const fullKey = `${this.keyPrefix}:${key}`
    return this.adapter.exists(fullKey)
  }

  async clear(): Promise<void> {
    const keys = await this.adapter.list(`${this.keyPrefix}:`)
    for (const key of keys) {
      await this.adapter.delete(key)
    }
  }
}

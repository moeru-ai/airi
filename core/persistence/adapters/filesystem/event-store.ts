/**
 * AIRI Core — Filesystem Event Store
 *
 * Implements EventStore using the FilesystemPersistenceAdapter.
 *
 * Events are stored in JSONL files, one per day or per configurable
 * size limit. Sequence tracking is maintained in a metadata file.
 */

import type { AiriEvent } from '../../../events/types.js'
import type { EventId, EventStore, PersistedEvent } from '../../types.js'
import type { FilesystemPersistenceAdapter } from './adapter.js'

/**
 * Filesystem-backed event store.
 *
 * Events are stored as JSONL files under the base path.
 * Sequence tracking is maintained in a metadata file.
 */
export class FilesystemEventStore implements EventStore {
  private readonly adapter: FilesystemPersistenceAdapter
  private readonly keyPrefix: string
  private nextSequence: number | undefined

  constructor(adapter: FilesystemPersistenceAdapter, keyPrefix = 'events') {
    this.adapter = adapter
    this.keyPrefix = keyPrefix
  }

  // ── Lifecycle ────────────────────────────────────────────────────────

  /**
   * Initialize the event store — loads the next sequence number.
   */
  async initialize(): Promise<void> {
    await this.adapter.initialize()

    const metaBuffer = await this.adapter.read(`${this.keyPrefix}:meta`)
    if (metaBuffer) {
      const meta = JSON.parse(metaBuffer.toString('utf-8')) as { nextSequence: number }
      this.nextSequence = meta.nextSequence
    }
    else {
      this.nextSequence = 1
    }
  }

  // ── EventStore interface ────────────────────────────────────────────

  async append(event: AiriEvent): Promise<EventId> {
    if (this.nextSequence === undefined) {
      await this.initialize()
    }

    const sequence = this.nextSequence!
    const timestamp = Date.now()
    const eventId = `evt_${sequence}_${timestamp}` as EventId

    const persisted: PersistedEvent = {
      eventId,
      timestamp,
      source: event.source,
      type: event.type,
      payload: event,
      sequence,
    }

    // Append the event as a JSON line.
    const data = Buffer.from(`${JSON.stringify(persisted)}\n`, 'utf-8')
    await this.adapter.append(`${this.keyPrefix}:log`, data)

    // Update metadata.
    this.nextSequence = sequence + 1
    await this.adapter.write(
      `${this.keyPrefix}:meta`,
      Buffer.from(JSON.stringify({ nextSequence: this.nextSequence }), 'utf-8'),
    )

    return eventId
  }

  async getSince(eventId: EventId, limit?: number): Promise<PersistedEvent[]> {
    const all = await this.readAllEvents()
    const idx = all.findIndex(e => e.eventId === eventId)
    if (idx === -1) {
      return limit !== undefined ? all.slice(0, limit) : all
    }
    const after = all.slice(idx + 1)
    return limit !== undefined ? after.slice(0, limit) : after
  }

  async getBySession(sessionId: string, limit?: number): Promise<PersistedEvent[]> {
    const all = await this.readAllEvents()
    const matching = all.filter((e) => {
      const payload = e.payload as { sessionId?: string }
      return payload.sessionId === sessionId
    })
    return limit !== undefined ? matching.slice(0, limit) : matching
  }

  async getByModule(moduleId: string, limit?: number): Promise<PersistedEvent[]> {
    const all = await this.readAllEvents()
    const matching = all.filter(e => e.source === moduleId)
    return limit !== undefined ? matching.slice(0, limit) : matching
  }

  async getByType(eventType: string, limit?: number): Promise<PersistedEvent[]> {
    const all = await this.readAllEvents()
    const matching = all.filter(e => e.type === eventType)
    return limit !== undefined ? matching.slice(0, limit) : matching
  }

  async getByExecution(executionId: string, limit?: number): Promise<PersistedEvent[]> {
    const all = await this.readAllEvents()
    const matching = all.filter((e) => {
      const payload = e.payload as { executionId?: string }
      return payload.executionId === executionId
    })
    return limit !== undefined ? matching.slice(0, limit) : matching
  }

  async getLastEvent(): Promise<PersistedEvent | null> {
    const all = await this.readAllEvents()
    if (all.length === 0)
      return null
    return all[all.length - 1] ?? null
  }

  async getEventCount(): Promise<number> {
    const all = await this.readAllEvents()
    return all.length
  }

  // ── Replay ───────────────────────────────────────────────────────────

  async replay(sinceId: EventId, handler: (event: PersistedEvent) => Promise<void>): Promise<number> {
    const events = await this.getSince(sinceId)
    for (const event of events) {
      await handler(event)
    }
    return events.length
  }

  // ── Private ──────────────────────────────────────────────────────────

  private async readAllEvents(): Promise<PersistedEvent[]> {
    const buffer = await this.adapter.read(`${this.keyPrefix}:log`)
    if (!buffer)
      return []

    const content = buffer.toString('utf-8')
    const lines = content.split('\n').filter(l => l.trim().length > 0)

    return lines.map(line => JSON.parse(line) as PersistedEvent)
  }
}

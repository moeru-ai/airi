/**
 * AIRI Core — Event Persistence Layer
 *
 * Append-only event store that wraps a PersistenceAdapter for storage.
 * Events are assigned monotonic EventIds and sequence numbers at write time.
 *
 * Design decisions:
 * - Append-only: historical events are never mutated.
 * - Monotonic IDs: `evt_{sequence}_{timestamp}` — lexicographically sortable.
 * - Deterministic ordering: events are ordered by sequence number.
 * - InMemoryEventStore is provided for testing without filesystem I/O.
 */

import type { AiriEvent } from '../events/types.js'
import type { EventId, EventStore, PersistedEvent, PersistenceAdapter } from './types.js'

// ── Utilities ────────────────────────────────────────────────────────────

/**
 * Generate a monotonic event ID.
 *
 * Format: `evt_{zeroPaddedSequence}_{timestamp}` — lexicographically sortable
 * and human-readable.
 */
function generateEventId(sequence: number, timestamp: number): EventId {
  const paddedSequence = String(sequence).padStart(10, '0')
  return `evt_${paddedSequence}_${timestamp}` as EventId
}

/**
 * Serialize an event to a JSON line with newline terminator.
 */

/**
 * Deserialize a JSON line to a PersistedEvent.
 */

// ── InMemoryEventStore ──────────────────────────────────────────────────

/**
 * In-memory event store for testing.
 *
 * Implements the full EventStore interface using in-memory arrays.
 */
export class InMemoryEventStore implements EventStore {
  private readonly events: PersistedEvent[] = []
  private nextSequence = 1

  // ── EventStore interface ────────────────────────────────────────────

  append(event: AiriEvent): Promise<EventId> {
    const sequence = this.nextSequence++
    const timestamp = Date.now()
    const eventId = generateEventId(sequence, timestamp)

    const persisted: PersistedEvent = {
      eventId,
      timestamp,
      source: event.source,
      type: event.type,
      payload: event,
      sequence,
    }

    this.events.push(persisted)
    return Promise.resolve(eventId)
  }

  getSince(eventId: EventId, limit?: number): Promise<PersistedEvent[]> {
    const idx = this.events.findIndex((e) => e.eventId === eventId)
    if (idx === -1) {
      // Event ID not found — return all events.
      const all = [...this.events]
      return Promise.resolve(limit !== undefined ? all.slice(0, limit) : all)
    }

    const after = this.events.slice(idx + 1)
    return Promise.resolve(limit !== undefined ? after.slice(0, limit) : after)
  }

  getBySession(sessionId: string, limit?: number): Promise<PersistedEvent[]> {
    const matching = this.events.filter((e) => {
      const payload = e.payload as { sessionId?: string }
      return payload.sessionId === sessionId
    })
    return Promise.resolve(limit !== undefined ? matching.slice(0, limit) : matching)
  }

  getByModule(moduleId: string, limit?: number): Promise<PersistedEvent[]> {
    const matching = this.events.filter((e) => e.source === moduleId)
    return Promise.resolve(limit !== undefined ? matching.slice(0, limit) : matching)
  }

  getByType(eventType: string, limit?: number): Promise<PersistedEvent[]> {
    const matching = this.events.filter((e) => e.type === eventType)
    return Promise.resolve(limit !== undefined ? matching.slice(0, limit) : matching)
  }

  getByExecution(executionId: string, limit?: number): Promise<PersistedEvent[]> {
    const matching = this.events.filter((e) => {
      const payload = e.payload as { executionId?: string }
      return payload.executionId === executionId
    })
    return Promise.resolve(limit !== undefined ? matching.slice(0, limit) : matching)
  }

  getLastEvent(): Promise<PersistedEvent | null> {
    if (this.events.length === 0) return Promise.resolve(null)
    return Promise.resolve(this.events[this.events.length - 1] ?? null)
  }

  getEventCount(): Promise<number> {
    return Promise.resolve(this.events.length)
  }

  // ── Replay ───────────────────────────────────────────────────────────

  /**
   * Replay events since a given event ID, invoking the handler for each.
   *
   * Events are delivered in sequence order (oldest first).
   */
  async replay(sinceId: EventId, handler: (event: PersistedEvent) => Promise<void>): Promise<number> {
    const events = await this.getSince(sinceId)
    for (const event of events) {
      await handler(event)
    }
    return events.length
  }

  // ── Test helpers ─────────────────────────────────────────────────────

  /** Get all events (for testing). */
  getAll(): PersistedEvent[] {
    return [...this.events]
  }

  /** Clear all events (for testing). */
  clear(): void {
    this.events.length = 0
    this.nextSequence = 1
  }
}

// ── PersistedEventStore ─────────────────────────────────────────────────

/**
 * Persistent event store backed by a PersistenceAdapter.
 *
 * Events are stored as JSON lines in a single append-only file.
 * Sequence tracking is maintained in a separate metadata key.
 */
export class PersistedEventStore implements EventStore {
  private readonly adapter: PersistenceAdapter
  private readonly eventKey: string
  private readonly metaKey: string
  private nextSequence: number | undefined

  constructor(adapter: PersistenceAdapter, keyPrefix = 'events') {
    this.adapter = adapter
    this.eventKey = `${keyPrefix}:log`
    this.metaKey = `${keyPrefix}:meta`
  }

  // ── Lifecycle ────────────────────────────────────────────────────────

  /**
   * Initialize the event store — loads the next sequence number.
   *
   * Must be called before using the store.
   */
  async initialize(): Promise<void> {
    const metaBuffer = await this.adapter.read(this.metaKey)
    if (metaBuffer) {
      const meta = JSON.parse(metaBuffer.toString('utf-8')) as { nextSequence: number }
      this.nextSequence = meta.nextSequence
    } else {
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
    const eventId = generateEventId(sequence, timestamp)

    const persisted: PersistedEvent = {
      eventId,
      timestamp,
      source: event.source,
      type: event.type,
      payload: event,
      sequence,
    }

    // Append the event as a JSON line.
    const data = Buffer.from(JSON.stringify(persisted) + '\n', 'utf-8')
    await this.adapter.append(this.eventKey, data)

    // Update metadata.
    this.nextSequence = sequence + 1
    await this.adapter.write(this.metaKey, Buffer.from(JSON.stringify({ nextSequence: this.nextSequence }), 'utf-8'))

    return eventId
  }

  // async: implements EventStore interface (Promise<PersistedEvent[]>)
  async getSince(eventId: EventId, limit?: number): Promise<PersistedEvent[]> {
    const all = await this.readAllEvents()
    const idx = all.findIndex((e) => e.eventId === eventId)
    if (idx === -1) {
      return limit !== undefined ? all.slice(0, limit) : all
    }
    const after = all.slice(idx + 1)
    return limit !== undefined ? after.slice(0, limit) : after
  }

  // async: implements EventStore interface (Promise<PersistedEvent[]>)
  async getBySession(sessionId: string, limit?: number): Promise<PersistedEvent[]> {
    const all = await this.readAllEvents()
    const matching = all.filter((e) => {
      const payload = e.payload as { sessionId?: string }
      return payload.sessionId === sessionId
    })
    return limit !== undefined ? matching.slice(0, limit) : matching
  }

  // async: implements EventStore interface (Promise<PersistedEvent[]>)
  async getByModule(moduleId: string, limit?: number): Promise<PersistedEvent[]> {
    const all = await this.readAllEvents()
    const matching = all.filter((e) => e.source === moduleId)
    return limit !== undefined ? matching.slice(0, limit) : matching
  }

  // async: implements EventStore interface (Promise<PersistedEvent[]>)
  async getByType(eventType: string, limit?: number): Promise<PersistedEvent[]> {
    const all = await this.readAllEvents()
    const matching = all.filter((e) => e.type === eventType)
    return limit !== undefined ? matching.slice(0, limit) : matching
  }

  // async: implements EventStore interface (Promise<PersistedEvent[]>)
  async getByExecution(executionId: string, limit?: number): Promise<PersistedEvent[]> {
    const all = await this.readAllEvents()
    const matching = all.filter((e) => {
      const payload = e.payload as { executionId?: string }
      return payload.executionId === executionId
    })
    return limit !== undefined ? matching.slice(0, limit) : matching
  }

  // async: implements EventStore interface (Promise<PersistedEvent | null>)
  async getLastEvent(): Promise<PersistedEvent | null> {
    const all = await this.readAllEvents()
    if (all.length === 0) return null
    return all[all.length - 1] ?? null
  }

  // async: implements EventStore interface (Promise<number>)
  async getEventCount(): Promise<number> {
    const all = await this.readAllEvents()
    return all.length
  }

  // ── Replay ───────────────────────────────────────────────────────────

  /**
   * Replay events since a given event ID, invoking the handler for each.
   */
  async replay(sinceId: EventId, handler: (event: PersistedEvent) => Promise<void>): Promise<number> {
    const events = await this.getSince(sinceId)
    for (const event of events) {
      await handler(event)
    }
    return events.length
  }

  // ── Private ──────────────────────────────────────────────────────────

  /**
   * Read all events from the event log file.
   *
   * This is a full scan — acceptable for the filesystem adapter where
   * event counts are bounded by maxEventLogSize.
   */
  private async readAllEvents(): Promise<PersistedEvent[]> {
    const buffer = await this.adapter.read(this.eventKey)
    if (!buffer) return []

    const content = buffer.toString('utf-8')
    const lines = content.split('\n').filter((l) => l.trim().length > 0)

    return lines.map((line) => JSON.parse(line) as PersistedEvent)
  }
}

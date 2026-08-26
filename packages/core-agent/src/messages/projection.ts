import type { HistoryItem, Message, RawMessage } from './types'

/**
 * Union of projection payloads accepted by the generic message projection pipeline.
 */
export type Projection
  = ProjectionCompactedHistory
    | ProjectionDomainEvent
    | ProjectionSessionUserTurn
    | ProjectionSparkCommand
    | ProjectionSparkNotify

/**
 * Projection payload for one already-compacted history block.
 */
export interface ProjectionCompactedHistory {
  id: string
  items: HistoryItem[]
  metadata?: Record<string, unknown>
  source?: string
  summary?: string
  type: 'compacted-history'
}

/**
 * Projection payload for one structured domain event.
 */
export interface ProjectionDomainEvent {
  domain: string
  id: string
  metadata?: Record<string, unknown>
  name?: string
  payload: Record<string, unknown>
  type: 'domain-event'
}

/**
 * Projection payload for one user-authored session turn.
 */
export interface ProjectionSessionUserTurn {
  content: string
  id: string
  metadata?: Record<string, unknown>
  type: 'session-user-turn'
}

/**
 * Projection payload for one `spark:command` event.
 */
export interface ProjectionSparkCommand {
  ack?: string
  commandId: string
  destinations: string[]
  guidance?: Record<string, unknown>
  id: string
  intent?: string
  metadata?: Record<string, unknown>
  parentEventId?: string
  source?: string
  type: 'spark-command'
}

/**
 * Projection payload for one `spark:notify` event.
 */
export interface ProjectionSparkNotify {
  destinations: string[]
  headline: string
  id: string
  metadata?: Record<string, unknown>
  note?: string
  payload?: Record<string, unknown>
  source: string
  type: 'spark-notify'
}

/**
 * Projects raw or structured entries into a single ordered conversation list.
 *
 * Use when:
 * - Building a full provider prompt from session messages and structured projections
 * - Appending projected session, spark, or domain events to history
 *
 * Expects:
 * - Inputs already ordered by the caller
 *
 * Returns:
 * - The original entries followed by projection-derived entries
 */
export function projectConversationEntries(input: {
  entries: Array<Message | RawMessage>
  projections: Projection[]
}): Array<Message | RawMessage> {
  return [
    ...input.entries,
    ...input.projections.flatMap(projectProjection),
  ]
}

/**
 * Converts a projection into one or more conversation entries.
 *
 * Use when:
 * - You need to append structured projection output to a conversation stream
 * - You want a single projection pipeline to handle session, spark, and domain inputs
 *
 * Expects:
 * - Projection payloads to already be normalized
 *
 * Returns:
 * - Provider-ready raw messages or structured messages in stable order
 */
export function projectProjection(projection: Projection): Array<Message | RawMessage> {
  if (projection.type === 'session-user-turn') {
    return [{
      content: projection.content,
      metadata: projection.metadata,
      role: 'user',
    }]
  }

  if (projection.type === 'compacted-history') {
    return [{
      id: projection.id,
      metadata: projection.metadata,
      role: 'event',
      segments: [
        toSummarySegment(projection.summary ?? 'Compacted history block.'),
        {
          compacted: true,
          items: projection.items,
          type: 'history-block',
        },
      ],
      source: projection.source,
    }]
  }

  if (projection.type === 'domain-event') {
    return [{
      id: projection.id,
      metadata: projection.metadata,
      role: 'event',
      segments: [
        toDomainEventSegment(projection.name ?? projection.domain, projection.payload),
        toReferenceSegment('domain', projection.domain, projection.name),
      ],
      source: projection.domain,
    }]
  }

  if (projection.type === 'spark-notify') {
    return [{
      id: projection.id,
      metadata: projection.metadata,
      role: 'event',
      segments: [
        toInstructionSegment(`Handle spark notify from ${projection.source}.`),
        toTaggedTextSegment(
          'spark-notify',
          [
            `Headline: ${projection.headline}.`,
            projection.note ? `Note: ${projection.note}` : undefined,
            projection.payload ? `Payload: ${JSON.stringify(projection.payload, null, 2)}` : undefined,
            projection.destinations.length > 0 ? `Destinations: ${projection.destinations.join(', ')}.` : undefined,
          ].filter(Boolean).join('\n'),
        ),
        toReferenceSegment('source', projection.source),
      ],
      source: projection.source,
    }]
  }

  return [{
    id: projection.id,
    metadata: projection.metadata,
    role: 'event',
    segments: [
      toInstructionSegment(`Execute spark command ${projection.commandId}.`, 'high'),
      toTaggedTextSegment(
        'spark-command',
        [
          projection.source ? `Source: ${projection.source}.` : undefined,
          projection.parentEventId ? `Parent event: ${projection.parentEventId}.` : undefined,
          projection.intent ? `Intent: ${projection.intent}.` : undefined,
          projection.ack ? `Ack: ${projection.ack}.` : undefined,
          projection.guidance ? `Guidance: ${JSON.stringify(projection.guidance, null, 2)}` : undefined,
          projection.destinations.length > 0 ? `Destinations: ${projection.destinations.join(', ')}.` : undefined,
        ].filter(Boolean).join('\n'),
      ),
      toStateSnapshotSegment('spark-command', {
        commandId: projection.commandId,
        destinations: projection.destinations,
        parentEventId: projection.parentEventId,
      }),
    ],
    source: projection.source,
  }]
}

function toDomainEventSegment(eventType: string, payload: Record<string, unknown>) {
  return {
    eventType,
    payload,
    type: 'domain-event',
  } as const
}

function toInstructionSegment(text: string, priority?: 'critical' | 'high' | 'low' | 'normal') {
  return {
    priority,
    text,
    type: 'instruction',
  } as const
}

function toReferenceSegment(refType: string, targetId: string, note?: string) {
  return {
    note,
    refType,
    targetId,
    type: 'reference',
  } as const
}

function toStateSnapshotSegment(stateType: string, payload: Record<string, unknown>) {
  return {
    payload,
    stateType,
    type: 'state-snapshot',
  } as const
}

function toSummarySegment(text: string, metadata?: Record<string, unknown>) {
  return {
    metadata,
    text,
    type: 'summary',
  } as const
}

function toTaggedTextSegment(tag: string, text: string) {
  return {
    tag,
    text,
    type: 'tagged-text',
  } as const
}

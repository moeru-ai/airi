import type { HistoryItem, Message, RawMessage } from './types'

/**
 * Projection payload for one user-authored session turn.
 */
export interface ProjectionSessionUserTurn {
  type: 'session-user-turn'
  id: string
  content: string
  metadata?: Record<string, unknown>
}

/**
 * Projection payload for one `spark:notify` event.
 */
export interface ProjectionSparkNotify {
  type: 'spark-notify'
  id: string
  source: string
  headline: string
  note?: string
  payload?: Record<string, unknown>
  destinations: string[]
  metadata?: Record<string, unknown>
}

/**
 * Projection payload for one `spark:command` event.
 */
export interface ProjectionSparkCommand {
  type: 'spark-command'
  id: string
  source?: string
  commandId: string
  parentEventId?: string
  intent?: string
  ack?: string
  destinations: string[]
  guidance?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

/**
 * Projection payload for one structured domain event.
 */
export interface ProjectionDomainEvent {
  type: 'domain-event'
  id: string
  domain: string
  name?: string
  payload: Record<string, unknown>
  metadata?: Record<string, unknown>
}

/**
 * Projection payload for one already-compacted history block.
 */
export interface ProjectionCompactedHistory {
  type: 'compacted-history'
  id: string
  source?: string
  summary?: string
  items: HistoryItem[]
  metadata?: Record<string, unknown>
}

/**
 * Union of projection payloads accepted by the generic message projection pipeline.
 */
export type Projection
  = ProjectionSessionUserTurn
    | ProjectionSparkNotify
    | ProjectionSparkCommand
    | ProjectionDomainEvent
    | ProjectionCompactedHistory

function toInstructionSegment(text: string, priority?: 'low' | 'normal' | 'high' | 'critical') {
  return {
    type: 'instruction',
    text,
    priority,
  } as const
}

function toTaggedTextSegment(tag: string, text: string) {
  return {
    type: 'tagged-text',
    tag,
    text,
  } as const
}

function toDomainEventSegment(eventType: string, payload: Record<string, unknown>) {
  return {
    type: 'domain-event',
    eventType,
    payload,
  } as const
}

function toStateSnapshotSegment(stateType: string, payload: Record<string, unknown>) {
  return {
    type: 'state-snapshot',
    stateType,
    payload,
  } as const
}

function toSummarySegment(text: string, metadata?: Record<string, unknown>) {
  return {
    type: 'summary',
    text,
    metadata,
  } as const
}

function toReferenceSegment(refType: string, targetId: string, note?: string) {
  return {
    type: 'reference',
    refType,
    targetId,
    note,
  } as const
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
      role: 'user',
      content: projection.content,
      metadata: projection.metadata,
    }]
  }

  if (projection.type === 'compacted-history') {
    return [{
      id: projection.id,
      role: 'event',
      source: projection.source,
      segments: [
        toSummarySegment(projection.summary ?? 'Compacted history block.'),
        {
          type: 'history-block',
          compacted: true,
          items: projection.items,
        },
      ],
      metadata: projection.metadata,
    }]
  }

  if (projection.type === 'domain-event') {
    return [{
      id: projection.id,
      role: 'event',
      source: projection.domain,
      segments: [
        toDomainEventSegment(projection.name ?? projection.domain, projection.payload),
        toReferenceSegment('domain', projection.domain, projection.name),
      ],
      metadata: projection.metadata,
    }]
  }

  if (projection.type === 'spark-notify') {
    return [{
      id: projection.id,
      role: 'event',
      source: projection.source,
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
      metadata: projection.metadata,
    }]
  }

  return [{
    id: projection.id,
    role: 'event',
    source: projection.source,
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
        parentEventId: projection.parentEventId,
        destinations: projection.destinations,
      }),
    ],
    metadata: projection.metadata,
  }]
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

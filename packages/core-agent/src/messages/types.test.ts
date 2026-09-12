import type { StreamEvent } from '../types/llm'
import type { ProjectionEntry } from './turns'
import type {
  HistoryItem,
  RawMessage,
  SegmentDomainEvent,
  SegmentHistoryBlock,
  SegmentInstruction,
  SegmentReference,
  SegmentStateSnapshot,
  SegmentSummary,
  SegmentTaggedText,
  SegmentText,
} from './types'

import { describe, expect, expectTypeOf, it } from 'vitest'

describe('message types', () => {
  it('supports structured history blocks and provider-ready raw messages', () => {
    const history: HistoryItem[] = [
      {
        type: 'turn',
        turnType: 'chess',
        turnIndex: 1,
        actor: 'player',
        action: {
          kind: 'move-played',
          san: 'e4',
        },
      },
      {
        type: 'reaction',
        reactionType: 'spark-command',
        text: 'Good move.',
      },
      {
        type: 'domain-event',
        eventType: 'board-updated',
        payload: {
          fen: 'startpos',
        },
      },
    ]

    const segments: Array<
      SegmentText
      | SegmentInstruction
      | SegmentTaggedText
      | SegmentDomainEvent
      | SegmentStateSnapshot
      | SegmentHistoryBlock
      | SegmentSummary
      | SegmentReference
    > = [
      {
        type: 'instruction',
        text: 'Explain the current board state.',
        priority: 'high',
      },
      {
        type: 'tagged-text',
        tag: 'agent_spark_command_reaction',
        text: 'Good move.',
      },
      {
        type: 'domain-event',
        eventType: 'board-updated',
        payload: {
          fen: 'startpos',
        },
      },
      {
        type: 'state-snapshot',
        stateType: 'board',
        payload: {
          fen: 'startpos',
        },
      },
      {
        type: 'summary',
        text: 'Older chess turns compacted.',
      },
      {
        type: 'reference',
        refType: 'turn',
        targetId: 'turn-1',
        note: 'Latest paired move',
      },
      {
        type: 'history-block',
        compacted: false,
        items: history,
      },
    ]

    const structuredMessage: ProjectionEntry = {
      id: 'msg-1',
      role: 'event',
      source: 'plugin:airi-plugin-game-chess',
      segments,
      metadata: {
        domain: 'chess',
      },
    }

    const rawMessage: RawMessage = {
      role: 'user',
      content: 'continue',
      metadata: {
        source: 'session',
      },
    }

    const historyBlock = structuredMessage.segments[6] as SegmentHistoryBlock
    expect(structuredMessage.segments).toHaveLength(7)
    expect(structuredMessage.segments[0].type).toBe('instruction')
    expect(structuredMessage.segments[1].type).toBe('tagged-text')
    expect(structuredMessage.segments[2].type).toBe('domain-event')
    expect(structuredMessage.segments[3].type).toBe('state-snapshot')
    expect(structuredMessage.segments[4].type).toBe('summary')
    expect(structuredMessage.segments[5].type).toBe('reference')
    expect(structuredMessage.segments[6].type).toBe('history-block')
    expect(historyBlock.items).toHaveLength(3)
    expect(rawMessage.role).toBe('user')
    expect(rawMessage.content).toBe('continue')
  })
})

it('rejects invalid role, content, and event combinations at compile time', () => {
  expectTypeOf<StreamEvent>().not.toBeAny()
  expectTypeOf<ProjectionEntry>().not.toBeAny()
  // @ts-expect-error Users cannot invoke tools.
  const user: ProjectionEntry = { id: 'u', role: 'user', segments: [{ type: 'tool-call', callId: 'c', name: 'f', arguments: '{}' }] }
  // @ts-expect-error A file must have a source.
  const file: ProjectionEntry = { id: 'u', role: 'user', segments: [{ type: 'file' }] }
  // @ts-expect-error Tool messages require correlated results.
  const tool: ProjectionEntry = { id: 't', role: 'tool', segments: [{ type: 'text', text: 'result' }] }
  // @ts-expect-error Events must belong to the declared union.
  const event: StreamEvent = { type: 'made-up-event' }
  void [user, file, tool, event]
})

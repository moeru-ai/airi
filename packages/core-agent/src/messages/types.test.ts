import type {
  HistoryItem,
  Message,
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

import { describe, expect, it } from 'vitest'

describe('message types', () => {
  it('supports structured history blocks and provider-ready raw messages', () => {
    const history: HistoryItem[] = [
      {
        action: {
          kind: 'move-played',
          san: 'e4',
        },
        actor: 'player',
        turnIndex: 1,
        turnType: 'chess',
        type: 'turn',
      },
      {
        reactionType: 'spark-command',
        text: 'Good move.',
        type: 'reaction',
      },
      {
        eventType: 'board-updated',
        payload: {
          fen: 'startpos',
        },
        type: 'domain-event',
      },
    ]

    const segments: Array<
      SegmentDomainEvent
      | SegmentHistoryBlock
      | SegmentInstruction
      | SegmentReference
      | SegmentStateSnapshot
      | SegmentSummary
      | SegmentTaggedText
      | SegmentText
    > = [
      {
        priority: 'high',
        text: 'Explain the current board state.',
        type: 'instruction',
      },
      {
        tag: 'agent_spark_command_reaction',
        text: 'Good move.',
        type: 'tagged-text',
      },
      {
        eventType: 'board-updated',
        payload: {
          fen: 'startpos',
        },
        type: 'domain-event',
      },
      {
        payload: {
          fen: 'startpos',
        },
        stateType: 'board',
        type: 'state-snapshot',
      },
      {
        text: 'Older chess turns compacted.',
        type: 'summary',
      },
      {
        note: 'Latest paired move',
        refType: 'turn',
        targetId: 'turn-1',
        type: 'reference',
      },
      {
        compacted: false,
        items: history,
        type: 'history-block',
      },
    ]

    const structuredMessage: Message = {
      id: 'msg-1',
      metadata: {
        domain: 'chess',
      },
      role: 'event',
      segments,
      source: 'plugin:airi-plugin-game-chess',
    }

    const rawMessage: RawMessage = {
      content: 'continue',
      metadata: {
        source: 'session',
      },
      role: 'user',
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

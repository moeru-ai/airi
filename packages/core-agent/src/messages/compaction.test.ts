import type { Message, RawMessage } from './types'

import { describe, expect, it } from 'vitest'

import { compactConversationEntries } from './compaction'

describe('compactConversationEntries', () => {
  it('compacts older chess turns while preserving recent move-reaction pairs', () => {
    const result = compactConversationEntries({
      entries: [
        {
          role: 'user',
          content: 'weather?',
        } satisfies RawMessage,
        {
          id: 'history-1',
          role: 'event',
          segments: [
            {
              type: 'history-block',
              compacted: false,
              items: [
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
                  text: 'Hmm.',
                },
                {
                  type: 'turn',
                  turnType: 'chess',
                  turnIndex: 2,
                  actor: 'assistant',
                  action: {
                    kind: 'move-executed',
                    san: 'e5',
                  },
                },
                {
                  type: 'reaction',
                  reactionType: 'spark-command',
                  text: 'Let us answer.',
                },
                {
                  type: 'domain-event',
                  eventType: 'board-updated',
                  payload: {
                    fen: 'startpos',
                  },
                },
              ],
            },
          ],
        } satisfies Message,
      ],
      recentTurnLimit: 1,
    })

    expect(result).toHaveLength(2)
    expect(JSON.stringify(result)).toContain('Let us answer.')
    expect(JSON.stringify(result)).toContain('compacted')
    expect(JSON.stringify(result)).toContain('board-updated')
  })
})

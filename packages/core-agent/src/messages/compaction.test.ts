import type { Message, RawMessage } from './types'

import { describe, expect, it } from 'vitest'

import { compactConversationEntries } from './compaction'

describe('compactConversationEntries', () => {
  it('compacts older chess turns while preserving recent move-reaction pairs', () => {
    const result = compactConversationEntries({
      entries: [
        {
          content: 'weather?',
          role: 'user',
        } satisfies RawMessage,
        {
          id: 'history-1',
          role: 'event',
          segments: [
            {
              compacted: false,
              items: [
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
                  text: 'Hmm.',
                  type: 'reaction',
                },
                {
                  action: {
                    kind: 'move-executed',
                    san: 'e5',
                  },
                  actor: 'assistant',
                  turnIndex: 2,
                  turnType: 'chess',
                  type: 'turn',
                },
                {
                  reactionType: 'spark-command',
                  text: 'Let us answer.',
                  type: 'reaction',
                },
                {
                  eventType: 'board-updated',
                  payload: {
                    fen: 'startpos',
                  },
                  type: 'domain-event',
                },
              ],
              type: 'history-block',
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

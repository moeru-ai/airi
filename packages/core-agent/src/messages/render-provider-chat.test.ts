import type { Message, RawMessage } from './types'

import { describe, expect, it } from 'vitest'

import { renderProviderChatMessages } from './render-provider-chat'

describe('renderProviderChatMessages', () => {
  it('renders structured event messages into raw provider chat messages', () => {
    const entries: Array<Message | RawMessage> = [
      {
        role: 'system',
        content: 'system prompt',
      },
      {
        id: 'event-1',
        role: 'event',
        source: 'plugin:airi-plugin-game-chess',
        segments: [
          {
            type: 'instruction',
            text: 'Keep the reply short.',
            priority: 'critical',
          },
          {
            type: 'text',
            text: 'Chess update',
          },
          {
            type: 'tagged-text',
            tag: 'agent_spark_command_reaction',
            text: 'Move accepted.',
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
            type: 'history-block',
            compacted: true,
            items: [
              {
                type: 'summary',
                text: 'Compacted history.',
                fromTurnIndex: 1,
                toTurnIndex: 3,
              },
              {
                type: 'turn',
                turnType: 'chess',
                turnIndex: 3,
                actor: 'assistant',
                action: {
                  kind: 'move-executed',
                  san: 'e5',
                },
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
          {
            type: 'summary',
            text: 'Earlier turns compacted.',
            metadata: {
              span: 2,
            },
          },
          {
            type: 'reference',
            refType: 'turn',
            targetId: 'turn-2',
            note: 'Recent move',
          },
        ],
      },
    ]

    const rendered = renderProviderChatMessages({
      entries,
      mode: 'session-spark-notify',
    })

    expect(rendered).toHaveLength(2)
    expect(rendered[0].content).toBe('system prompt')
    expect(rendered[1].role).toBe('system')
    expect(rendered[1].content).toContain('Instruction [critical]:')
    expect(rendered[1].content).toContain('<agent_spark_command_reaction>Move accepted.</agent_spark_command_reaction>')
    expect(rendered[1].content).toContain('Domain event: board-updated')
    expect(rendered[1].content).toContain('State snapshot: board')
    expect(rendered[1].content).toContain('Summary:')
    expect(rendered[1].content).toContain('Reference: turn -> turn-2')
  })
})

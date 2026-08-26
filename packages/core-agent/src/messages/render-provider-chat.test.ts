import type { Message, RawMessage } from './types'

import { describe, expect, it } from 'vitest'

import { renderProviderChatMessages } from './render-provider-chat'

describe('renderProviderChatMessages', () => {
  it('renders structured event messages into raw provider chat messages', () => {
    const entries: Array<Message | RawMessage> = [
      {
        content: 'system prompt',
        role: 'system',
      },
      {
        id: 'event-1',
        role: 'event',
        segments: [
          {
            priority: 'critical',
            text: 'Keep the reply short.',
            type: 'instruction',
          },
          {
            text: 'Chess update',
            type: 'text',
          },
          {
            tag: 'agent_spark_command_reaction',
            text: 'Move accepted.',
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
            compacted: true,
            items: [
              {
                fromTurnIndex: 1,
                text: 'Compacted history.',
                toTurnIndex: 3,
                type: 'summary',
              },
              {
                action: {
                  kind: 'move-executed',
                  san: 'e5',
                },
                actor: 'assistant',
                turnIndex: 3,
                turnType: 'chess',
                type: 'turn',
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
          {
            metadata: {
              span: 2,
            },
            text: 'Earlier turns compacted.',
            type: 'summary',
          },
          {
            note: 'Recent move',
            refType: 'turn',
            targetId: 'turn-2',
            type: 'reference',
          },
        ],
        source: 'plugin:airi-plugin-game-chess',
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

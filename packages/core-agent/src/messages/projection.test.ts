import type { Message, RawMessage } from './types'

import { describe, expect, it } from 'vitest'

import { projectConversationEntries, projectProjection } from './projection'

describe('projectProjection', () => {
  it('projects a domain event into a structured event message', () => {
    const result = projectProjection({
      type: 'domain-event',
      id: 'event-1',
      domain: 'chess',
      name: 'move-resolved',
      payload: {
        moveSan: 'e4',
      },
    })

    expect(result).toHaveLength(1)
    const projected = result[0] as Message
    expect(projected.role).toBe('event')
    expect(projected.segments[0].type).toBe('domain-event')
    expect(projected.segments[1].type).toBe('reference')
  })
})

describe('projectConversationEntries', () => {
  it('keeps existing entries before projected entries', () => {
    const entries: Array<Message | RawMessage> = [
      {
        role: 'system',
        content: 'system',
      },
    ]

    const result = projectConversationEntries({
      entries,
      projections: [
        {
          type: 'session-user-turn',
          id: 'turn-1',
          content: 'hello',
        },
      ],
    })

    expect(result).toHaveLength(2)
    expect(result[0]).toBe(entries[0])
    expect(result[1].role).toBe('user')
  })

  it('projects spark notify and command payloads into structured segments', () => {
    const result = projectConversationEntries({
      entries: [],
      projections: [
        {
          type: 'spark-notify',
          id: 'notify-1',
          source: 'plugin:airi-plugin-game-chess',
          headline: 'chess update',
          note: 'Project a board update',
          payload: {
            fen: 'startpos',
          },
          destinations: ['character'],
        },
        {
          type: 'spark-command',
          id: 'command-1',
          source: 'plugin:airi-plugin-game-chess',
          commandId: 'command-1',
          parentEventId: 'notify-1',
          intent: 'action',
          ack: 'play e5',
          destinations: ['character'],
        },
      ],
    })

    expect(result).toHaveLength(2)
    const notify = result[0] as Message
    const command = result[1] as Message
    expect(notify.segments[0].type).toBe('instruction')
    expect(notify.segments[1].type).toBe('tagged-text')
    expect(notify.segments[2].type).toBe('reference')
    expect(command.segments[0].type).toBe('instruction')
    expect(command.segments[1].type).toBe('tagged-text')
    expect(command.segments[2].type).toBe('state-snapshot')
  })
})

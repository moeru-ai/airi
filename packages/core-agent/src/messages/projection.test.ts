import type { Message, RawMessage } from './types'

import { describe, expect, it } from 'vitest'

import { projectConversationEntries, projectProjection } from './projection'

describe('projectProjection', () => {
  it('projects a domain event into a structured event message', () => {
    const result = projectProjection({
      domain: 'chess',
      id: 'event-1',
      name: 'move-resolved',
      payload: {
        moveSan: 'e4',
      },
      type: 'domain-event',
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
        content: 'system',
        role: 'system',
      },
    ]

    const result = projectConversationEntries({
      entries,
      projections: [
        {
          content: 'hello',
          id: 'turn-1',
          type: 'session-user-turn',
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
          destinations: ['character'],
          headline: 'chess update',
          id: 'notify-1',
          note: 'Project a board update',
          payload: {
            fen: 'startpos',
          },
          source: 'plugin:airi-plugin-game-chess',
          type: 'spark-notify',
        },
        {
          ack: 'play e5',
          commandId: 'command-1',
          destinations: ['character'],
          id: 'command-1',
          intent: 'action',
          parentEventId: 'notify-1',
          source: 'plugin:airi-plugin-game-chess',
          type: 'spark-command',
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

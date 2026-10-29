import type { GenerateText } from '../generate-text'

import { describe, expect, it, vi } from 'vitest'

import { createMemoryFinalizerAgent, parseMemoryFinalizerReply } from '.'

describe('parseMemoryFinalizerReply', () => {
  it('reads the entries JSON, also inside a Markdown code fence', () => {
    expect(parseMemoryFinalizerReply('{"entries": []}')).toEqual([])
    expect(parseMemoryFinalizerReply('```json\n{"entries": [{"id": "Vx3k", "description": "Lives in Bangkok", "body": "Has lived in Bangkok for years."}]}\n```'))
      .toEqual([{ id: 'Vx3k', description: 'Lives in Bangkok', body: 'Has lived in Bangkok for years.' }])
  })

  it('reads a new fact with a null id, or with no id', () => {
    expect(parseMemoryFinalizerReply('{"entries": [{"id": null, "description": "Uses an M1 Pro", "body": "Still uses an M1 Pro."}, {"description": "Stays up late", "body": "Likes staying up late."}]}'))
      .toEqual([
        { id: null, description: 'Uses an M1 Pro', body: 'Still uses an M1 Pro.' },
        { id: null, description: 'Stays up late', body: 'Likes staying up late.' },
      ])
  })

  it('rejects a reply that is not the entries JSON', () => {
    expect(() => parseMemoryFinalizerReply('nothing to save')).toThrow()
    expect(() => parseMemoryFinalizerReply('{"entries": [{"id": null, "description": "", "body": "x"}]}')).toThrow()
  })
})

describe('createMemoryFinalizerAgent', () => {
  // A written entry replaces the old one, so the model needs the old bodies to keep their facts.
  it('sends the remembered entries with their bodies and the turn as data, and reads the reply', async () => {
    const generateText = vi.fn<GenerateText>(async () => '{"entries": []}')
    const agent = createMemoryFinalizerAgent({ generateText })
    const turn = {
      ownMemories: [{ id: 'Vx3k', description: 'Food', body: 'Allergic to peanuts. Eats no meat.' }],
      generalMemories: [{ id: 'Qw8e', description: 'Lives in Bangkok', body: 'Has lived in Bangkok for years.' }],
      userText: 'I stopped eating dairy too.',
      assistantText: 'Noted.',
      time: '[2026-10-29 23:40]',
    }

    await expect(agent.collect(turn, new AbortController().signal)).resolves.toEqual([])
    expect(generateText.mock.calls[0]?.[0]).toMatchObject({ turns: [
      { type: 'system' },
      { type: 'user', content: [{ text: JSON.stringify({ ownMemories: turn.ownMemories, generalMemories: turn.generalMemories, time: turn.time, user: turn.userText, character: turn.assistantText }) }] },
    ] })
  })
})

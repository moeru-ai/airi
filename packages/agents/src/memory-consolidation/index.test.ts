import type { GenerateText } from '../generate-text'

import { describe, expect, it, vi } from 'vitest'

import { createMemoryConsolidationAgent, parseMemoryConsolidationReply } from '.'

const entries = [
  { id: 'a', description: 'Uses an M1 Pro', body: 'Still uses an M1 Pro.' },
  { id: 'b', description: 'Has not changed computers for long', body: 'Has not changed computers for a long time.' },
  { id: 'c', description: 'Dislikes the iPhone Duo design', body: 'Finds the iPhone Duo ugly.' },
]

const merged = {
  entries: [
    { ids: ['a', 'b'], description: 'Still on an M1 Pro', body: 'Has used an M1 Pro for a long time.' },
    { ids: ['c'], description: 'Dislikes the iPhone Duo design', body: 'Finds the iPhone Duo ugly.' },
  ],
}

describe('parseMemoryConsolidationReply', () => {
  it('reads merged and kept entries, also inside a Markdown code fence', () => {
    expect(parseMemoryConsolidationReply(`\`\`\`json\n${JSON.stringify(merged)}\n\`\`\``, entries)).toEqual(merged.entries)
  })

  it('rejects a reply that names an unknown id, names one id twice, or loses an entry', () => {
    expect(() => parseMemoryConsolidationReply('{"entries": [{"ids": ["a", "b", "c", "z"], "description": "x", "body": "x"}]}', entries)).toThrow()
    expect(() => parseMemoryConsolidationReply('{"entries": [{"ids": ["a", "c"], "description": "x", "body": "x"}, {"ids": ["a", "b"], "description": "y", "body": "y"}]}', entries)).toThrow()
    // A tidy-up sees no conversation, so it cannot know that a fact no longer holds.
    expect(() => parseMemoryConsolidationReply('{"entries": [{"ids": ["a", "b"], "description": "x", "body": "x"}]}', entries)).toThrow()
    expect(() => parseMemoryConsolidationReply('tidied', entries)).toThrow()
  })
})

describe('createMemoryConsolidationAgent', () => {
  it('sends the entries as data, and reads the reply', async () => {
    const generateText = vi.fn<GenerateText>(async () => JSON.stringify(merged))
    const agent = createMemoryConsolidationAgent({ generateText })

    await expect(agent.consolidate(entries, new AbortController().signal)).resolves.toEqual(merged.entries)
    expect(generateText.mock.calls[0]?.[0]).toMatchObject({ turns: [
      { type: 'system' },
      { type: 'user', content: [{ text: JSON.stringify({ entries }) }] },
    ] })
  })
})

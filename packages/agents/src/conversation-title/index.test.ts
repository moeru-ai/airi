import type { GenerateText } from '../generate-text'

import { describe, expect, it, vi } from 'vitest'

import { CONVERSATION_TITLE_MAX_LENGTH, createConversationTitleAgent, parseConversationTitle } from '.'

describe('parseConversationTitle', () => {
  it('reads the title, also inside a Markdown code fence', () => {
    expect(parseConversationTitle('{"title": "Moon landing"}')).toBe('Moon landing')
    expect(parseConversationTitle('```json\n{"title": "Moon landing"}\n```')).toBe('Moon landing')
  })

  it('collapses whitespace and removes quotation marks around the title', () => {
    expect(parseConversationTitle('{"title": "  \\"Moon\\n landing\\"  "}')).toBe('Moon landing')
    expect(parseConversationTitle('{"title": "「月球登陆」"}')).toBe('月球登陆')
  })

  it('rejects a reply that is not a title object', () => {
    expect(() => parseConversationTitle('Moon landing')).toThrow()
    expect(() => parseConversationTitle('{"name": "Moon landing"}')).toThrow()
    expect(() => parseConversationTitle('{"title": 1}')).toThrow()
  })

  it('rejects a title over the length limit', () => {
    expect(() => parseConversationTitle(JSON.stringify({ title: 'a'.repeat(CONVERSATION_TITLE_MAX_LENGTH + 1) }))).toThrow()
  })
})

describe('createConversationTitleAgent', () => {
  it('sends the first exchange as JSON and reads the title', async () => {
    const generateText = vi.fn<GenerateText>(async () => '{"title": "Moon landing"}')
    const agent = createConversationTitleAgent({ generateText })

    await expect(agent.name({ userMessage: 'Tell me about the moon landing.', reply: 'It was in 1969.' }, new AbortController().signal)).resolves.toBe('Moon landing')
    expect(generateText.mock.calls[0]?.[0]).toMatchObject({ turns: [
      { type: 'system' },
      { type: 'user', content: [{ text: '{"userMessage":"Tell me about the moon landing.","reply":"It was in 1969."}' }] },
    ] })
  })

  it('cuts long messages before the request', async () => {
    const generateText = vi.fn<GenerateText>(async () => '{"title": "Long paste"}')
    const agent = createConversationTitleAgent({ generateText })

    await agent.name({ userMessage: 'a'.repeat(5000), reply: 'b'.repeat(5000) }, new AbortController().signal)

    expect(generateText.mock.calls[0]?.[0]).toMatchObject({ turns: [
      { type: 'system' },
      { type: 'user', content: [{ text: JSON.stringify({ userMessage: 'a'.repeat(1000), reply: 'b'.repeat(1000) }) }] },
    ] })
  })
})

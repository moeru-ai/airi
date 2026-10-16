import type { GenerateText } from '../generate-text'

import { describe, expect, it, vi } from 'vitest'

import { createVoiceTranscriptionRephraseAgent, parseRephrasedSegments } from '.'

describe('parseRephrasedSegments', () => {
  it('reads a JSON array, also inside a Markdown code fence', () => {
    expect(parseRephrasedSegments('["Hello.", ""]')).toEqual(['Hello.', ''])
    expect(parseRephrasedSegments('```json\n["Hello."]\n```')).toEqual(['Hello.'])
  })

  it('rejects a reply that is not an array of strings', () => {
    expect(() => parseRephrasedSegments('Hello.')).toThrow()
    expect(() => parseRephrasedSegments('{"text":"Hello."}')).toThrow()
    expect(() => parseRephrasedSegments('[1, 2]')).toThrow()
  })
})

describe('createVoiceTranscriptionRephraseAgent', () => {
  it('sends the segments as a JSON array and reads the reply', async () => {
    const generateText = vi.fn<GenerateText>(async () => '["Hello.", "World."]')
    const agent = createVoiceTranscriptionRephraseAgent({ generateText })

    await expect(agent.rephrase(['uh hello', 'world'], new AbortController().signal)).resolves.toEqual(['Hello.', 'World.'])
    expect(generateText.mock.calls[0]?.[0]).toMatchObject({ turns: [{ type: 'system' }, { type: 'user', content: [{ text: '["uh hello","world"]' }] }] })
  })
})

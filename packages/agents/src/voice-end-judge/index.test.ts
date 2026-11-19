import type { GenerateText } from '../generate-text'

import { describe, expect, it, vi } from 'vitest'

import { createVoiceEndJudgeAgent, parseEndJudgement } from '.'

describe('parseEndJudgement', () => {
  it('reads the judgement JSON, also inside a Markdown code fence', () => {
    expect(parseEndJudgement('{"complete": true}')).toBe('complete')
    expect(parseEndJudgement('```json\n{"complete": false}\n```')).toBe('incomplete')
  })

  it('rejects a reply that is not the judgement JSON', () => {
    expect(() => parseEndJudgement('complete')).toThrow()
    expect(() => parseEndJudgement('{"complete": "yes"}')).toThrow()
  })
})

describe('createVoiceEndJudgeAgent', () => {
  it('sends the transcript with the last four messages and reads the reply', async () => {
    const generateText = vi.fn<GenerateText>(async () => '{"complete": true}')
    const agent = createVoiceEndJudgeAgent({ generateText })
    const messages = ['one', 'two', 'three', 'four', 'five'].map(text => ({ role: 'user', text }))

    await expect(agent.judge('what time is it', { revision: 3, messages }, new AbortController().signal)).resolves.toBe('complete')
    expect(generateText.mock.calls[0]?.[0]).toMatchObject({ turns: [
      { type: 'system' },
      { type: 'user', content: [{ text: JSON.stringify({ previousMessages: messages.slice(1), transcript: 'what time is it' }) }] },
    ] })
  })
})

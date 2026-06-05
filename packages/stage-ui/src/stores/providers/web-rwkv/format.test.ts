import { describe, expect, it } from 'vitest'

import { buildRwkvPrompt, createThinkPrefixStripper, openAIChatChunk, openAIChatCompletion, SSE_DONE } from './format'

describe('buildRwkvPrompt', () => {
  it('wraps a single user message and ends with the fake-think Assistant opener', () => {
    expect(buildRwkvPrompt([{ role: 'user', content: 'Hi' }])).toBe('User: Hi\n\nAssistant: <think></think')
  })

  it('renders system + multi-turn history in RWKV World format', () => {
    const prompt = buildRwkvPrompt([
      { role: 'system', content: 'Be nice.' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi!' },
      { role: 'user', content: 'Bye' },
    ])
    expect(prompt).toBe('System: Be nice.\n\nUser: Hello\n\nAssistant: Hi!\n\nUser: Bye\n\nAssistant: <think></think')
  })

  it('cleans CRLF and collapses blank lines per turn', () => {
    expect(buildRwkvPrompt([{ role: 'user', content: 'a\r\n\n\nb  ' }])).toBe('User: a\nb\n\nAssistant: <think></think')
  })

  it('flattens multimodal text parts and skips empty system/user turns', () => {
    const prompt = buildRwkvPrompt([
      { role: 'system', content: '   ' },
      { role: 'user', content: [{ type: 'text', text: 'multi' }, { type: 'image_url' }] },
    ])
    expect(prompt).toBe('User: multi\n\nAssistant: <think></think')
  })
})

describe('createThinkPrefixStripper', () => {
  it('drops the leftover `>` and blank lines from whole (non-streamed) output', () => {
    const strip = createThinkPrefixStripper()
    expect(strip('>\n\nThe answer is 42.')).toBe('The answer is 42.')
  })

  it('strips the prefix across streamed chunks, then passes the rest through', () => {
    const strip = createThinkPrefixStripper()
    // The `>` and blank lines arrive split across tokens before real content.
    expect(strip('>')).toBe('')
    expect(strip('\n\n')).toBe('')
    expect(strip('Hello')).toBe('Hello')
    expect(strip(' world')).toBe(' world')
  })

  it('handles `>` and answer arriving in the same chunk', () => {
    const strip = createThinkPrefixStripper()
    expect(strip('> hi')).toBe('hi')
  })

  it('passes output through unchanged when no leading `>` is present', () => {
    const strip = createThinkPrefixStripper()
    expect(strip('Direct answer')).toBe('Direct answer')
    expect(strip(' more')).toBe(' more')
  })

  it('does not strip a `>` that appears after real content', () => {
    const strip = createThinkPrefixStripper()
    expect(strip('a > b')).toBe('a > b')
    expect(strip(' > c')).toBe(' > c')
  })
})

describe('openAIChatChunk', () => {
  it('emits an SSE data line with a chat.completion.chunk delta', () => {
    const line = openAIChatChunk('id1', 123, 'rwkv', { content: 'hello' }, null)
    expect(line.startsWith('data: ')).toBe(true)
    expect(line.endsWith('\n\n')).toBe(true)
    const parsed = JSON.parse(line.slice('data: '.length).trim())
    expect(parsed.object).toBe('chat.completion.chunk')
    expect(parsed.choices[0].delta.content).toBe('hello')
    expect(parsed.choices[0].finish_reason).toBeNull()
  })

  it('exposes the [DONE] sentinel', () => {
    expect(SSE_DONE).toBe('data: [DONE]\n\n')
  })
})

describe('openAIChatCompletion', () => {
  it('builds a non-streamed completion body with usage', () => {
    const parsed = JSON.parse(openAIChatCompletion('id2', 9, 'rwkv', 'answer', 5, 3))
    expect(parsed.object).toBe('chat.completion')
    expect(parsed.choices[0].message).toEqual({ role: 'assistant', content: 'answer' })
    expect(parsed.choices[0].finish_reason).toBe('stop')
    expect(parsed.usage).toEqual({ prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 })
  })
})

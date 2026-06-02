import type { Message } from '@xsai/shared-chat'

import { describe, expect, it } from 'vitest'

import { formatG1Prompt } from './prompt'

describe('formatG1Prompt', () => {
  /**
   * @example
   * formatG1Prompt([{ role: 'user', content: 'hi' }]).prompt // -> 'User: hi\n\nAssistant:'
   */
  it('renders a single user turn ending at the Assistant cue', () => {
    const { prompt, stop } = formatG1Prompt([{ role: 'user', content: 'hi' }])

    expect(prompt).toBe('User: hi\n\nAssistant:')
    expect(stop).toEqual(['\n\nUser:', '\n\nSystem:'])
  })

  /**
   * @example
   * formatG1Prompt([{ role: 'system', ... }, { role: 'user', ... }]).prompt
   */
  it('prefixes a system turn before the user turn', () => {
    const messages: Message[] = [
      { role: 'system', content: 'You are AIRI.' },
      { role: 'user', content: 'Hello' },
    ]

    expect(formatG1Prompt(messages).prompt).toBe('System: You are AIRI.\n\nUser: Hello\n\nAssistant:')
  })

  /**
   * @example
   * formatG1Prompt([user, assistant, user]).prompt // -> joins turns with \n\n
   */
  it('joins a multi-turn history with blank lines and re-opens Assistant', () => {
    const messages: Message[] = [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello!' },
      { role: 'user', content: 'How are you?' },
    ]

    expect(formatG1Prompt(messages).prompt).toBe(
      'User: Hi\n\nAssistant: Hello!\n\nUser: How are you?\n\nAssistant:',
    )
  })

  /**
   * @example
   * formatG1Prompt([{ role: 'user', content: 'a\r\n\n\nb  ' }]) // -> 'User: a\nb'
   */
  it('cleans system/user inputs: CRLF, collapsed blank lines, trimmed', () => {
    const { prompt } = formatG1Prompt([{ role: 'user', content: 'Line A\r\n\n\nLine B  ' }])

    expect(prompt).toBe('User: Line A\nLine B\n\nAssistant:')
  })

  /**
   * @example
   * formatG1Prompt(msgs, { think: 'think' }).prompt // -> ends with 'Assistant: <think'
   */
  it('primes a real reasoning block in think mode', () => {
    const { prompt } = formatG1Prompt([{ role: 'user', content: 'Why?' }], { think: 'think' })

    expect(prompt.endsWith('Assistant: <think')).toBe(true)
  })

  /**
   * @example
   * formatG1Prompt(msgs, { think: 'fake' }).prompt // -> ends with 'Assistant: <think>\n</think>'
   */
  it('emits an empty pre-closed block in fake-think mode', () => {
    const { prompt } = formatG1Prompt([{ role: 'user', content: 'Why?' }], { think: 'fake' })

    expect(prompt.endsWith('Assistant: <think>\n</think>')).toBe(true)
  })

  /**
   * @example
   * formatG1Prompt([{ role: 'tool', content: '{...}', tool_call_id: 't1' }])
   */
  it('folds a tool result into a User Function output turn', () => {
    const messages: Message[] = [
      { role: 'user', content: 'Weather?' },
      { role: 'tool', content: '{"temp":20}', tool_call_id: 't1' },
    ]

    expect(formatG1Prompt(messages).prompt).toBe(
      'User: Weather?\n\nUser: Function output:\n{"temp":20}\n\nAssistant:',
    )
  })

  /**
   * @example
   * formatG1Prompt([{ role: 'user', content: [textPart, imagePart] }])
   */
  it('extracts text from content parts and drops non-text parts', () => {
    const messages: Message[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Describe ' },
          { type: 'image_url', image_url: { url: 'https://example.com/a.png' } },
          { type: 'text', text: 'this' },
        ],
      },
    ]

    expect(formatG1Prompt(messages).prompt).toBe('User: Describe this\n\nAssistant:')
  })
})

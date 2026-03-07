import { describe, expect, it } from 'vitest'

import { parseMayStructuredMessage } from './send-message'

describe('parseMayStructuredMessage', () => {
  it('should return an array of messages', () => {
    const result = parseMayStructuredMessage('{"messages": ["Hello, world!"]}')
    expect(result).toMatchObject({ messages: ['Hello, world!'] })
  })

  it('should return an array of messages from multi-line input', () => {
    const result = parseMayStructuredMessage(`{"messages": [
"Hello, world!",
"Hello, world!"
]}`)
    expect(result).toMatchObject({ messages: ['Hello, world!', 'Hello, world!'] })
  })

  it('should return an array of messages from multi-line input with extra whitespace', () => {
    const result = parseMayStructuredMessage(`{"messages": [
      "Hello, world!",
      "Hello, world!"
    ]}`)
    expect(result).toMatchObject({ messages: ['Hello, world!', 'Hello, world!'] })
  })

  it('should return an object with messages and reply_to_message_id', () => {
    const result = parseMayStructuredMessage(`{"messages": [
      "Hello, world!",
      "Hello, world!"
    ], "reply_to_message_id": "1234567890"
    }`)
    expect(result).toMatchObject({ messages: ['Hello, world!', 'Hello, world!'], reply_to_message_id: '1234567890' })
  })

  it('should fall back to the original text when structured output omits messages', () => {
    const text = '{"reply_to_message_id":"1234567890"}'
    const result = parseMayStructuredMessage(text)
    expect(result).toMatchObject({ messages: [text], reply_to_message_id: '1234567890' })
  })

  it('should fall back to the original text when structured output uses a non-array messages field', () => {
    const text = '{"messages":"Hello, world!"}'
    const result = parseMayStructuredMessage(text)
    expect(result).toMatchObject({ messages: [text], reply_to_message_id: undefined })
  })

  it('should return an array of messages from multi-line elements of input', () => {
    const result = parseMayStructuredMessage(`{"messages": [
"Hello,
world!",
"Hello,
world!"
    ]}`)
    expect(result).toMatchObject({ messages: ['Hello,\nworld!', 'Hello,\nworld!'] })
  })
})

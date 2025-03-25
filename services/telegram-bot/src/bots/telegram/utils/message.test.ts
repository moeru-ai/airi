import { describe, expect, it } from 'vitest'

import { parseMayStructuredMessage } from './message'

describe('parseMayStructuredMessage', () => {
  it('should return an array of messages', () => {
    const result = parseMayStructuredMessage('["Hello, world!"]')
    expect(result).toEqual(['Hello, world!'])
  })

  it('should return an array of messages from multi-line input', () => {
    const result = parseMayStructuredMessage(`[
"Hello, world!",
"Hello, world!"
]`)
    expect(result).toEqual(['Hello, world!', 'Hello, world!'])
  })

  it('should return an array of messages from multi-line input with extra whitespace', () => {
    const result = parseMayStructuredMessage(`[
      "Hello, world!",
      "Hello, world!"
]`)
    expect(result).toEqual(['Hello, world!', 'Hello, world!'])
  })

  it('should return an array of messages from multi-line elements of input', () => {
    const result = parseMayStructuredMessage(`[
"Hello,
world!",
"Hello,
world!"
]`)
    expect(result).toEqual(['Hello,\nworld!', 'Hello,\nworld!'])
  })
})

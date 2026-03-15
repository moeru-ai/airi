/**
 * Tests for command parser
 * These are unit tests to verify the command parsing logic without running the full service
 */
import { describe, expect, it } from 'vitest'

import { parseTwitterCommand } from './command-parser'

describe('command Parser', () => {
  it('should correctly parse post tweet command', () => {
    const result = parseTwitterCommand('post tweet: Hello world')

    expect(result).not.toBeNull()
    expect(result).toMatchObject({ command: 'post tweet', content: 'Hello world' })
  })

  it('should correctly parse search tweets command', () => {
    const result = parseTwitterCommand('search tweets: javascript')

    expect(result).not.toBeNull()
    expect(result).toMatchObject({ command: 'search tweets', content: 'javascript' })
  })

  it('should correctly parse like tweet command', () => {
    const result = parseTwitterCommand('like tweet: 123456789')

    expect(result).not.toBeNull()
    expect(result).toMatchObject({ command: 'like tweet', content: '123456789' })
  })

  it('should correctly parse retweet command', () => {
    const result = parseTwitterCommand('retweet: 987654321')

    expect(result).not.toBeNull()
    expect(result).toMatchObject({ command: 'retweet', content: '987654321' })
  })

  it('should correctly parse get user command', () => {
    const result = parseTwitterCommand('get user: username')

    expect(result).not.toBeNull()
    expect(result).toMatchObject({ command: 'get user', content: 'username' })
  })

  it('should correctly parse get timeline command', () => {
    const result = parseTwitterCommand('get timeline')

    expect(result).not.toBeNull()
    expect(result).toMatchObject({ command: 'get timeline', content: '', count: 10 })
  })

  it('should handle get timeline with count parameter', () => {
    const result = parseTwitterCommand('get timeline count: 5')

    expect(result).not.toBeNull()
    expect(result).toMatchObject({ command: 'get timeline', content: 'count: 5', count: 5 })
  })

  it('should handle get timeline with count parameter and additional text', () => {
    const result = parseTwitterCommand('get timeline with extra text count: 7 and more')

    expect(result).not.toBeNull()
    expect(result).toMatchObject({ command: 'get timeline', content: 'with extra text count: 7 and more', count: 7 })
  })

  it('should handle get timeline with default count when no count is specified', () => {
    const result = parseTwitterCommand('get timeline random text')

    expect(result).not.toBeNull()
    expect(result).toMatchObject({ command: 'get timeline', content: 'random text', count: 10 })
  })

  it('should handle get timeline with count parameter containing spaces', () => {
    const result = parseTwitterCommand('get timeline count:  15  ')

    expect(result).not.toBeNull()
    expect(result).toMatchObject({ command: 'get timeline', content: 'count:  15  ', count: 15 })
  })

  it('should reject unknown commands', () => {
    const result = parseTwitterCommand('invalid command')

    expect(result).toBeNull()
  })

  it('should not match partial command prefixes', () => {
    // This should not match 'post tweet:' command because it doesn't start with that prefix
    const result = parseTwitterCommand('random text with post and tweet in it')

    expect(result).toBeNull()
  })

  it('should handle commands with mixed case', () => {
    const result = parseTwitterCommand('POST TWEET: Hello world')

    expect(result).not.toBeNull()
    expect(result).toMatchObject({ command: 'post tweet', content: 'Hello world' })
  })

  it('should not be fooled by colon in the middle of a sentence', () => {
    // This should not match because it doesn't start with a command prefix
    const result = parseTwitterCommand('I like to say: hello world')

    expect(result).toBeNull()
  })
})

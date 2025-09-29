/**
 * Tests for AiriAdapter command parsing
 * These are unit tests to verify the command parsing logic without running the full service
 */
import { describe, expect } from 'vitest'

// We'll create a simplified version to test just the command parsing logic
describe('airiAdapter Command Parsing', () => {
  it('should correctly parse post tweet command', async () => {
    const result = await parseCommand('post tweet: Hello world')

    expect(result.command).toBe('post tweet')
    expect(result.content).toBe('Hello world')
  })

  it('should correctly parse search tweets command', async () => {
    const result = await parseCommand('search tweets: javascript')

    expect(result.command).toBe('search tweets')
    expect(result.content).toBe('javascript')
  })

  it('should correctly parse like tweet command', async () => {
    const result = await parseCommand('like tweet: 123456789')

    expect(result.command).toBe('like tweet')
    expect(result.content).toBe('123456789')
  })

  it('should correctly parse retweet command', async () => {
    const result = await parseCommand('retweet: 987654321')

    expect(result.command).toBe('retweet')
    expect(result.content).toBe('987654321')
  })

  it('should correctly parse get user command', async () => {
    const result = await parseCommand('get user: username')

    expect(result.command).toBe('get user')
    expect(result.content).toBe('username')
  })

  it('should correctly parse get timeline command', async () => {
    const result = await parseCommand('get timeline')

    expect(result.command).toBe('get timeline')
  })

  it('should handle get timeline with count parameter', async () => {
    const result = await parseCommand('get timeline count: 5')

    expect(result.command).toBe('get timeline')
    expect(result.count).toBe(5)
  })

  it('should reject unknown commands', async () => {
    await expect(parseCommand('invalid command'))
      .rejects
      .toThrow('Unknown Twitter command')
  })

  it('should not match partial command prefixes', async () => {
    // This should not match 'post tweet:' command because it doesn't start with that prefix
    await expect(parseCommand('random text with post and tweet in it'))
      .rejects
      .toThrow('Unknown Twitter command')
  })

  it('should handle commands with mixed case', async () => {
    const result = await parseCommand('POST TWEET: Hello world')

    expect(result.command).toBe('post tweet')
    expect(result.content).toBe('POST TWEET: Hello world'.substring('post tweet:'.length).trim())
  })

  it('should not be fooled by colon in the middle of a sentence', async () => {
    // This should not match because it doesn't start with a command prefix
    await expect(parseCommand('I like to say: hello world'))
      .rejects
      .toThrow('Unknown Twitter command')
  })
})

// Simplified function to test just the parsing logic
async function parseCommand(input: string) {
  const normalizedInput = input.trim().toLowerCase()

  if (normalizedInput.startsWith('post tweet:')) {
    const tweetText = input.substring('post tweet:'.length).trim()
    return { command: 'post tweet', content: tweetText }
  }
  else if (normalizedInput.startsWith('search tweets:')) {
    const query = input.substring('search tweets:'.length).trim()
    return { command: 'search tweets', content: query }
  }
  else if (normalizedInput.startsWith('like tweet:')) {
    const tweetId = input.substring('like tweet:'.length).trim()
    return { command: 'like tweet', content: tweetId }
  }
  else if (normalizedInput.startsWith('retweet:')) {
    const tweetId = input.substring('retweet:'.length).trim()
    return { command: 'retweet', content: tweetId }
  }
  else if (normalizedInput.startsWith('get user:')) {
    const username = input.substring('get user:'.length).trim()
    return { command: 'get user', content: username }
  }
  else if (normalizedInput.startsWith('get timeline')) {
    const countMatch = normalizedInput.match(/count:\s*(\d+)/)
    const count = countMatch ? Number.parseInt(countMatch[1], 10) : 10
    return { command: 'get timeline', count }
  }
  else {
    throw new Error(`Unknown Twitter command: ${input}`)
  }
}

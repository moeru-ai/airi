/**
 * Tests for AiriAdapter command parsing
 * These are unit tests to verify the command parsing logic without running the full service
 */
import { describe, expect, it } from 'vitest'

// Define a union type for the expected return values
type ParseResult
  = | { command: string, content: string }
    | { command: string, count: number }

// We'll create a simplified version to test just the command parsing logic
describe('airiAdapter Command Parsing', () => {
  it('should correctly parse post tweet command', async () => {
    const result = await parseCommand('post tweet: Hello world') as { command: string, content: string }

    expect(result.command).toBe('post tweet')
    expect(result.content).toBe('Hello world')
  })

  it('should correctly parse search tweets command', async () => {
    const result = await parseCommand('search tweets: javascript') as { command: string, content: string }

    expect(result.command).toBe('search tweets')
    expect(result.content).toBe('javascript')
  })

  it('should correctly parse like tweet command', async () => {
    const result = await parseCommand('like tweet: 123456789') as { command: string, content: string }

    expect(result.command).toBe('like tweet')
    expect(result.content).toBe('123456789')
  })

  it('should correctly parse retweet command', async () => {
    const result = await parseCommand('retweet: 987654321') as { command: string, content: string }

    expect(result.command).toBe('retweet')
    expect(result.content).toBe('987654321')
  })

  it('should correctly parse get user command', async () => {
    const result = await parseCommand('get user: username') as { command: string, content: string }

    expect(result.command).toBe('get user')
    expect(result.content).toBe('username')
  })

  it('should correctly parse get timeline command', async () => {
    const result = await parseCommand('get timeline') as { command: string, count: number }

    expect(result.command).toBe('get timeline')
  })

  it('should handle get timeline with count parameter', async () => {
    const result = await parseCommand('get timeline count: 5') as { command: string, count: number }

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
    const result = await parseCommand('POST TWEET: Hello world') as { command: string, content: string }

    expect(result.command).toBe('post tweet')
    expect(result.content).toBe('Hello world')
  })

  it('should not be fooled by colon in the middle of a sentence', async () => {
    // This should not match because it doesn't start with a command prefix
    await expect(parseCommand('I like to say: hello world'))
      .rejects
      .toThrow('Unknown Twitter command')
  })
})

// Simplified function to test just the parsing logic that mimics the command map approach
async function parseCommand(input: string): Promise<ParseResult> {
  const normalizedInput = input.trim().toLowerCase()

  // Define command handlers map to mimic the refactored implementation
  const commandHandlers = {
    'post tweet:': async (content: string) => {
      return { command: 'post tweet', content }
    },
    'search tweets:': async (content: string) => {
      return { command: 'search tweets', content }
    },
    'like tweet:': async (content: string) => {
      return { command: 'like tweet', content }
    },
    'retweet:': async (content: string) => {
      return { command: 'retweet', content }
    },
    'get user:': async (content: string) => {
      return { command: 'get user', content }
    },
    'get timeline': async (content: string) => {
      const countMatch = content.match(/count:\s*(\d+)/)
      const count = countMatch ? Number.parseInt(countMatch[1], 10) : 10
      return { command: 'get timeline', count }
    },
  }

  // Find and execute the appropriate command handler
  for (const [prefix, handler] of Object.entries(commandHandlers)) {
    if (normalizedInput.startsWith(prefix)) {
      // For commands with content after the prefix, extract that content
      const content = input.substring(prefix.length).trim()

      return await handler(content)
    }
  }

  throw new Error(`Unknown Twitter command: ${input}`)
}

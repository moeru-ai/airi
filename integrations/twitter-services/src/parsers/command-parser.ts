// Define a union type for the command parsing result
export type ParseResult
  = | { command: 'post tweet', content: string }
    | { command: 'search tweets', content: string }
    | { command: 'like tweet', content: string }
    | { command: 'retweet', content: string }
    | { command: 'get user', content: string }
    | { command: 'get timeline', content: string, count: number }

type NonTimelineCommands = 'post tweet' | 'search tweets' | 'like tweet' | 'retweet' | 'get user'

/**
 * Parses a Twitter command from the input string
 * @param input The input string containing the command
 * @returns Parsed command and content, or null if no valid command found
 */
export function parseTwitterCommand(input: string): ParseResult | null {
  // Handle commands based on explicit prefixes for better reliability
  const normalizedInput = input.trim().toLowerCase()

  // Define command patterns
  const commandPatterns: Array<{ pattern: string, command: string }> = [
    { pattern: 'post tweet:', command: 'post tweet' },
    { pattern: 'search tweets:', command: 'search tweets' },
    { pattern: 'like tweet:', command: 'like tweet' },
    { pattern: 'retweet:', command: 'retweet' },
    { pattern: 'get user:', command: 'get user' },
    { pattern: 'get timeline', command: 'get timeline' },
  ]

  // Find the matching command pattern
  for (const { pattern, command } of commandPatterns) {
    if (normalizedInput.startsWith(pattern)) {
      // Extract the content after the prefix
      const content = input.substring(pattern.length)

      // Special handling for 'get timeline' command to extract count parameter
      if (command === 'get timeline') {
        const countMatch = content.match(/count:\s*(\d+)/)
        const count = countMatch ? Number.parseInt(countMatch[1], 10) : 10
        // For timeline command, use full trim for consistency
        const trimmedContent = content.trim()
        return { command: command as ParseResult['command'], content: trimmedContent, count }
      }

      return { command: command as NonTimelineCommands, content: content.trim() }
    }
  }

  // No valid command found
  return null
}

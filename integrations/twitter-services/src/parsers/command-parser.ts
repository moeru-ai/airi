// Define a union type for the command parsing result
export type ParseResult
  = | { command: 'get timeline', content: string, count: number }
    | { command: 'get user', content: string }
    | { command: 'like tweet', content: string }
    | { command: 'post tweet', content: string }
    | { command: 'retweet', content: string }
    | { command: 'search tweets', content: string }

type NonTimelineCommands = 'get user' | 'like tweet' | 'post tweet' | 'retweet' | 'search tweets'

/**
 * Parses a Twitter command from the input string
 * @param input The input string containing the command
 * @returns Parsed command and content, or null if no valid command found
 */
export function parseTwitterCommand(input: string): null | ParseResult {
  // Handle commands based on explicit prefixes for better reliability
  const normalizedInput = input.trim().toLowerCase()

  // Define command patterns
  const commandPatterns: Array<{ command: string, pattern: string }> = [
    { command: 'post tweet', pattern: 'post tweet:' },
    { command: 'search tweets', pattern: 'search tweets:' },
    { command: 'like tweet', pattern: 'like tweet:' },
    { command: 'retweet', pattern: 'retweet:' },
    { command: 'get user', pattern: 'get user:' },
    { command: 'get timeline', pattern: 'get timeline' },
  ]

  // Find the matching command pattern
  for (const { command, pattern } of commandPatterns) {
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

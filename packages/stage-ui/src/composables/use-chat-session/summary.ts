import type { ChatAssistantMessage, ChatHistoryItem } from '../../types/chat'

/**
 * Extract all reasoning from a session's messages
 */
export function getAllReasoning(messages: ChatHistoryItem[]): string[] {
  return messages
    .filter((msg): msg is ChatAssistantMessage =>
      msg.role === 'assistant' && 'categorization' in msg,
    )
    .map(msg => msg.categorization?.reasoning)
    .filter((reasoning): reasoning is string => !!reasoning?.trim())
}

/**
 * Get combined reasoning as a single string
 */
export function getCombinedReasoning(messages: ChatHistoryItem[]): string {
  return getAllReasoning(messages).join('\n\n')
}

/**
 * Get session summary with reasoning, speech, and metadata
 */
export function getSessionSummary(
  sessionId: string,
  messages: ChatHistoryItem[],
): {
  sessionId: string
  messageCount: number
  reasoningCount: number
  allReasoning: string[]
  allSpeech: string[]
  combinedReasoning: string
  combinedSpeech: string
  createdAt?: number
  lastMessageAt?: number
} {
  const allReasoning: string[] = []
  const allSpeech: string[] = []

  for (const msg of messages) {
    if (msg.role === 'assistant' && 'categorization' in msg) {
      const reasoning = msg.categorization?.reasoning
      if (reasoning?.trim()) {
        allReasoning.push(reasoning)
      }
      const speech = msg.categorization?.speech
      if (speech?.trim()) {
        allSpeech.push(speech)
      }
    }
  }

  return {
    sessionId,
    messageCount: messages.length,
    reasoningCount: allReasoning.length,
    allReasoning,
    allSpeech,
    combinedReasoning: allReasoning.join('\n\n'),
    combinedSpeech: allSpeech.join('\n\n'),
    createdAt: messages[0]?.createdAt,
    lastMessageAt: messages[messages.length - 1]?.createdAt,
  }
}

/**
 * Get reasoning from all sessions
 */
export function getAllReasoningFromAllSessions(
  allSessions: Record<string, ChatHistoryItem[]>,
): string[] {
  return Object.values(allSessions)
    .flatMap(messages => getAllReasoning(messages))
}

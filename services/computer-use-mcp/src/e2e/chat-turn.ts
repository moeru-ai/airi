interface ChatTurnSummaryLike {
  at?: unknown
  outputText?: unknown
  toolCallCount?: unknown
  toolResultCount?: unknown
}

interface ChatTurnSnapshotLike {
  chat?: {
    lastTurnComplete?: ChatTurnSummaryLike | null
  }
}

// NOTICE: AIRI can legitimately finish a turn with tool calls/results but no
// natural-language assistant text. Treat that as a completed turn so E2E
// harnesses do not hang forever waiting for output that will never arrive.
export function hasCompletedChatTurn(snapshot: ChatTurnSnapshotLike) {
  const lastTurnComplete = snapshot.chat?.lastTurnComplete
  if (!lastTurnComplete || typeof lastTurnComplete !== 'object') {
    return false
  }

  const outputText = typeof lastTurnComplete.outputText === 'string'
    ? lastTurnComplete.outputText.trim()
    : ''
  const toolCallCount = Number(lastTurnComplete.toolCallCount || 0)
  const toolResultCount = Number(lastTurnComplete.toolResultCount || 0)
  const completedAt = typeof lastTurnComplete.at === 'string'
    ? lastTurnComplete.at.trim()
    : ''

  return outputText.length > 0
    || toolCallCount > 0
    || toolResultCount > 0
    || completedAt.length > 0
}

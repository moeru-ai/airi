/**
 * Trusted Invocation Attribution for AIRI computer-use.
 * Tracks session, turn, and tool-call provenance across IPC boundaries.
 */

export interface InvocationAttribution {
  /** Chat session or conversation ID. Required for provenance. */
  sessionId: string
  /** Turn ID within the session. */
  turnId?: string
  /** Model-issued tool call ID. */
  toolCallId?: string
  /** Electron WebContents sender ID (verified by host IPC event sender). */
  senderWebContentsId?: number
}

/**
 * Validates whether an incoming attribution payload is well-formed.
 * Fails closed if sessionId is missing, empty, or malformed.
 * Does NOT generate fake or default fallbacks.
 */
export function validateAttribution(
  raw: unknown,
  trustedSenderWebContentsId?: number,
): InvocationAttribution {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invocation attribution is required (missing attribution context).')
  }

  const candidate = raw as Record<string, unknown>
  const sessionId = candidate.sessionId

  if (typeof sessionId !== 'string' || sessionId.trim().length === 0 || sessionId.includes('\0')) {
    throw new Error('Invalid invocation attribution: sessionId must be a non-empty string.')
  }

  const turnId = typeof candidate.turnId === 'string' && candidate.turnId.trim().length > 0
    ? candidate.turnId.trim()
    : undefined

  const toolCallId = typeof candidate.toolCallId === 'string' && candidate.toolCallId.trim().length > 0
    ? candidate.toolCallId.trim()
    : undefined

  return {
    sessionId: sessionId.trim(),
    turnId,
    toolCallId,
    senderWebContentsId: trustedSenderWebContentsId,
  }
}

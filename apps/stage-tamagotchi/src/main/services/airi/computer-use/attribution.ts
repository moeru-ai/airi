import type { InvocationAttributionPayload } from '../../../../shared/eventa/computer-use'

/** Renderer correlation plus the independently observed Electron source. Correlation is not authentication. */
export interface InvocationAttribution extends InvocationAttributionPayload {
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

  for (const field of ['turnId', 'toolCallId'] as const) {
    const value = candidate[field]
    if (value !== undefined && (typeof value !== 'string' || !value.trim() || value.includes('\0')))
      throw new Error(`Invalid invocation attribution: ${field} must be a non-empty string.`)
  }
  const turnId = (candidate.turnId as string | undefined)?.trim()
  const toolCallId = (candidate.toolCallId as string | undefined)?.trim()

  return {
    sessionId: sessionId.trim(),
    turnId,
    toolCallId,
    senderWebContentsId: trustedSenderWebContentsId,
  }
}

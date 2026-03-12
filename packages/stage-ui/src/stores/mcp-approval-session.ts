const activeApprovalSessionIds = new Set<string>()
const listeners = new Set<(sessionId: string | undefined) => void>()

export function beginMcpApprovalSession(sessionId: string) {
  activeApprovalSessionIds.add(sessionId)
  return sessionId
}

export function endMcpApprovalSession(sessionId?: string) {
  if (!sessionId || !activeApprovalSessionIds.has(sessionId))
    return

  activeApprovalSessionIds.delete(sessionId)
  for (const listener of listeners) {
    listener(sessionId)
  }
}

export function isMcpApprovalSessionActive(sessionId: string) {
  return activeApprovalSessionIds.has(sessionId)
}

export function onMcpApprovalSessionEnded(listener: (sessionId: string | undefined) => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Reset helper for tests. */
export function resetMcpApprovalSessions() {
  activeApprovalSessionIds.clear()
  listeners.clear()
}

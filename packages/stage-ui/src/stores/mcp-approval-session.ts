let currentApprovalSessionId: string | undefined
const listeners = new Set<(sessionId: string | undefined) => void>()

export function beginMcpApprovalSession(sessionId: string) {
  currentApprovalSessionId = sessionId
  return currentApprovalSessionId
}

export function endMcpApprovalSession(sessionId?: string) {
  if (sessionId && currentApprovalSessionId && sessionId !== currentApprovalSessionId)
    return

  const ended = currentApprovalSessionId
  currentApprovalSessionId = undefined
  for (const listener of listeners) {
    listener(ended)
  }
}

export function getCurrentMcpApprovalSessionId() {
  return currentApprovalSessionId
}

export function onMcpApprovalSessionEnded(listener: (sessionId: string | undefined) => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

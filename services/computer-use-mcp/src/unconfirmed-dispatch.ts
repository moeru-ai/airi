/** A dispatch that was written to the audit log and has no later terminal event. */
export interface UnconfirmedDispatch {
  dispatchId: string
  toolName: string
  at: string
}

export interface AuditDispatchEvent {
  event: string
  at: string
  toolName: string
  result?: Record<string, unknown>
}

const terminalEvents = new Set(['executed', 'failed', 'denied'])

/**
 * Lists dispatch markers that have no later executed, failed, or denied event.
 * An empty result does not prove that an unmarked command never ran.
 */
export function listUnconfirmedDispatches(entries: AuditDispatchEvent[]): UnconfirmedDispatch[] {
  const open = new Map<string, UnconfirmedDispatch>()
  for (const entry of entries) {
    const dispatchId = typeof entry.result?.dispatchId === 'string' ? entry.result.dispatchId : undefined
    if (!dispatchId)
      continue
    if (entry.event === 'dispatching') {
      open.set(dispatchId, { dispatchId, toolName: entry.toolName, at: entry.at })
      continue
    }
    if (terminalEvents.has(entry.event))
      open.delete(dispatchId)
  }
  return [...open.values()]
}

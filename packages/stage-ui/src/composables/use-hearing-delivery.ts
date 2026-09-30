import { useChatStore } from '../stores/chat'
import { useChatSessionStore } from '../stores/chat/session-store'
import { useHearingDraftStore } from '../stores/hearing-drafts'
import { useHearingStore } from '../stores/modules/hearing'

/** Sends recognized text to its captured session or preserves it as an editable draft. */
export function useHearingDelivery() {
  const chat = useChatStore()
  const sessions = useChatSessionStore()
  const drafts = useHearingDraftStore()
  const hearing = useHearingStore()

  async function deliver(sessionId: string, transcript: string, isCurrent: () => boolean) {
    const text = transcript.trim()
    if (!text || !sessions.sessionMetas[sessionId])
      return
    if (!hearing.autoSendEnabled || !isCurrent()) {
      await drafts.append(sessionId, text)
      return
    }
    if (hearing.autoSendDelay > 0)
      await new Promise(resolve => setTimeout(resolve, hearing.autoSendDelay))
    if (!sessions.sessionMetas[sessionId])
      return
    if (!isCurrent() || !hearing.autoSendEnabled) {
      await drafts.append(sessionId, text)
      return
    }
    let existingMessageIds: Set<string> | undefined
    try {
      if (!await sessions.loadSession(sessionId))
        throw new Error('Failed to load the target chat session')
      existingMessageIds = new Set(sessions.sessionMessages[sessionId]?.flatMap(message => message.id ? [message.id] : []))
      if (!isCurrent() || !hearing.autoSendEnabled) {
        await drafts.append(sessionId, text)
        return
      }
      await chat.send({ sessionId, text })
    }
    catch (error) {
      // Chat can persist the user turn before the model fails. That turn owns retries after acceptance.
      const knownMessageIds = existingMessageIds
      const accepted = knownMessageIds && sessions.sessionMessages[sessionId]?.some(message =>
        message.role === 'user'
        && !!message.id
        && !knownMessageIds.has(message.id)
        && message.content === text)
      if (!accepted && sessions.sessionMetas[sessionId])
        await drafts.append(sessionId, text)
      throw error
    }
  }

  return { deliver }
}

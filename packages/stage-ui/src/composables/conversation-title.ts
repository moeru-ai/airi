import { errorMessageFrom } from '@moeru/std'
import { createConversationTitleAgent } from '@proj-airi/agents/conversation-title'

import { extractMessageText } from '../libs/chat-sync'
import { staysLocal } from '../stores/chat/session-locality'
import { useChatSessionStore } from '../stores/chat/session-store'
import { useConsciousnessSettingsStore } from '../stores/modules/consciousness-settings'
import { useTextGeneration } from './text-generation'

/** A title request that takes longer is dropped. The list keeps the preview of the first message. */
const TITLE_REQUEST_TIMEOUT_MS = 30_000

/** A title is a few words. The cap keeps a model that ignores the instructions from running up the cost. */
const TITLE_MAX_TOKENS = 100

/**
 * Names a new conversation after its first reply, when the Consciousness setting allows it.
 *
 * The chat store calls it in the window that ran the turn, so each reply asks at most once. The request uses the
 * chat model of the conversation's character, so the conversation reaches no other provider.
 *
 * Returns:
 * - `nameAfterReply`, which resolves when the title is saved or skipped. It never rejects. A failed request leaves
 *   the conversation without a title, and the list shows its first message.
 */
export function useConversationTitle() {
  const chatSession = useChatSessionStore()
  const consciousnessSettings = useConsciousnessSettingsStore()
  const { generateText } = useTextGeneration()
  /** Sessions with a title request in this window. A second reply during the request sends no second request. */
  const requesting = new Set<string>()

  /**
   * Names the session when this reply answers its first message from the owner.
   *
   * A session without a title after a later reply stays that way. Its first turn failed, or the owner cleared the
   * title, and a request on each later reply would repeat the cost.
   */
  async function nameAfterReply(request: {
    sessionId: string
    /** The chat model of the session's character. */
    selection: { providerId: string, model: string }
  }) {
    const { sessionId } = request
    if (!consciousnessSettings.titleGeneration || requesting.has(sessionId))
      return

    const meta = chatSession.sessionMetas[sessionId]
    // A scene, a task, and a hidden branch never reach the conversation list.
    if (!meta || meta.title || meta.cloudTitlePending !== undefined || staysLocal(meta))
      return

    const messages = chatSession.getSessionMessages(sessionId)
    const ownerMessages = messages.filter(message => message.role === 'user' && !message.notice)
    const [firstMessage] = ownerMessages
    if (ownerMessages.length !== 1 || !firstMessage)
      return

    // The stored reply holds the rendered text. The streamed text still has the special tokens of the character.
    const firstReply = messages.slice(messages.indexOf(firstMessage) + 1).find(message => message.role === 'assistant')
    const userMessage = extractMessageText(firstMessage).trim()
    const reply = firstReply ? extractMessageText(firstReply).trim() : ''
    if (!userMessage || !reply)
      return

    requesting.add(sessionId)
    try {
      const agent = createConversationTitleAgent({
        generateText: generateText({ ...request.selection, maxTokens: TITLE_MAX_TOKENS }),
      })
      const title = await agent.name({ userMessage, reply }, AbortSignal.timeout(TITLE_REQUEST_TIMEOUT_MS))
      // The owner can rename the session during the request. The store keeps that title.
      await chatSession.setGeneratedSessionTitle(sessionId, title)
    }
    catch (error) {
      console.warn('[chat] Failed to name a conversation:', errorMessageFrom(error))
    }
    finally {
      requesting.delete(sessionId)
    }
  }

  return { nameAfterReply }
}

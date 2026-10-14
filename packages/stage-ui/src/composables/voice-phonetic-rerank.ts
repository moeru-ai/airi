import type { PhoneticRerankRequest } from '../libs/voice/voice-phonetic-match-plugin'

import { onScopeDispose, watch } from 'vue'

import { extractMessageText } from '../libs/chat-sync'
import { MultilingualE5Embedder } from '../libs/voice/multilingual-e5-embedder'
import { createSemanticReranker } from '../libs/voice/phonetic-rerank'
import { useChatSessionStore } from '../stores/chat/session-store'
import { useHearingStore } from '../stores/modules/hearing'

/** A session that has not loaded has no history to read. */
const NO_MESSAGES = Object.freeze([])

/** Enough recent turns to carry the topic. The reranker also cuts the joined text to fit the model. */
const HISTORY_MESSAGES = 6

/**
 * Orders phonetic suggestions by the active conversation with a local embedding model.
 *
 * The hearing setting turns it on. While it is off, `rerank` keeps the phonetic order and loads nothing.
 * Turning it off or disposing the owner scope terminates the model Worker. Turning it on again loads the model on the next input.
 *
 * Returns:
 * - `rerank`, the `rerank` hook of the phonetic match plugin.
 */
export function useVoicePhoneticRerank() {
  const hearing = useHearingStore()
  const sessions = useChatSessionStore()
  const embedder = new MultilingualE5Embedder()
  const reranker = createSemanticReranker({
    embedder,
    // The system prompt describes the character, not the topic, so only spoken and written turns count.
    // A wake word can send speech to a session that the window does not show, so read the input's own session.
    history: sessionId => (sessions.getSessionMessagesIfLoaded(sessionId) ?? NO_MESSAGES)
      .filter(message => message.role === 'user' || message.role === 'assistant')
      .slice(-HISTORY_MESSAGES)
      .map(extractMessageText)
      .filter(Boolean),
  })

  watch(() => hearing.phoneticRerankEnabled, (enabled) => {
    if (!enabled)
      embedder.dispose()
  })
  onScopeDispose(() => embedder.dispose())

  async function rerank(request: PhoneticRerankRequest, signal: AbortSignal) {
    if (!hearing.phoneticRerankEnabled)
      return request.candidates
    return reranker(request, signal)
  }

  return { rerank }
}

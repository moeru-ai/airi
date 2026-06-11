import type { ContextMessage } from '../../../types/chat'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { nanoid } from 'nanoid'

import { useAuthStore } from '../../auth'
import { useAiriCardStore } from '../../modules/airi-card'
import { useAlayaMemoryStore } from '../../modules/alaya-memory'

const ALAYA_CONTEXT_ID = 'system:alaya-long-term-memory'

/**
 * Runtime context provider that injects Alaya long-term memories into the
 * LLM prompt.  Registered in `runtimeContextProviders` so it runs before
 * every chat turn.
 *
 * Returns `null` when no character is active or the memory store has no
 * entries yet, skipping the context block entirely.
 */
export function createAlayaMemoryContext(): ContextMessage | null {
  const alaya = useAlayaMemoryStore()
  const airiCard = useAiriCardStore()
  const auth = useAuthStore()

  const characterId = airiCard.activeCardId
  if (!characterId)
    return null

  // Reconnect when the store is not yet initialised, or when the
  // active character / user differs from the previously connected
  // one (character switch, account switch).  connect() is async and
  // runtime providers are synchronous, so we skip this round and let
  // the next send pick up the freshly loaded data.
  if (!alaya.characterId || alaya.characterId !== characterId || alaya.userId !== auth.userId) {
    alaya.connect({ characterId, userId: auth.userId })
    return null
  }

  const entries = alaya.allMemories
  const now = Date.now()

  // Always emit a ReplaceSelf message so the Alaya context bucket is
  // cleared when the user switches to a character with no memories.
  if (!entries || entries.length === 0) {
    return {
      id: nanoid(),
      contextId: ALAYA_CONTEXT_ID,
      strategy: ContextUpdateStrategy.ReplaceSelf,
      text: '',
      createdAt: now,
    }
  }

  const recent = [...entries]
    .sort((a, b) => (b.lastAccessedAt || b.createdAt) - (a.lastAccessedAt || a.createdAt))
    .slice(0, 10)

  const lines = recent.map((m, i) => {
    const date = new Date(m.createdAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
    const body = m.summary || m.content
    const clipped = body.length > 200 ? `${body.slice(0, 197)}...` : body
    return `${i + 1}. [${date}] ${clipped}`
  })

  return {
    id: nanoid(),
    contextId: ALAYA_CONTEXT_ID,
    strategy: ContextUpdateStrategy.ReplaceSelf,
    text: [
      '<long_term_memories>',
      'The following are relevant memories about this character and past interactions.',
      'Use them to inform your responses naturally.',
      ...lines,
      '</long_term_memories>',
    ].join('\n'),
    createdAt: now,
  }
}

/**
 * Registers an onChatTurnComplete hook that auto-ingests user messages
 * into the Alaya long-term memory store after each chat round.
 *
 * @returns A disposer function to unregister the hook.
 */
export function registerAlayaAutoIngestion(
  onChatTurnComplete: (cb: (...args: any[]) => Promise<void>) => () => void,
): () => void {
  const alaya = useAlayaMemoryStore()

  return onChatTurnComplete(async (_chat: any, context: any) => {
    // Use the Alaya store's characterId (set at send time) rather than
    // the global activeCardId, which may have changed if the user
    // switched cards while the response was still streaming.
    const characterId = alaya.characterId
    if (!characterId)
      return

    const message = context?.message
    if (!message || message.role !== 'user')
      return

    const text = typeof message.content === 'string'
      ? message.content
      : Array.isArray(message.content)
        ? message.content
            .map((b: any) => (b?.text ?? ''))
            .join(' ')
        : ''

    if (!text.trim())
      return

    try {
      await alaya.addMemory({
        characterId,
        content: text,
        source: 'chat',
        tags: ['conversation'],
        type: 'event',
      })
    }
    catch { /* best-effort */ }
  })
}

import { createContext as createBroadcastChannelContext } from '@moeru/eventa/adapters/broadcast-channel'
import { defineStore, getActivePinia } from 'pinia'
import { onScopeDispose, ref } from 'vue'

import { voiceDraftChannelName, voiceDraftDiscarded } from './chat/voice-send'

/** Holds completed transcription until a composer claims it, including while chat windows are closed. */
export const useHearingDraftStore = defineStore('hearing-drafts', () => {
  const pinia = getActivePinia()
  const drafts = ref<Record<string, string>>({})
  const channel = createBroadcastChannelContext(new BroadcastChannel(voiceDraftChannelName), { closeOnDispose: true })

  async function append(sessionId: string, text: string) {
    if (!text.trim())
      return
    const previous = drafts.value[sessionId]
    drafts.value = { ...drafts.value, [sessionId]: previous ? `${previous}\n${text.trim()}` : text.trim() }
  }

  async function take(sessionId: string): Promise<string> {
    const text = drafts.value[sessionId] ?? ''
    if (text) {
      const next = { ...drafts.value }
      delete next[sessionId]
      drafts.value = next
    }
    return text
  }

  async function discard(sessionId?: string) {
    if (sessionId)
      await take(sessionId)
    else
      drafts.value = {}
  }

  // Each renderer can observe deletion. The leader applies this idempotent command.
  const stopDiscardEvents = channel.context.on(voiceDraftDiscarded, async ({ body }) => {
    if (body)
      await useHearingDraftStore(pinia).discard(body.sessionId)
  })
  onScopeDispose(() => {
    stopDiscardEvents()
    channel.dispose()
  })

  return { drafts, append, take, discard }
}, { synced: { state: true, actions: ['append', 'take', 'discard'] } })

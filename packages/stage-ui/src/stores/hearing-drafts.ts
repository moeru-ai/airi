import { createContext as createBroadcastChannelContext } from '@moeru/eventa/adapters/broadcast-channel'
import { defineStore, getActivePinia } from 'pinia'
import { onScopeDispose, ref } from 'vue'

import { voiceDraftChannelName, voiceDraftDiscarded } from './chat/voice-send'

/** Holds completed transcription until a composer claims it, including while chat windows are closed. */
export const useHearingDraftStore = defineStore('hearing-drafts', () => {
  const pinia = getActivePinia()
  const drafts = ref<Record<string, string>>({})
  const pendingSessionIds = ref<string[]>([])
  const channel = createBroadcastChannelContext(new BroadcastChannel(voiceDraftChannelName), { closeOnDispose: true })

  async function append(sessionId: string, text: string) {
    if (!text.trim())
      return
    pendingSessionIds.value = [...pendingSessionIds.value.filter(id => id !== sessionId), sessionId]
    const previous = drafts.value[sessionId]
    drafts.value = { ...drafts.value, [sessionId]: previous ? `${previous}\n${text.trim()}` : text.trim() }
  }

  async function take(sessionId: string): Promise<string> {
    const text = drafts.value[sessionId] ?? ''
    if (drafts.value[sessionId] !== undefined) {
      const next = { ...drafts.value }
      delete next[sessionId]
      drafts.value = next
      pendingSessionIds.value = pendingSessionIds.value.filter(id => id !== sessionId)
    }
    return text
  }

  async function discard(sessionId?: string) {
    if (sessionId) {
      await take(sessionId)
    }
    else {
      drafts.value = {}
      pendingSessionIds.value = []
    }
  }

  /** Edits an existing draft without recreating one already consumed by another window. */
  async function edit(sessionId: string, text: string) {
    if (drafts.value[sessionId] === undefined)
      return
    drafts.value = { ...drafts.value, [sessionId]: text }
  }

  /** Moves an existing draft to the end of the review order. */
  async function promote(sessionId: string) {
    if (drafts.value[sessionId] !== undefined)
      pendingSessionIds.value = [...pendingSessionIds.value.filter(id => id !== sessionId), sessionId]
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

  return { drafts, pendingSessionIds, append, take, discard, edit, promote }
}, { synced: { state: true, actions: ['append', 'take', 'discard', 'edit', 'promote'] } })

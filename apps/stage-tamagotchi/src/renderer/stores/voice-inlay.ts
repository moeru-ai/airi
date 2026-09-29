import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

export interface VoiceDraft {
  cardId: string
  sessionId: string
  text: string
}

/** Keeps pending speech drafts by chat session across the desktop stage and inlay windows. */
export const useVoiceInlayStore = defineStore('voice-inlay', () => {
  const drafts = ref<Record<string, VoiceDraft>>({})
  // The last session is visible. Earlier sessions remain pending in arrival order.
  const pendingSessionIds = ref<string[]>([])
  const recordingCardId = shallowRef<string>()
  const activeSessionId = computed(() => pendingSessionIds.value.at(-1))
  const activeDraft = computed(() => activeSessionId.value ? drafts.value[activeSessionId.value] : undefined)
  const pendingCount = computed(() => Math.max(0, pendingSessionIds.value.length - 1))

  function showRecording(cardId: string) {
    recordingCardId.value = cardId
  }

  function hideRecording() {
    recordingCardId.value = undefined
  }

  function queueVoiceDraft(draft: VoiceDraft) {
    const text = draft.text.trim()
    if (!text)
      return

    const previous = drafts.value[draft.sessionId]
    drafts.value = {
      ...drafts.value,
      [draft.sessionId]: {
        ...draft,
        text: previous?.text ? `${previous.text}\n${text}` : text,
      },
    }
    pendingSessionIds.value = [...pendingSessionIds.value.filter(id => id !== draft.sessionId), draft.sessionId]
  }

  function editVoiceDraft(sessionId: string, text: string) {
    const draft = drafts.value[sessionId]
    if (!draft)
      return
    drafts.value = { ...drafts.value, [sessionId]: { ...draft, text } }
  }

  function removeVoiceDraft(sessionId: string) {
    if (!drafts.value[sessionId])
      return
    const next = { ...drafts.value }
    delete next[sessionId]
    drafts.value = next
    pendingSessionIds.value = pendingSessionIds.value.filter(id => id !== sessionId)
  }

  return {
    drafts,
    pendingSessionIds,
    recordingCardId,
    activeDraft,
    pendingCount,
    showRecording,
    hideRecording,
    queueVoiceDraft,
    editVoiceDraft,
    removeVoiceDraft,
  }
}, {
  synced: { state: true },
})

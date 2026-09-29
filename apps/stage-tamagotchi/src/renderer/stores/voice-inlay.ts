import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

export interface VoiceDraft {
  cardId: string
  sessionId: string
  text: string
}

/** Keeps pending speech drafts by character across the desktop stage and inlay windows. */
export const useVoiceInlayStore = defineStore('voice-inlay', () => {
  const drafts = ref<Record<string, VoiceDraft>>({})
  // The last card is visible. Earlier cards remain pending in arrival order.
  const pendingCardIds = ref<string[]>([])
  const recordingCardId = shallowRef<string>()
  const activeCardId = computed(() => pendingCardIds.value.at(-1))
  const activeDraft = computed(() => activeCardId.value ? drafts.value[activeCardId.value] : undefined)
  const pendingCount = computed(() => Math.max(0, pendingCardIds.value.length - 1))

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

    const previous = drafts.value[draft.cardId]
    drafts.value = {
      ...drafts.value,
      [draft.cardId]: {
        ...draft,
        text: previous?.text ? `${previous.text}\n${text}` : text,
      },
    }
    pendingCardIds.value = [...pendingCardIds.value.filter(id => id !== draft.cardId), draft.cardId]
  }

  function editVoiceDraft(cardId: string, text: string) {
    const draft = drafts.value[cardId]
    if (!draft)
      return
    drafts.value = { ...drafts.value, [cardId]: { ...draft, text } }
  }

  function removeVoiceDraft(cardId: string) {
    if (!drafts.value[cardId])
      return
    const next = { ...drafts.value }
    delete next[cardId]
    drafts.value = next
    pendingCardIds.value = pendingCardIds.value.filter(id => id !== cardId)
  }

  return {
    drafts,
    pendingCardIds,
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

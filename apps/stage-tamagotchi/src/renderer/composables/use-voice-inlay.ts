import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'

import { electronVoiceInlayHide, electronVoiceInlayShow } from '../../shared/eventa'
import { useVoiceInlayStore } from '../stores/voice-inlay'

/** Presents desktop recording status and per-character editable drafts. */
export function useVoiceInlay() {
  const state = useVoiceInlayStore()
  const show = useElectronEventaInvoke(electronVoiceInlayShow)
  const hide = useElectronEventaInvoke(electronVoiceInlayHide)

  async function showRecording(cardId: string) {
    state.showRecording(cardId)
    await show({ focus: false, presentation: 'listening' })
  }

  async function hideRecording() {
    state.hideRecording()
    if (state.activeDraft)
      await show({ focus: true, presentation: 'draft' })
    else
      await hide()
  }

  async function queueVoiceDraft(draft: { cardId: string, sessionId: string, text: string }) {
    const recordingCardId = state.recordingCardId
    state.queueVoiceDraft(draft)
    if (recordingCardId && recordingCardId !== draft.cardId)
      return
    if (recordingCardId)
      state.hideRecording()
    await show({ focus: true, presentation: 'draft' })
  }

  return { showRecording, hideRecording, queueVoiceDraft }
}

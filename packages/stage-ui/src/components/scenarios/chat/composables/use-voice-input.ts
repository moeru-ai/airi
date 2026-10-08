import { nanoid } from 'nanoid/non-secure'
import { storeToRefs } from 'pinia'
import { computed, onScopeDispose, ref } from 'vue'

import { useChatSessionStore } from '../../../../stores/chat/session-store'
import { useHearingStore } from '../../../../stores/modules/hearing'
import { useVoiceControlsStore } from '../../../../stores/voice-controls'

/** A chat control owns its command identity. The audio host owns capture, transcription, and drafts. */
export function useVoiceInput() {
  const controls = useVoiceControlsStore()
  const sessions = useChatSessionStore()
  const { autoSendEnabled } = storeToRefs(useHearingStore())
  const requestId = ref<string>()
  const starting = ref(false)
  const isListening = computed(() => starting.value || (controls.snapshot.input?.requestId === requestId.value
    && (controls.snapshot.input?.phase === 'pending' || controls.snapshot.input?.phase === 'capturing')))

  async function start() {
    if (isListening.value)
      return
    const id = nanoid()
    requestId.value = id
    starting.value = true
    try {
      await controls.command({ type: 'begin', requestId: id, sessionId: sessions.activeSessionId })
    }
    finally {
      starting.value = false
    }
  }

  async function end() {
    if (requestId.value)
      await controls.command({ type: 'end', requestId: requestId.value })
  }

  async function cancel() {
    if (requestId.value && controls.snapshot.connected)
      await controls.command({ type: 'cancel', requestId: requestId.value })
  }

  onScopeDispose(() => {
    void cancel().catch(error => console.error('Voice input cleanup failed', error))
  })
  return { start, end, cancel, isListening, autoSendEnabled }
}

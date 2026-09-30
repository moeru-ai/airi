import type { MaybeRefOrGetter } from 'vue'

import { computed, onScopeDispose, shallowRef, toValue, watch } from 'vue'

import { useSpeakingStore } from '../../../../stores/audio'
import { useChatStore } from '../../../../stores/chat'
import { useChatSessionStore } from '../../../../stores/chat/session-store'
import { useHearingDraftStore } from '../../../../stores/hearing-drafts'
import { useHearingStore } from '../../../../stores/modules/hearing'
import { useSettingsAudioDevice } from '../../../../stores/settings/audio-device'
import { useSpeechOutputControlStore } from '../../../../stores/speech-output-control'
import { useVoiceComposer } from './use-voice-composer'

/** Shares one recording and delivery policy between pointer, browser, and global shortcut input. */
export function usePushToTalk(options: {
  sessionId: MaybeRefOrGetter<string>
  onError: (message: string) => void
  onRecordingChange?: (active: boolean) => void
}) {
  const device = useSettingsAudioDevice()
  const hearing = useHearingStore()
  const chat = useChatStore()
  const sessions = useChatSessionStore()
  const drafts = useHearingDraftStore()
  const speaking = useSpeakingStore()
  const output = useSpeechOutputControlStore()
  const held = shallowRef(false)
  const enabled = computed(() => device.mode === 'push-to-talk')
  let generation = 0
  let starting: Promise<void> | undefined
  const voice = useVoiceComposer({
    sessionId: options.sessionId,
    needsTranscription: () => true,
    onError: options.onError,
    complete: async (result) => {
      const ticket = generation
      const text = result.text.trim()
      if (!text || !sessions.sessionMetas[result.sessionId])
        return
      if (!hearing.autoSendEnabled) {
        await drafts.append(result.sessionId, text)
        return
      }
      if (hearing.autoSendDelay > 0)
        await new Promise(resolve => setTimeout(resolve, hearing.autoSendDelay))
      if (!sessions.sessionMetas[result.sessionId])
        return
      // Completed speech belongs to the captured session even after its input is disabled.
      if (ticket !== generation || !enabled.value || !hearing.autoSendEnabled) {
        await drafts.append(result.sessionId, text)
        return
      }
      try {
        await chat.send({ sessionId: result.sessionId, text })
      }
      catch (error) {
        await drafts.append(result.sessionId, text)
        throw error
      }
    },
  })

  async function begin() {
    if (held.value || voice.phase.value !== 'idle' || !enabled.value || !voice.configured.value)
      return
    held.value = true
    const sessionId = toValue(options.sessionId)
    const ticket = ++generation
    options.onRecordingChange?.(true)
    starting = (async () => {
      if (speaking.nowSpeaking) {
        output.requestStopSpeaking('push-to-talk')
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      if (ticket === generation && held.value && enabled.value && sessionId === toValue(options.sessionId))
        await voice.start('transcription')
    })()
    await starting
    if (voice.phase.value === 'idle') {
      held.value = false
      options.onRecordingChange?.(false)
    }
  }

  async function end() {
    if (!held.value)
      return
    held.value = false
    if (voice.phase.value === 'starting') {
      await cancel()
      return
    }
    await starting
    try {
      await voice.finish()
    }
    finally {
      options.onRecordingChange?.(false)
    }
  }

  async function cancel() {
    ++generation
    held.value = false
    await voice.cancel()
    options.onRecordingChange?.(false)
  }

  watch([enabled, () => toValue(options.sessionId)], () => {
    void cancel()
  })
  onScopeDispose(() => {
    void cancel()
  })
  return { enabled, held, configured: voice.configured, phase: voice.phase, begin, end, cancel }
}

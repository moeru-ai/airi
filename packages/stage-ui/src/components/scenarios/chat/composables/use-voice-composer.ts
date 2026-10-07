import type { ChatToolReference } from '../../../../types/chat'

import { errorMessageFrom } from '@moeru/std'
import { nanoid } from 'nanoid/non-secure'
import { computed, onScopeDispose, shallowRef, watch } from 'vue'

import { useHearingStore } from '../../../../stores/modules/hearing'
import { useVoiceControlsStore } from '../../../../stores/voice-controls'

/**
 * `audio` records a voice message and sends it as an audio attachment.
 * `transcription` dictates. The final transcript goes into the composer text.
 */
export type VoiceComposerMode = 'audio' | 'transcription'

/**
 * `starting` waits for the microphone. `recording` captures audio.
 * `processing` encodes and sends a voice message, or finishes a transcript.
 */
export type VoiceComposerPhase = 'idle' | 'starting' | 'recording' | 'processing'

export interface UseVoiceComposerOptions {
  /** Session that owns a new recording. Read once when recording starts. */
  sessionId: () => string
  /** Reply target of a new voice message. Read once when recording starts. */
  replyToMessageId?: () => string | undefined
  /** Request tools of a new voice message. Read once when recording starts. */
  tools?: () => ChatToolReference[] | undefined
  /** Receives the final dictation text. */
  onTranscript: (text: string) => void
  /** Receives a voice message that the host accepted for the chat. */
  onSent?: () => void
  /** Receives start, capture, and send failures. */
  onError: (message: string) => void
}

/** The recording that this control started. The host identifies it by `id`. */
type ActiveRecording
  = { mode: 'audio', id: string, finishing: boolean, seen: boolean }
    | { mode: 'transcription', id: string, finishing: boolean }

/**
 * Drives one composer voice control through the voice host.
 *
 * The host owns the microphone, encoding, transcription, and submission. This composable sends commands by identity and
 * derives its phase from host snapshots, so a follower window cannot open its own microphone.
 *
 * Use when:
 * - A chat composer offers hold-to-record voice messages and dictation into its text
 *
 * Expects:
 * - The current application context connects a voice host through `useVoiceStore().connectOutput`
 */
export function useVoiceComposer(options: UseVoiceComposerOptions) {
  const controls = useVoiceControlsStore()
  const hearing = useHearingStore()
  const active = shallowRef<ActiveRecording>()
  const startedAt = shallowRef<number>()

  const message = computed(() => {
    const recording = active.value
    return recording?.mode === 'audio' ? controls.messages.find(item => item.id === recording.id) : undefined
  })

  const input = computed(() => {
    const recording = active.value
    return recording?.mode === 'transcription' && controls.snapshot.input?.requestId === recording.id ? controls.snapshot.input : undefined
  })

  const phase = computed<VoiceComposerPhase>(() => {
    const recording = active.value
    if (!recording)
      return 'idle'
    if (recording.finishing)
      return 'processing'

    const state = recording.mode === 'audio' ? message.value?.phase : input.value?.phase
    if (state === 'capturing')
      return 'recording'
    if (state === 'finalizing' || state === 'settled')
      return 'processing'
    // The host has not published the recording yet, or the microphone is still opening.
    return 'starting'
  })

  /** Voice messages that this session could not send. Each one keeps its recording until the user retries or discards it. */
  const unsent = computed(() => controls.messages.filter(item => item.sessionId === options.sessionId() && item.phase === 'ready' && item.error && item.id !== active.value?.id))

  const transcript = computed(() => input.value?.text ?? '')
  const level = computed(() => phase.value === 'recording' ? controls.level : 0)

  watch(phase, (value) => {
    if (value === 'recording')
      startedAt.value ??= Date.now()
    if (value === 'idle')
      startedAt.value = undefined
  })

  // A voice message leaves the host list after it is sent or discarded. Other terminal states end the control here.
  watch(message, (snapshot) => {
    const recording = active.value
    if (recording?.mode !== 'audio')
      return
    if (snapshot) {
      recording.seen = true
      if (snapshot.phase === 'failed') {
        options.onError(snapshot.error ?? 'Voice message failed')
        void controls.messageCommand({ type: 'discard', id: recording.id }).catch(() => {})
        active.value = undefined
      }
      else if (snapshot.phase === 'ready' && snapshot.error) {
        options.onError(snapshot.error)
        active.value = undefined
      }
      return
    }
    if (recording.seen) {
      if (recording.finishing)
        options.onSent?.()
      active.value = undefined
    }
  })

  function fail(cause: unknown, fallback: string) {
    active.value = undefined
    options.onError(errorMessageFrom(cause) ?? fallback)
  }

  /** Starts one recording. A second call while a recording is active does nothing. */
  async function start(mode: VoiceComposerMode) {
    if (active.value)
      return

    const id = nanoid()
    const sessionId = options.sessionId()
    if (mode === 'audio') {
      active.value = { mode, id, finishing: false, seen: false }
      const replyToMessageId = options.replyToMessageId?.()
      const tools = options.tools?.()
      await controls.messageCommand({ type: 'record', id, sessionId, ...(replyToMessageId ? { replyToMessageId } : {}), ...(tools ? { tools: [...tools] } : {}) })
        .catch(cause => fail(cause, 'Could not start recording'))
      return
    }

    active.value = { mode, id, finishing: false }
    await controls.command({ type: 'begin', requestId: id, sessionId, target: 'composer' })
      .catch(cause => fail(cause, 'Could not start dictation'))
  }

  /**
   * Ends the recording normally.
   * A voice message is sent after encoding. Dictation text goes to `onTranscript`.
   * A recording that has not captured audio yet is discarded, because it has nothing to send.
   */
  async function finish() {
    const recording = active.value
    if (!recording || recording.finishing)
      return
    if (phase.value === 'starting')
      return cancel()

    recording.finishing = true
    active.value = { ...recording }
    if (recording.mode === 'audio') {
      await controls.messageCommand({ type: 'finish', id: recording.id, send: true })
        .catch(cause => fail(cause, 'Could not finish recording'))
      return
    }

    try {
      const result = await controls.command({ type: 'end', requestId: recording.id })
      if (result.text)
        options.onTranscript(result.text)
      if (active.value?.id === recording.id)
        active.value = undefined
    }
    catch (cause) {
      fail(cause, 'Could not finish dictation')
    }
  }

  /** Discards the recording. Nothing is sent or inserted. */
  async function cancel() {
    const recording = active.value
    if (!recording)
      return

    active.value = undefined
    if (recording.mode === 'audio')
      await controls.messageCommand({ type: 'discard', id: recording.id }).catch(() => {})
    else
      await controls.command({ type: 'cancel', requestId: recording.id }).catch(() => {})
  }

  async function retry(id: string) {
    await controls.messageCommand({ type: 'send', id }).then(() => options.onSent?.()).catch(cause => options.onError(errorMessageFrom(cause) ?? 'Could not send voice message'))
  }

  async function discard(id: string) {
    await controls.messageCommand({ type: 'discard', id }).catch(() => {})
  }

  onScopeDispose(() => {
    void cancel()
  })

  return {
    /** Whether the voice host is connected. Controls are unusable without it. */
    available: computed(() => controls.snapshot.connected),
    /** Whether dictation can run. Dictation needs a configured Hearing transcription provider. */
    transcriptionConfigured: computed(() => hearing.configured),
    mode: computed(() => active.value?.mode),
    phase,
    transcript,
    level,
    startedAt,
    unsent,
    start,
    finish,
    cancel,
    retry,
    discard,
  }
}

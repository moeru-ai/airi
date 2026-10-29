import type { ChatToolReference } from '../../../../types/chat'

import { errorMessageFrom } from '@moeru/std'
import { useNow } from '@vueuse/core'
import { nanoid } from 'nanoid/non-secure'
import { computed, onScopeDispose, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { getSpeechBusContext, voiceMessageDropped } from '../../../../services/speech/bus'
import { useHearingStore } from '../../../../stores/modules/hearing'
import { useVoiceControlsStore } from '../../../../stores/voice-controls'
import { formatClockDuration } from '../../../../utils/clock-duration'

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

/**
 * How `finish` ended a recording.
 *
 * - `inserted`: dictation produced text, and `onTranscript` received it.
 * - `empty`: dictation ended without text.
 * - `finished`: the host finished a voice message. It sends it or keeps it pending.
 * - `cancelled`: the recording had not captured audio yet, or another action cancelled it while it finished.
 * - `failed`: the host could not finish it. `onError` received the reason.
 *
 * A host sends dictated text only on `inserted`, so a cancelled or failed dictation never sends text typed earlier.
 */
export type VoiceComposerFinish = 'inserted' | 'empty' | 'finished' | 'cancelled' | 'failed'

/** How `send` ended. `busy` means that a send of the same message still runs, so the host does nothing. */
export type VoiceComposerSend = 'sent' | 'failed' | 'busy'

export interface UseVoiceComposerOptions {
  /** Session that owns a new recording. Read once when recording starts. */
  sessionId: () => string
  /** Reply target of a new voice message. Read once when recording starts. */
  replyToMessageId?: () => string | undefined
  /** Request tools of a new voice message. Read once when recording starts. */
  tools?: () => ChatToolReference[] | undefined
  /** Receives the final dictation text. */
  onTranscript: (text: string) => void
  /** Receives a voice message that the host started to send. */
  onSent?: () => void
  /** Receives start, capture, and send failures. */
  onError: (message: string) => void
}

/** The recording that this control started. The host identifies it by `id`. */
/** The recording that this control started. The host identifies it by `id`. `seen` is true after the host published it. */
type ActiveRecording
  = { mode: 'audio', id: string, finishing: boolean, seen: boolean, send: boolean }
    | { mode: 'transcription', id: string, finishing: boolean, seen: boolean }

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
  const { t } = useI18n()
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

  /**
   * Recorded voice messages of this session that wait for the user.
   * A message waits when it finished without sending, or when its send failed. Then `error` is set.
   * Each one keeps its recording until the user sends or discards it.
   */
  const pending = computed(() => controls.messages.filter(item => item.sessionId === options.sessionId() && item.phase === 'ready' && item.id !== active.value?.id))

  const transcript = computed(() => input.value?.text ?? '')
  const level = computed(() => phase.value === 'recording' ? controls.level : 0)

  /** When capture ended. The time stops there while the recording finishes. */
  const stoppedAt = shallowRef<number>()
  watch(phase, (value) => {
    if (value === 'recording')
      startedAt.value ??= Date.now()
    if (value === 'processing')
      stoppedAt.value = Date.now()
    if (value === 'idle') {
      startedAt.value = undefined
      stoppedAt.value = undefined
    }
  })
  const now = useNow({ interval: 250 })
  /** The recording time as `m:ss`. It runs while capture runs and stops while the recording finishes. */
  const elapsed = computed(() => {
    if (!startedAt.value)
      return formatClockDuration(0)
    return formatClockDuration(((stoppedAt.value ?? now.value.getTime()) - startedAt.value) / 1000)
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
      // A recording finished without sending becomes a pending message. The control is free for the next recording.
      // The host can also finish a recording that the user did not stop, when the microphone turns off or another
      // window takes it. That recording waits for the user too.
      else if (snapshot.phase === 'ready' && (!recording.finishing || !recording.send)) {
        active.value = undefined
      }
      // The host owns a message that it sends. The send can wait in the session queue behind a reply, so the control
      // does not wait for it. A failed send returns the message to `pending` with its error.
      else if (snapshot.phase === 'sending' && recording.finishing) {
        options.onSent?.()
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

  // The input can settle before this control finished it. Another control can cancel it, for example Escape on the
  // voice presence card. The host can also fail to capture, for example when microphone access is denied. The control
  // is free again either way. The host clears its error when an input begins, so an error now belongs to this input.
  // The input can settle, or leave the snapshot, before this control finished it. Another control can cancel it, for
  // example Escape on the voice presence card. The host can fail to capture, for example when microphone access is
  // denied, or drop the input when Hearing turns off. The control is free again in each case. The host clears its error
  // when an input begins, so an error now belongs to this input.
  watch(input, (snapshot) => {
    const recording = active.value
    if (recording?.mode !== 'transcription' || recording.finishing)
      return
    if (!snapshot) {
      if (recording.seen)
        active.value = undefined
      return
    }
    recording.seen = true
    if (snapshot.phase !== 'settled')
      return
    active.value = undefined
    if (controls.snapshot.error)
      options.onError(controls.snapshot.error)
  })

  // A sent message can leave the chat again when its transcript has no speech. Only the recording control reports it.
  const recorded = new Set<string>()
  const stopDropped = getSpeechBusContext().on(voiceMessageDropped, ({ body }) => {
    if (body && recorded.delete(body.id))
      options.onError(t('stage.chat.voice-message.no-speech'))
  })
  onScopeDispose(stopDropped)

  /** Ends the recording `id` with an error. A newer recording keeps the control, so a late failure only reports. */
  function fail(id: string, cause: unknown, fallback: string) {
    if (active.value?.id === id)
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
      recorded.add(id)
      active.value = { mode, id, finishing: false, seen: false, send: true }
      const replyToMessageId = options.replyToMessageId?.()
      const tools = options.tools?.()
      const result = await controls.messageCommand({ type: 'record', id, sessionId, ...(replyToMessageId ? { replyToMessageId } : {}), ...(tools ? { tools: [...tools] } : {}) })
        .catch((cause) => {
          fail(id, cause, 'Could not start recording')
          return undefined
        })
      // The host refuses without an error, for example while the microphone switch is off or another window records.
      if (result?.status === 'closed')
        fail(id, undefined, t('stage.chat.voice-composer.unavailable'))
      return
    }

    active.value = { mode, id, finishing: false, seen: false }
    const result = await controls.command({ type: 'begin', requestId: id, sessionId, target: 'composer' })
      .catch((cause) => {
        fail(id, cause, 'Could not start dictation')
        return undefined
      })
    if (result?.status === 'closed')
      fail(id, undefined, t('stage.chat.voice-composer.unavailable'))
  }

  /**
   * Ends the recording normally.
   * A voice message is sent after encoding when `send` is true. Otherwise it waits in `pending`.
   * Dictation text goes to `onTranscript`.
   * A recording that has not captured audio yet is discarded, because it has nothing to send.
   */
  async function finish(finishOptions: {
    /**
     * Sends a voice message after encoding. Dictation ignores it.
     * @default true
     */
    send?: boolean
  } = {}): Promise<VoiceComposerFinish> {
    const recording = active.value
    if (!recording || recording.finishing)
      return 'cancelled'
    if (phase.value === 'starting') {
      await cancel()
      return 'cancelled'
    }

    const sendAfterEncoding = finishOptions.send ?? true
    active.value = recording.mode === 'audio' ? { ...recording, finishing: true, send: sendAfterEncoding } : { ...recording, finishing: true }
    if (recording.mode === 'audio') {
      // The control can already be free when an auto send fails, for example on a recording without speech.
      // Then a newer recording keeps the control, and only the error is reported.
      try {
        await controls.messageCommand({ type: 'finish', id: recording.id, send: sendAfterEncoding })
        return 'finished'
      }
      catch (cause) {
        fail(recording.id, cause, 'Could not finish recording')
        return 'failed'
      }
    }

    try {
      const result = await controls.command({ type: 'end', requestId: recording.id })
      // A cancel while the transcript finished, for example Escape, discards the text the host still returned.
      if (active.value?.id !== recording.id)
        return 'cancelled'
      active.value = undefined
      if (!result.text)
        return 'empty'
      options.onTranscript(result.text)
      return 'inserted'
    }
    catch (cause) {
      fail(recording.id, cause, 'Could not finish dictation')
      return 'failed'
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

  /**
   * Sends a pending voice message, or sends a failed one again. `text` goes into the same user message.
   * Returns whether the chat accepted it. A failure is reported through `onError` and keeps the message pending.
   */
  /** Voice messages whose send runs now. A second send of one of them, for example a double Enter, does nothing. */
  const sending = new Set<string>()

  async function send(id: string, text?: string): Promise<VoiceComposerSend> {
    if (sending.has(id))
      return 'busy'
    sending.add(id)
    try {
      await controls.messageCommand({ type: 'send', id, ...(text?.trim() ? { text } : {}) })
      options.onSent?.()
      return 'sent'
    }
    catch (cause) {
      options.onError(errorMessageFrom(cause) ?? 'Could not send voice message')
      return 'failed'
    }
    finally {
      sending.delete(id)
    }
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
    elapsed,
    pending,
    start,
    finish,
    cancel,
    send,
    discard,
  }
}

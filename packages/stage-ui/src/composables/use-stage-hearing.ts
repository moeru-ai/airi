import type { MaybeRefOrGetter } from 'vue'

import type { StreamingTranscriptionSegment } from '../stores/modules/streaming-transcription-consumers'
import type { VoiceInputSessionEvent } from './audio/voice-input-session'

import { errorMessageFrom } from '@moeru/std'
import { createTranscriptBuffer } from '@proj-airi/pipelines-audio'
import { computed, onScopeDispose, shallowRef, toValue, watch } from 'vue'

import workletUrl from '../workers/vad/process.worklet?worker&url'

import { useSpeakingStore } from '../stores/audio'
import { useChatStore } from '../stores/chat'
import { useChatSessionStore } from '../stores/chat/session-store'
import { useHearingRuntimeStore } from '../stores/hearing-runtime'
import { useAiriCardStore } from '../stores/modules/airi-card'
import { useHearingSpeechInputPipeline, useHearingStore } from '../stores/modules/hearing'
import { useSettingsAudioDevice } from '../stores/settings/audio-device'
import { useSpeechOutputControlStore } from '../stores/speech-output-control'
import { useVoiceInputSession } from './audio/voice-input-session'
import { useHearingCallingWords } from './use-hearing-calling-words'
import { useHearingDelivery } from './use-hearing-delivery'

interface HearingOwner {
  segmentId: string
  sessionId: string
  cardId: string
  generation: number
}

export interface StageHearingOptions {
  consumerId: string
  suspended?: MaybeRefOrGetter<boolean>
  onError?: (error: unknown) => void
  onRecordingChange?: (event: { active: boolean, sessionId: string, segmentId: string }) => void
  onTranscriptionComplete?: (event: { sessionId: string, segmentId: string, text: string }) => void
  onTranscriptionProgress?: (event: { sessionId: string, segmentId: string, text: string }) => void
}

const ASSISTANT_SPEECH_COOLDOWN_MS = 800
const WAKE_SPEECH_TIMEOUT_MS = 15_000

/** Owns foreground calling words, speech capture, and delivery for every Stage client. */
export function useStageHearing(options: StageHearingOptions) {
  const device = useSettingsAudioDevice()
  const hearing = useHearingStore()
  const pipeline = useHearingSpeechInputPipeline()
  const cards = useAiriCardStore()
  const sessions = useChatSessionStore()
  const speaking = useSpeakingStore()
  const delivery = useHearingDelivery()
  const runtimeState = useHearingRuntimeStore()
  const consumerId = `${options.consumerId}:${crypto.randomUUID()}`
  const preparation = shallowRef<typeof runtimeState.preparation>('idle')
  const preparationError = shallowRef<string>()
  runtimeState.ownerId = consumerId
  watch([preparation, preparationError], ([state, error]) => {
    if (runtimeState.ownerId !== consumerId)
      return
    runtimeState.preparation = state
    runtimeState.preparationError = error
  }, { immediate: true, flush: 'sync' })
  const chat = useChatStore()
  const output = useSpeechOutputControlStore()
  const paused = shallowRef(false)
  const coolingDown = shallowRef(false)
  const streamUnavailable = shallowRef(false)
  const shouldUseStreamInput = computed(() => pipeline.supportsStreamInput && !streamUnavailable.value)
  const enabled = computed(() => runtimeState.ownerId === consumerId && device.continuousInputEnabled && !paused.value && !toValue(options.suspended)
    && (device.mode === 'wake-word' || (!speaking.nowSpeaking && !coolingDown.value)))
  const streamOwners = new WeakMap<StreamingTranscriptionSegment, HearingOwner>()
  const transcriptBuffers = new Map<string, ReturnType<typeof createTranscriptBuffer>>()
  // Mode, provider, microphone, and host lifecycle changes invalidate captured segments.
  // Selection changes alone do not invalidate their session or character ownership.
  let generation = 0
  let controller = new AbortController()
  let transition = Promise.resolve()
  let activeStream: MediaStream | undefined
  let wakeOwner: HearingOwner | undefined
  let wakeTimer: ReturnType<typeof setTimeout> | undefined
  let cooldownTimer: ReturnType<typeof setTimeout> | undefined
  let recordingOwner: HearingOwner | undefined
  let nextSegmentId = 0
  const pendingOwners = new Map<string, HearingOwner>()
  let arming = false

  function reportError(error: unknown) {
    preparationError.value = errorMessageFrom(error) ?? 'Could not prepare voice input'
    preparation.value = 'error'
    options.onError?.(error)
  }

  const callingWords = useHearingCallingWords({
    workletUrl,
    onCalled: async (cardId) => { await armWake(cardId) },
    onError: reportError,
  })

  function current(owner: HearingOwner | undefined): owner is HearingOwner {
    return !!owner && owner.generation === generation && enabled.value
      && sessions.sessionMetas[owner.sessionId]?.characterId === owner.cardId
  }

  function captureOwner(): HearingOwner | undefined {
    if (!enabled.value)
      return
    const segmentId = `${consumerId}:${++nextSegmentId}`
    if (device.mode === 'wake-word')
      return current(wakeOwner) ? { ...wakeOwner, segmentId } : undefined
    const sessionId = sessions.activeSessionId
    const cardId = sessions.sessionMetas[sessionId]?.characterId
    return cardId ? { sessionId, cardId, generation, segmentId } : undefined
  }

  function recordingChanged(active: boolean, owner = recordingOwner) {
    if (!owner)
      return
    if (active) {
      recordingOwner = owner
      pendingOwners.set(owner.segmentId, owner)
    }
    else if (recordingOwner?.segmentId === owner.segmentId) {
      recordingOwner = undefined
    }
    if (active || pendingOwners.has(owner.segmentId))
      options.onRecordingChange?.({ active, sessionId: owner.sessionId, segmentId: owner.segmentId })
  }

  function complete(owner: HearingOwner | undefined, text = '') {
    if (!owner || !pendingOwners.has(owner.segmentId))
      return
    recordingChanged(false, owner)
    pendingOwners.delete(owner.segmentId)
    options.onTranscriptionComplete?.({ sessionId: owner.sessionId, segmentId: owner.segmentId, text })
  }

  function readOwner(event: VoiceInputSessionEvent): HearingOwner | undefined {
    const metadata = event.metadata
    return typeof metadata?.segmentId === 'string' && typeof metadata.sessionId === 'string' && typeof metadata.cardId === 'string' && typeof metadata.generation === 'number'
      ? { segmentId: metadata.segmentId, sessionId: metadata.sessionId, cardId: metadata.cardId, generation: metadata.generation }
      : undefined
  }

  function clearWakeTimer() {
    if (wakeTimer)
      clearTimeout(wakeTimer)
    wakeTimer = undefined
  }

  function acceptText(owner: HearingOwner | undefined, text: string) {
    if (!current(owner) || !text.trim())
      return
    complete(owner, text)
    let buffer = transcriptBuffers.get(owner.sessionId)
    if (!buffer) {
      buffer = createTranscriptBuffer({
        flushDelayMs: 250,
        flush: async (transcript) => {
          try {
            if (device.mode === 'wake-word' && wakeOwner?.sessionId === owner.sessionId)
              await finishWake()
            await delivery.deliver(owner.sessionId, transcript, () => current(owner))
          }
          catch (error) {
            options.onError?.(error)
          }
        },
      })
      transcriptBuffers.set(owner.sessionId, buffer)
    }
    buffer.push(text)
  }

  const voice = useVoiceInputSession(() => device.stream, {
    shouldUseStreamInput,
    vad: { threshold: 0.6 },
    captureSegmentMetadata: () => ({ ...captureOwner() }),
    canStartSegment: event => current(readOwner(event)),
    onSegmentStarted: (event) => {
      clearWakeTimer()
      recordingChanged(true, readOwner(event))
    },
    onSegmentStopped: event => recordingChanged(false, readOwner(event)),
    inspectBeforeTranscription: event => ({ skip: !current(readOwner(event)) }),
    inspectAfterTranscription: event => ({ skip: !current(readOwner(event)) }),
    onTranscriptionResult: event => acceptText(readOwner(event), event.text),
    onTranscriptionEmpty: async (event) => {
      complete(readOwner(event))
      await finishWake()
    },
    onRecordingSkipped: event => complete(readOwner(event)),
    onTranscriptionError: async (event) => {
      const { error } = event
      complete(readOwner(event))
      options.onError?.(error)
      await finishWake()
    },
  })

  async function stopSpeech() {
    pipeline.removeStreamingTranscriptionConsumer(consumerId)
    await Promise.all([pipeline.releaseStreamingTranscriptionConsumer(consumerId), voice.stop()])
    recordingChanged(false)
    for (const owner of pendingOwners.values())
      complete(owner)
  }

  async function startSpeech(stream: MediaStream, ticket: number) {
    if (shouldUseStreamInput.value) {
      try {
        await pipeline.transcribeForMediaStream(stream, {
          consumerId,
          abortSignal: controller.signal,
          onSpeechStart: (segment) => {
            const owner = captureOwner()
            if (!current(owner))
              return
            streamOwners.set(segment, owner)
            clearWakeTimer()
            recordingChanged(true, owner)
          },
          onSentenceEnd: (text, segment) => acceptText(segment ? streamOwners.get(segment) : undefined, text),
          onTranscriptionUpdate: (text, segment) => {
            const owner = segment ? streamOwners.get(segment) : undefined
            if (current(owner) && text.trim())
              options.onTranscriptionProgress?.({ sessionId: owner.sessionId, segmentId: owner.segmentId, text })
          },
          onSpeechEnd: (_text, segment) => {
            const owner = segment ? streamOwners.get(segment) : undefined
            if (current(owner)) {
              recordingChanged(false, owner)
              if (!_text.trim()) {
                complete(owner)
                void finishWake().catch(reportError)
              }
            }
          },
        })
        if (pipeline.error)
          throw new Error(pipeline.error)
        return
      }
      catch (error) {
        if (ticket !== generation || controller.signal.aborted)
          return
        if (!pipeline.supportsGenerateOutput)
          throw error
        await pipeline.releaseStreamingTranscriptionConsumer(consumerId)
        streamUnavailable.value = true
      }
    }
    if (ticket === generation && enabled.value)
      await voice.startAutoSegmentation()
  }

  async function finishWake() {
    if (!wakeOwner)
      return
    wakeOwner = undefined
    clearWakeTimer()
    await stopSpeech()
    if (enabled.value && device.mode === 'wake-word')
      await callingWords.resume()
  }

  /** Arms a character after foreground preparation or a native notification handoff. */
  async function armWake(cardId: string) {
    if (!enabled.value || device.mode !== 'wake-word' || arming || wakeOwner || !cards.cards.has(cardId))
      return false
    const ticket = generation
    arming = true
    try {
      if (speaking.nowSpeaking) {
        output.requestStopSpeaking('wake-word')
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      if (ticket !== generation || !enabled.value)
        return false
      const sessionId = await sessions.ensureSessionForCharacter(cardId)
      if (!sessionId || ticket !== generation || !enabled.value || !activeStream)
        return false
      await cards.activateCard(cardId)
      await sessions.setActiveSession(sessionId)
      await callingWords.pause()
      if (ticket !== generation || !enabled.value)
        return false
      wakeOwner = { sessionId, cardId, generation: ticket, segmentId: `${consumerId}:wake-${++nextSegmentId}` }
      // Speech can start while provider startup is still pending. Arm first so that event clears this deadline.
      wakeTimer = setTimeout(() => {
        void finishWake().catch(reportError)
      }, WAKE_SPEECH_TIMEOUT_MS)
      await startSpeech(activeStream, ticket)
      return ticket === generation && enabled.value
    }
    catch (error) {
      await finishWake()
      reportError(error)
      return false
    }
    finally {
      arming = false
    }
  }

  function reconcile() {
    const ticket = ++generation
    controller.abort()
    controller = new AbortController()
    callingWords.stop()
    clearWakeTimer()
    wakeOwner = undefined
    // Completed words retain their captured owner when a mode or lifecycle changes.
    for (const buffer of transcriptBuffers.values())
      void buffer.flushNow()
    transcriptBuffers.clear()
    void voice.stop()
    transition = transition.catch(() => undefined).then(async () => {
      await stopSpeech()
      activeStream = undefined
      if (ticket !== generation || !enabled.value) {
        preparation.value = 'idle'
        return
      }
      preparation.value = 'preparing'
      preparationError.value = undefined
      if (!hearing.configured) {
        preparation.value = 'unconfigured'
        return
      }
      if (!device.stream?.getAudioTracks().some(track => track.readyState === 'live')) {
        await device.askPermission()
        if (ticket !== generation || !enabled.value)
          return
        await device.startStream()
      }
      if (ticket !== generation || !enabled.value || !device.stream)
        return
      activeStream = device.stream
      if (device.mode === 'wake-word') {
        const result = await callingWords.start(activeStream)
        if (ticket === generation) {
          preparation.value = result === 'stale' ? 'idle' : result
          if (result === 'ready')
            device.resetWakeWordSetupPrompt()
          if (result === 'unconfigured') {
            const sessionId = await sessions.ensureCurrentSession()
            if (ticket === generation && enabled.value && sessionId && device.claimWakeWordSetupPrompt())
              void chat.promptCharacter({ sessionId, instruction: 'Ask the user which names or pronunciations they want to use to call you. Save their answer with configure_wake_words.' }).catch(error => options.onError?.(error))
          }
        }
      }
      else {
        await startSpeech(activeStream, ticket)
        if (ticket === generation)
          preparation.value = 'ready'
      }
    }).catch((error) => {
      if (ticket === generation && !controller.signal.aborted)
        reportError(error)
    })
    return transition
  }

  /** Stops this runtime's consumers. The host retains ownership of the microphone stream. */
  async function pause() {
    paused.value = true
    await reconcile()
  }

  /** Requests microphone access and waits until the selected capture mode is prepared. */
  async function resume() {
    paused.value = false
    await reconcile()
  }

  watch(() => speaking.nowSpeaking, (active, previous) => {
    if (cooldownTimer)
      clearTimeout(cooldownTimer)
    if (active) {
      coolingDown.value = false
    }
    else if (previous) {
      coolingDown.value = true
      cooldownTimer = setTimeout(() => {
        coolingDown.value = false
      }, ASSISTANT_SPEECH_COOLDOWN_MS)
    }
  }, { flush: 'sync' })
  watch([enabled, () => device.mode, () => hearing.activeTranscriptionProvider, () => hearing.activeTranscriptionModel], () => {
    streamUnavailable.value = false
    void reconcile()
  }, { immediate: true, flush: 'sync' })
  watch(() => JSON.stringify(callingWords.callingWords.value), () => {
    if (device.mode === 'wake-word')
      void reconcile()
  })
  watch(() => device.stream, (stream) => {
    if (preparation.value === 'ready' && activeStream !== stream)
      void reconcile()
  })
  onScopeDispose(() => {
    if (runtimeState.ownerId === consumerId) {
      runtimeState.ownerId = undefined
      runtimeState.preparation = 'idle'
      runtimeState.preparationError = undefined
    }
    if (cooldownTimer)
      clearTimeout(cooldownTimer)
    void pause()
  })

  return { armWake, pause, resume, preparation, preparationError }
}

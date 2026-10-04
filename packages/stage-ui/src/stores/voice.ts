import type { BeginSpeechInput, SpeechInputAttempt, SpeechOutput, SpeechStream, TurnRef, VoicePluginHandle, VoiceResponse } from '@proj-airi/core-agent'

import type { VoiceActivityOptions } from '../libs/voice/voice-activity-plugin'
import type { VoiceHostSnapshot } from '../services/speech/bus'

import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { turnKey } from '@proj-airi/core-agent'
import { defineStore, storeToRefs } from 'pinia'
import { onScopeDispose, shallowRef, watch } from 'vue'

import { useVoiceController } from '../composables/audio/voice-controller'
import { traceSpeechOutput } from '../composables/speech-output-trace'
import { useVoiceDrafts } from '../composables/voice-drafts'
import { createVoiceActivityPlugin } from '../libs/voice/voice-activity-plugin'
import { getSpeechBusContext, voiceGenerationEnded, voiceGetTurns, voiceInputCommand, voiceInterrupt, voiceRequestSnapshot, voiceRequestTurns, voiceSnapshotChanged, voiceSpeechCommand, voiceTurnsChanged } from '../services/speech/bus'
import { SileroVad } from '../workers/vad/silero-vad'
import { useLlmStreamingControlStore } from './ai/chat-llm/streaming-control'
import { useAudioContext, useSpeakingStore } from './audio'
import { useChatStore } from './chat'
import { useChatSessionStore } from './chat/session-store'
import { useHearingStore } from './modules/hearing'
import { useSettingsAudioDevice } from './settings/audio-device'
import { useVoiceMessagesStore } from './voice-messages'

/** Application wiring owns presentation and durable chat adapters. The controller owns voice lifecycles. */
export const useVoiceStore = defineStore('voice', () => {
  const devices = useSettingsAudioDevice()
  const hearing = useHearingStore()
  const chat = useChatStore()
  const sessions = useChatSessionStore()
  const voiceMessages = useVoiceMessagesStore()
  const speaking = useSpeakingStore()
  const streamingControl = useLlmStreamingControlStore()
  const { stream: microphoneStream, enabled: microphoneEnabled, error: microphoneError } = storeToRefs(devices)
  const { drafts, frontDraftId, acceptSpeech, sendDraft, discardDraft, editDraft, selectDraft } = useVoiceDrafts(report)
  const activeTurns = shallowRef<readonly TurnRef[]>([])
  const responses = new Map<string, { response: VoiceResponse, speech?: SpeechStream }>()
  const audioContext = useAudioContext()
  /** One trace per open response turn. It ends after the response drains, is cancelled, or fails to open. */
  const speechTraces = new Map<string, ReturnType<typeof traceSpeechOutput>>()
  let output: ((turn: TurnRef) => SpeechOutput) | undefined
  let listening: VoicePluginHandle | undefined
  let detectorOptions: Pick<VoiceActivityOptions, 'detectWakeWord' | 'acceptSpeech'> = {}
  const inputRequests = new Map<string, SpeechInputAttempt>()
  let presentedInput: { requestId: string, attempt: SpeechInputAttempt } | undefined

  const { controller, state, snapshot: transcript, error } = useVoiceController({
    transcriber: () => hearing.createTranscriber(),
    speech: (turn) => {
      if (!output)
        throw new Error('Voice output host is not connected')

      const trace = traceSpeechOutput(turn, output(turn), async audio => audioContext.audioContext.decodeAudioData(await audio.arrayBuffer()))
      speechTraces.set(turnKey(turn), trace)
      return trace.output
    },
    submit: acceptSpeech,
    recordInterruption: async (event) => {
      const { groupId, played, status } = event.playback
      const errorMessage = event.playback.status === 'failed' ? errorMessageFrom(event.playback.error) : undefined
      return chat.receiveInterruption({ ...event, playback: { groupId, played, status, ...(errorMessage ? { errorMessage } : {}) } })
    },
    onError: event => report(event.error),
  })

  function report(cause: unknown) {
    error.value = errorMessageFrom(cause) ?? 'Voice operation failed'

    console.error('[voice]', cause)
  }

  controller.onInput((attempt) => {
    presentedInput = { requestId: attempt.id, attempt }
  })

  function publishSnapshot() {
    if (!output)
      return

    const snapshot: VoiceHostSnapshot = {
      connected: true,
      microphone: { enabled: devices.enabled, ready: !!devices.stream, error: devices.error },
      drafts: drafts.value.map(draft => ({ ...draft })),
      frontDraftId: frontDraftId.value,
      error: error.value,
      ...(presentedInput
        ? { input: {
            requestId: presentedInput.requestId,
            sessionId: presentedInput.attempt.sessionId,
            phase: presentedInput.attempt.state.phase,
            text: transcript.value?.transcript.text ?? '',
          } }
        : {}),
    }

    getSpeechBusContext().emit(voiceSnapshotChanged, snapshot)
  }

  watch([state, transcript, frontDraftId, error, microphoneStream, microphoneEnabled, microphoneError], publishSnapshot)
  watch(drafts, publishSnapshot, { deep: true })

  function beginInput(options: BeginSpeechInput) {
    error.value = undefined
    return controller.beginInput(options)
  }

  function beginManual(sessionId: string) {
    return beginInput({ sessionId, interruptTurns: activeTurns.value.filter(turn => turn.sessionId === sessionId), start: { kind: 'after-silence' } })
  }

  function endInput() {
    return controller.activeInput?.end()
  }

  function cancelInput() {
    controller.activeInput?.cancel('Input cancelled by user')
  }

  function updateActiveTurns() {
    activeTurns.value = [...responses.values()].filter(entry => !entry.response.closed).map(entry => entry.response.turn)
    if (output)
      getSpeechBusContext().emit(voiceTurnsChanged, activeTurns.value.map(turn => ({ ...turn })))
  }

  function getResponse(turn: TurnRef) {
    const key = turnKey(turn)
    const existing = responses.get(key)
    if (existing)
      return existing

    let response: VoiceResponse
    try {
      response = controller.openResponse(turn)
    }
    catch (error) {
      endSpeechTrace(key)
      throw error
    }

    const entry: { response: VoiceResponse, speech?: SpeechStream } = { response }
    responses.set(key, entry)
    response.signal.addEventListener('abort', () => {
      streamingControl.cancelTurn(turn.turnId)
      void chat.cancelTurn(turn).catch(report)
      // A cancelled response still fades its playback. finish() shares that drain, so playback spans end first.
      void response.finish().catch(report).finally(() => endSpeechTrace(key))
      updateActiveTurns()
    }, { once: true })

    updateActiveTurns()
    return entry
  }

  function endSpeechTrace(key: string) {
    speechTraces.get(key)?.end()
    speechTraces.delete(key)
  }

  function startResponse(turn: TurnRef) {
    const entry = getResponse(turn)
    entry.speech ??= entry.response.openSpeech({ purpose: 'answer' })
  }

  function getSpeech(turn: TurnRef) {
    return responses.get(turnKey(turn))?.speech
  }

  async function finishResponse(turn: TurnRef) {
    const key = turnKey(turn)
    const entry = responses.get(key)
    if (!entry)
      return

    const result = await entry.response.finish()
    streamingControl.completeTurn(turn.turnId)
    responses.delete(key)
    endSpeechTrace(key)
    updateActiveTurns()

    return result
  }

  function interrupt(turns: readonly TurnRef[], cause: string) {
    return controller.interrupt({ turns, cause })
  }

  /** The mounted scene supplies its browser output. Detachment stops only this host's responses. */
  function connectOutput(factory: (turn: TurnRef) => SpeechOutput) {
    if (output)
      throw new Error('Voice output host is already connected')

    output = factory
    const context = getSpeechBusContext()
    const producers = new Map<string, SpeechStream>()
    const opened = new Set<string>()
    const stops = [
      voiceMessages.connect(),
      context.on(voiceGenerationEnded, ({ body }) => {
        if (!body)
          return
        const entry = responses.get(turnKey(body))
        if (body.status !== 'finished')
          entry?.response.cancel(`Generation ${body.status}`)

        void finishResponse(body).catch(report)
      }),
      context.on(voiceRequestSnapshot, publishSnapshot),
      defineInvokeHandler(context, voiceInputCommand, async (command) => {
        switch (command.type) {
          case 'begin': {
            if (inputRequests.has(command.requestId))
              return { status: 'closed' }

            const attempt = beginManual(command.sessionId)
            inputRequests.set(command.requestId, attempt)
            void attempt.done.then(() => {
              if (inputRequests.get(command.requestId) === attempt)
                inputRequests.delete(command.requestId)
            })
            presentedInput = { requestId: command.requestId, attempt }
            publishSnapshot()

            break
          }
          case 'end': {
            const attempt = inputRequests.get(command.requestId)
            if (!attempt)
              return { status: 'closed' }

            await attempt.end()
            break
          }
          case 'cancel': {
            const attempt = inputRequests.get(command.requestId)
            if (!attempt)
              return { status: 'closed' }

            attempt.cancel('Input control cancelled')
            break
          }
          case 'edit-draft': {
            if (!editDraft(command.draftId, command.text))
              return { status: 'closed' }
            break
          }
          case 'send-draft':
            await sendDraft(command.draftId)
            break
          case 'discard-draft':
            if (!discardDraft(command.draftId))
              return { status: 'closed' }
            break
          case 'select-draft': {
            if (!selectDraft(command.draftId))
              return { status: 'closed' }
            break
          }
        }
        publishSnapshot()
        return { status: 'accepted' }
      }),
      context.on(voiceRequestTurns, () => context.emit(voiceTurnsChanged, activeTurns.value.map(turn => ({ ...turn })))),
      defineInvokeHandler(context, voiceGetTurns, () => activeTurns.value.map(turn => ({ ...turn }))),
      defineInvokeHandler(context, voiceInterrupt, async request => ({ status: (await interrupt(request.turns, request.cause).done).status })),
      defineInvokeHandler(context, voiceSpeechCommand, async (body) => {
        // The full key isolates a producer from other windows and turns.
        const key = JSON.stringify([body.originId, body.producerId, body.turn.sessionId, body.turn.turnId])
        if (body.type === 'open') {
          if (opened.has(key))
            return { status: producers.has(key) ? 'accepted' : 'closed' }

          opened.add(key)
          const speech = getResponse(body.turn).response.openSpeech({ purpose: body.purpose })
          producers.set(key, speech)
          void speech.done.then(() => producers.delete(key))

          return { status: 'accepted' }
        }
        if (body.type === 'finish' && opened.has(key)) {
          const status = await finishResponse(body.turn)
          producers.delete(key)
          return { status: status ?? 'closed' }
        }

        const speech = producers.get(key)
        if (!speech)
          return { status: 'closed' }

        switch (body.type) {
          case 'text': return speech.write(body.value)
          case 'special':
            speech.special(body.value)
            break
          case 'flush':
            speech.flush()
            break
          case 'end':
            speech.end()
            break
          case 'cancel':
            speech.cancel(body.reason)
            producers.delete(key)
            break
        }

        return { status: 'accepted' }
      }),
    ]

    updateActiveTurns()
    publishSnapshot()

    return () => {
      stops.forEach(stop => stop())
      output = undefined
      for (const entry of responses.values())
        entry.response.cancel('Voice output host detached')
      responses.clear()
      for (const attempt of inputRequests.values())
        attempt?.cancel('Voice host detached')

      inputRequests.clear()
      updateActiveTurns()
      context.emit(voiceTurnsChanged, [])
      context.emit(voiceSnapshotChanged, { connected: false, drafts: drafts.value.map(draft => ({ ...draft })) })
    }
  }

  function startListening(options: Pick<VoiceActivityOptions, 'detectWakeWord' | 'acceptSpeech'> = detectorOptions) {
    if (listening)
      return

    detectorOptions = options
    const model = new SileroVad()
    const plugin = createVoiceActivityPlugin({
      detect: (window, signal) => model.score(window, signal),
      detectWakeWord: options.detectWakeWord,
      enabled: () => !voiceMessages.isRecording,
      // Automatic barge-in requires platform echo cancellation or an external echo classifier.
      acceptSpeech: options.acceptSpeech ?? (async () => !speaking.nowSpeaking || devices.source.echoCancellation),
      target: () => sessions.activeSessionId && hearing.configured
        ? { sessionId: sessions.activeSessionId, interruptTurns: activeTurns.value.filter(turn => turn.sessionId === sessions.activeSessionId) }
        : undefined,
    })

    listening = controller.use({ ...plugin, setup(scope) {
      plugin.setup(scope)
      scope.onDispose(() => model.close())
      return undefined
    } }, { grants: ['input-control', 'cancel-input'], onError: event => report(event.error) })
  }

  /** A KWS adapter calls this only after the device's pronunciation catalog selects a character. */
  async function resolveWakeTarget(characterId: string, signal: AbortSignal) {
    signal.throwIfAborted()
    const sessionId = await sessions.ensureCharacterSession(characterId)
    signal.throwIfAborted()

    return { sessionId, interruptTurns: activeTurns.value.filter(turn => turn.sessionId === sessionId) }
  }

  /** Disposing the plugin ends its observation, which releases the microphone if nothing else uses it. */
  async function stopListening() {
    const previous = listening
    listening = undefined
    cancelInput()
    await previous?.dispose()
  }

  onScopeDispose(() => {
    void stopListening()
  })

  return { controller, state, transcript, error, drafts, activeTurns, beginInput, beginManual, endInput, cancelInput, sendDraft, discardDraft, startResponse, getSpeech, finishResponse, interrupt, connectOutput, startListening, stopListening, resolveWakeTarget }
})

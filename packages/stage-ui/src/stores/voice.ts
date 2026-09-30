import type { BeginSpeechInput, Response, SpeechInputAttempt, SpeechOutput, SpeechStream, SpeechSubmission, TurnRef, VoicePluginHandle } from '@proj-airi/core-agent'

import type { VoiceActivityOptions } from '../libs/voice/voice-activity-plugin'
import type { VoiceDraft, VoiceHostSnapshot } from '../services/speech/bus'

import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { defineStore, storeToRefs } from 'pinia'
import { onScopeDispose, ref, shallowRef, watch } from 'vue'

import { useVoiceController } from '../composables/audio/voice-controller'
import { createVoiceActivityPlugin } from '../libs/voice/voice-activity-plugin'
import { getSpeechBusContext, voiceGenerationEnded, voiceGetTurns, voiceInputCommand, voiceInterrupt, voiceRequestSnapshot, voiceRequestTurns, voiceSnapshotChanged, voiceSpeechCommand, voiceTurnsChanged } from '../services/speech/bus'
import { SileroVad } from '../workers/vad/silero-vad'
import { useLlmStreamingControlStore } from './ai/chat-llm/streaming-control'
import { useSpeakingStore } from './audio'
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
  const { input: audioInput, enabled: microphoneEnabled, error: microphoneError } = storeToRefs(devices)
  const drafts = ref<VoiceDraft[]>([])
  const frontDraftId = ref<string>()
  const sendingDrafts = new Map<string, ReturnType<typeof chat.submit>>()
  const draftSources = new Map<string, SpeechSubmission[]>()
  const activeTurns = shallowRef<readonly TurnRef[]>([])
  const responses = new Map<string, { response: Response, speech?: SpeechStream }>()
  let output: ((turn: TurnRef) => SpeechOutput) | undefined
  let listening: VoicePluginHandle | undefined
  let listeningInput: ReturnType<typeof devices.acquireInput> | undefined
  let detectorOptions: Pick<VoiceActivityOptions, 'detectWakeWord' | 'acceptSpeech'> = {}
  const inputRequests = new Map<string, SpeechInputAttempt | undefined>()
  let presentedInput: { requestId: string, attempt: SpeechInputAttempt } | undefined

  const { controller, state, snapshot: transcript, error } = useVoiceController({
    transcriber: () => hearing.createTranscriber(),
    speech: (turn) => {
      if (!output)
        throw new Error('Voice output host is not connected')
      return output(turn)
    },
    submit: acceptSpeech,
    recordInterruption: async (event) => {
      const { error, ...playback } = event.playback
      return chat.receiveInterruption({ ...event, playback: { ...playback, ...(error ? { errorMessage: errorMessageFrom(error) } : {}) } })
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
      microphone: { enabled: devices.enabled, ready: !!devices.input, error: devices.error },
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
  watch([state, transcript, frontDraftId, error, audioInput, microphoneEnabled, microphoneError], publishSnapshot)
  watch(drafts, publishSnapshot, { deep: true })

  watch(audioInput, (audio, previous) => {
    if (audio === previous || (!previous && audio))
      return
    const wasListening = !!listening
    void stopListening()
    if (wasListening && devices.enabled)
      startListening()
  }, { flush: 'sync' })

  async function acceptSpeech(submission: SpeechSubmission, signal: AbortSignal) {
    signal.throwIfAborted()
    const text = submission.text.trim()
    const existing = !hearing.autoSendEnabled && drafts.value.find(draft => draft.sessionId === submission.sessionId && !sendingDrafts.has(draft.id))
    const draft = existing || { id: submission.submissionId, sessionId: submission.sessionId, rawText: '', text: '' }
    draft.text = [draft.text, text].filter(Boolean).join('\n')
    const sources = draftSources.get(draft.id) ?? []
    sources.push(submission)
    draftSources.set(draft.id, sources)
    const updated = { ...draft, rawText: sources.map(source => source.transcript.raw.text).join('\n') }
    drafts.value = [...drafts.value.filter(item => item.id !== draft.id), updated]
    frontDraftId.value = draft.id
    if (!hearing.autoSendEnabled || !text)
      return { status: 'drafted' as const, draftId: draft.id }
    const receipt = await sendDraft(draft.id, signal)
    return { status: 'committed' as const, messageId: receipt.messageId }
  }

  async function sendDraft(id: string, signal?: AbortSignal) {
    const sending = sendingDrafts.get(id)
    if (sending)
      return sending
    const draft = drafts.value.find(item => item.id === id)
    if (!draft)
      throw new Error('Voice draft is unavailable')
    signal?.throwIfAborted()
    const turn = { sessionId: draft.sessionId, turnId: draft.id }
    const cancel = () => {
      void chat.cancelTurn(turn).catch(report)
    }
    // Prompt formatting is an application transport boundary. Core plugin context keeps its original typed values.
    const evidence = draftSources.get(id)?.map(source => ({ context: source.context, speakers: source.speakers }))
    const speechContext = evidence?.some(item => item.context.length || item.speakers)
      ? JSON.stringify(evidence, (_key, value: unknown) => {
          if (value instanceof Map)
            return [...value.entries()]
          if (value instanceof Set)
            return [...value]
          return typeof value === 'bigint' ? value.toString() : value
        })
      : undefined
    signal?.addEventListener('abort', cancel, { once: true })
    const committed = chat.submit({ sessionId: draft.sessionId, messageId: draft.id, text: draft.text, speechContext }).then((receipt) => {
      discardDraft(id)
      return receipt
    }).finally(() => {
      sendingDrafts.delete(id)
      signal?.removeEventListener('abort', cancel)
    })
    sendingDrafts.set(id, committed)
    return committed
  }

  function discardDraft(id: string) {
    drafts.value = drafts.value.filter(item => item.id !== id)
    draftSources.delete(id)
    if (frontDraftId.value === id)
      frontDraftId.value = drafts.value.at(-1)?.id
  }

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
    const key = JSON.stringify([turn.sessionId, turn.turnId])
    const existing = responses.get(key)
    if (existing)
      return existing
    const response = controller.openResponse(turn)
    const entry: { response: Response, speech?: SpeechStream } = { response }
    responses.set(key, entry)
    response.signal.addEventListener('abort', () => {
      streamingControl.cancelTurn(turn.turnId)
      void chat.cancelTurn(turn).catch(report)
      updateActiveTurns()
    }, { once: true })
    updateActiveTurns()
    return entry
  }

  function startResponse(turn: TurnRef) {
    const entry = getResponse(turn)
    entry.speech ??= entry.response.openSpeech({ purpose: 'answer' })
  }

  function getSpeech(turn: TurnRef) {
    return responses.get(JSON.stringify([turn.sessionId, turn.turnId]))?.speech
  }

  async function finishResponse(turn: TurnRef) {
    const key = JSON.stringify([turn.sessionId, turn.turnId])
    const entry = responses.get(key)
    if (!entry)
      return
    const result = await entry.response.finish()
    streamingControl.completeTurn(turn.turnId)
    responses.delete(key)
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
        const entry = responses.get(JSON.stringify([body.sessionId, body.turnId]))
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
                inputRequests.set(command.requestId, undefined)
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
            const draft = drafts.value.find(draft => draft.id === command.draftId)
            if (!draft || sendingDrafts.has(draft.id))
              return { status: 'closed' }
            draft.text = command.text
            break
          }
          case 'send-draft':
            await sendDraft(command.draftId)
            break
          case 'discard-draft':
            if (sendingDrafts.has(command.draftId))
              return { status: 'closed' }
            discardDraft(command.draftId)
            break
          case 'select-draft': {
            if (!drafts.value.some(draft => draft.id === command.draftId))
              return { status: 'closed' }
            frontDraftId.value = command.draftId
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
    listeningInput = devices.acquireInput()
    void listeningInput.input.catch(report)
    const model = new SileroVad()
    const plugin = createVoiceActivityPlugin({
      detect: (window, signal) => model.score(window, signal),
      detectWakeWord: options.detectWakeWord,
      enabled: () => !voiceMessages.isRecording,
      // Automatic barge-in requires platform echo cancellation or an external echo classifier.
      acceptSpeech: options.acceptSpeech ?? (async () => !speaking.nowSpeaking || devices.connection?.echoCancellation === true),
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

  async function stopListening() {
    const previous = listening
    const input = listeningInput
    listeningInput = undefined
    listening = undefined
    cancelInput()
    await previous?.dispose()
    await input?.release()
  }

  onScopeDispose(() => {
    void stopListening()
  })

  return { controller, state, transcript, error, drafts, activeTurns, beginInput, beginManual, endInput, cancelInput, sendDraft, discardDraft, startResponse, getSpeech, finishResponse, interrupt, connectOutput, startListening, stopListening, resolveWakeTarget }
})

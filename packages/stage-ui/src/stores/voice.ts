import type { BeginSpeechInput, SpeechInputAttempt, SpeechOutput, SpeechStream, SpeechSubmission, TurnRef, VoicePluginHandle, VoiceResponse } from '@proj-airi/core-agent'

import type { VoiceActivityOptions } from '../libs/voice/voice-activity-plugin'
import type { VoiceHostSnapshot } from '../services/speech/bus'
import type { ChatHistoryItem, ChatToolReference } from '../types/chat'

import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { turnKey } from '@proj-airi/core-agent'
import { defineStore, storeToRefs } from 'pinia'
import { onScopeDispose, reactive, shallowRef, watch } from 'vue'

import { useVoiceController } from '../composables/audio/voice-controller'
import { traceSpeechOutput } from '../composables/speech-output-trace'
import { useVoiceDrafts } from '../composables/voice-drafts'
import { useVoiceEndJudge } from '../composables/voice-end-judge'
import { createVoiceInputTracer } from '../composables/voice-input-trace'
import { useListeningLeasedElsewhere } from '../composables/voice-listening-lease'
import { useVoicePhoneticRerank } from '../composables/voice-phonetic-rerank'
import { useVoiceRephrase } from '../composables/voice-rephrase'
import { observeInputLevel } from '../libs/voice/input-level'
import { collectConversationHotwords, conversationMessagesOf, TranscriptionBiasList } from '../libs/voice/transcription-bias'
import { createVoiceActivityPlugin } from '../libs/voice/voice-activity-plugin'
import { createVoiceEndJudgePlugin } from '../libs/voice/voice-end-judge-plugin'
import { createVoicePhoneticMatchPlugin } from '../libs/voice/voice-phonetic-match-plugin'
import { createVoiceRephrasePlugin } from '../libs/voice/voice-rephrase-plugin'
import { getSpeechBusContext, voiceGenerationEnded, voiceGetTurns, voiceInputCommand, voiceInputLevel, voiceInterrupt, voiceLevelMonitor, voiceRequestSnapshot, voiceRequestTurns, voiceSnapshotChanged, voiceSpeechCommand, voiceTurnsChanged } from '../services/speech/bus'
import { SileroVad } from '../workers/vad/silero-vad'
import { useLlmStreamingControlStore } from './ai/chat-llm/streaming-control'
import { useAudioContext, useSpeakingStore } from './audio'
import { useChatStore } from './chat'
import { useChatSessionStore } from './chat/session-store'
import { startsInputOnSpeech, useHearingStore } from './modules/hearing'
import { usePhoneticVocabularyStore } from './phonetic-vocabulary'
import { useSettingsAudioDevice } from './settings/audio-device'
import { useVoiceMessagesStore } from './voice-messages'
import { useWakeWordDetectionStore } from './wake-word-detection'

/** The longest time a chat model rewrite can delay a voice submission. */
const VOICE_REPHRASE_TIMEOUT_MS = 10_000

/**
 * Speech detection and end-of-turn values of one window.
 *
 * The voice pipeline devtool edits them for the window that it runs in. They are not saved, so a reload restores
 * {@link VOICE_TUNING_DEFAULTS}.
 */
export interface VoiceTuning {
  /** The VAD score that starts speech. A live input keeps speech active from 30 percent of it. */
  vadThreshold: number
  /** Shorter speech is discarded when silence ends an input. */
  minSpeechMs: number
  /** Audio kept before the detected speech onset. Listening reads it when it starts. */
  preRollMs: number
  /** A pause this long can end a finished message. Without the end judge, it is the silence limit. */
  pauseMs: number
  /**
   * With the end judge, the silence limit grows by this much, so a speaker can stop to think.
   * The judge ends a finished message at the pause, so only an unfinished or unjudged message waits for the grace.
   */
  graceMs: number
  /** Sends the conversation terms as hotwords to a provider that takes them. */
  sendHotwords: boolean
}

export const VOICE_TUNING_DEFAULTS: Readonly<VoiceTuning> = Object.freeze({
  vadThreshold: 0.6,
  minSpeechMs: 300,
  preRollMs: 360,
  pauseMs: 1200,
  graceMs: 3000,
  sendHotwords: true,
})

/** The VAD score of one window, at the time it arrived. */
export interface VoiceActivityScore {
  /** Milliseconds since the epoch. */
  readonly ts: number
  readonly score: number
  /** The threshold that applied to the window. It is lower while an input of the voice activity plugin runs. */
  readonly threshold: number
  readonly durationMs: number
}

/** Application wiring owns presentation and durable chat adapters. The controller owns voice lifecycles. */
export const useVoiceStore = defineStore('voice', () => {
  const devices = useSettingsAudioDevice()
  const hearing = useHearingStore()
  const chat = useChatStore()
  const sessions = useChatSessionStore()
  const voiceMessages = useVoiceMessagesStore()
  const speaking = useSpeakingStore()
  const streamingControl = useLlmStreamingControlStore()
  const wakeWordDetection = useWakeWordDetectionStore()
  const phoneticVocabulary = usePhoneticVocabularyStore()
  const { stream: microphoneStream, enabled: microphoneEnabled, error: microphoneError } = storeToRefs(devices)
  /** The application tool selection for spoken turns. Without a connection, spoken turns send no tools. */
  let requestTools: (() => readonly ChatToolReference[]) | undefined
  const { drafts, frontDraftId, acceptSpeech, sendDraft, discardDraft, editDraft, selectDraft } = useVoiceDrafts(report, () => requestTools?.())
  const activeTurns = shallowRef<readonly TurnRef[]>([])
  const responses = new Map<string, { response: VoiceResponse, speech?: SpeechStream }>()
  const audioContext = useAudioContext()
  /** One trace per open response turn. It ends after the response drains, is cancelled, or fails to open. */
  const speechTraces = new Map<string, ReturnType<typeof traceSpeechOutput>>()
  let output: ((turn: TurnRef) => SpeechOutput) | undefined
  /** The output host also takes speech and input commands of other windows, and publishes its state to them. */
  let servesOtherWindows = false
  let listening: VoicePluginHandle | undefined
  let detectorOptions: Pick<VoiceActivityOptions, 'detectWakeWord' | 'acceptSpeech'> = {}
  const inputRequests = new Map<string, SpeechInputAttempt>()
  /**
   * Inputs that a composer began, keyed by attempt ID. Submission stores the final text here instead of creating a draft.
   * The `end` command returns the text and removes the entry. A settled attempt removes it too.
   */
  const composerInputs = new Map<string, string | undefined>()
  let presentedInput: { requestId: string, attempt: SpeechInputAttempt } | undefined

  const inputTracer = createVoiceInputTracer()
  const tuning = reactive<VoiceTuning>({ ...VOICE_TUNING_DEFAULTS })
  /** Observers of the VAD scores and the speech submissions. Devtools read the pipeline through them. */
  const scoreObservers = new Set<(score: VoiceActivityScore) => void>()
  const submissionObservers = new Set<(submission: SpeechSubmission) => void>()
  /** While another window holds the listening lease, it owns the microphone, so controls of other windows start no input here. */
  const listeningLeasedElsewhere = useListeningLeasedElsewhere()
  // The lease also stops the inputs that such controls run now. The holder already hears the same speech.
  watch(listeningLeasedElsewhere, (leased) => {
    if (!leased)
      return
    for (const attempt of inputRequests.values())
      attempt.cancel('Another window took the microphone')
  })

  /**
   * Conversation terms that bias the next recognition request of each session.
   * A list is rebuilt when a loaded session's messages change, for example after an assistant turn, a deletion,
   * or a wake word that loads a chat that is not active. Speech start only reads the prepared list.
   */
  const transcriptionBias = new TranscriptionBiasList([{
    name: 'conversation',
    collect: async (sessionId) => {
      const messages = sessions.getSessionMessagesIfLoaded(sessionId)
      if (!messages)
        return []
      return collectConversationHotwords(conversationMessagesOf(messages))
    },
  }], { onError: (source, cause) => console.warn(`[voice] Hotword source ${source} failed`, cause) })
  // The session store replaces a session's message array on every change, so a new array reference marks a change.
  const biasedMessages = new Map<string, readonly ChatHistoryItem[]>()
  const stopBiasRebuild = watch(() => sessions.sessionMessages, (loaded) => {
    for (const [sessionId, messages] of Object.entries(loaded)) {
      if (biasedMessages.get(sessionId) === messages)
        continue
      biasedMessages.set(sessionId, messages)
      void transcriptionBias.rebuild(sessionId)
    }
    for (const sessionId of biasedMessages.keys()) {
      if (!(sessionId in loaded)) {
        biasedMessages.delete(sessionId)
        transcriptionBias.forget(sessionId)
      }
    }
  }, { immediate: true, deep: 1 })

  const { controller, state, snapshot: transcript, error } = useVoiceController({
    transcriber: () => hearing.createTranscriber(),
    transcriptionBias: sessionId => tuning.sendHotwords ? transcriptionBias.read(sessionId) : undefined,
    speech: (turn) => {
      if (!output)
        throw new Error('Voice output host is not connected')

      const trace = traceSpeechOutput(turn, chat.openTurnSpan(turn), output(turn), async audio => audioContext.audioContext.decodeAudioData(await audio.arrayBuffer()))
      speechTraces.set(turnKey(turn), trace)
      return trace.output
    },
    submit: async (submission, signal) => {
      submissionObservers.forEach(observe => observe(submission))
      if (!composerInputs.has(submission.submissionId))
        return acceptSpeech(submission, signal)

      // The composer owns this text as its own draft. No voice draft or message is created.
      composerInputs.set(submission.submissionId, submission.text)
      // The composer sends dictated text later. Empty text gives the composer nothing to send.
      if (submission.text.trim())
        inputTracer.markComposer(submission.submissionId, submission.sessionId)
      return { status: 'drafted', draftId: submission.submissionId }
    },
    recordInterruption: async (event) => {
      const { groupId, played, status } = event.playback
      const errorMessage = event.playback.status === 'failed' ? errorMessageFrom(event.playback.error) : undefined
      return chat.receiveInterruption({ ...event, playback: { groupId, played, status, ...(errorMessage ? { errorMessage } : {}) } })
    },
    onError: event => report(event.error),
  })
  const { rephrase } = useVoiceRephrase()
  controller.use(
    createVoiceRephrasePlugin({ enabled: () => hearing.rephraseEnabled, rephrase, timeoutMs: VOICE_REPHRASE_TIMEOUT_MS }),
    { grants: ['transcript-patch'], onError: event => report(event.error) },
  )
  const { rerank: rerankPhonetic } = useVoicePhoneticRerank()
  controller.use(
    createVoicePhoneticMatchPlugin({ vocabulary: () => phoneticVocabulary.entries, rerank: rerankPhonetic }),
    { onError: event => report(event.error) },
  )
  const { judge } = useVoiceEndJudge()
  controller.use(
    createVoiceEndJudgePlugin({ enabled: () => hearing.endJudgeEnabled, judge, pauseMs: () => tuning.pauseMs }),
    { grants: ['input-control'], onError: event => report(event.error) },
  )

  function report(cause: unknown) {
    error.value = errorMessageFrom(cause) ?? 'Voice operation failed'

    console.error('[voice]', cause)
  }

  /**
   * The cause of the input that begins next. A control sets `control` around its begin call, and the voice activity
   * plugin reports `speech` or `wake-word` right before its begin call. `onInput` runs inside that call and reads it.
   */
  let beginCause: 'control' | 'speech' | 'wake-word' | undefined

  controller.onInput((attempt) => {
    presentedInput = { requestId: attempt.id, attempt }
    const cause = beginCause ?? 'speech'
    beginCause = undefined
    // Only an input that a wake began takes the wake span, so a wake that started nothing cannot join a later input.
    inputTracer.start(attempt, cause, cause === 'wake-word' ? wakeWordDetection.claimWakeSpan() : undefined)
  })

  function publishSnapshot() {
    if (!output || !servesOtherWindows)
      return

    const snapshot: VoiceHostSnapshot = {
      connected: true,
      microphone: { enabled: devices.enabled, ready: !!devices.stream, error: devices.error },
      wakeWords: { preparation: wakeWordDetection.preparation, ...(wakeWordDetection.error ? { error: wakeWordDetection.error } : {}) },
      drafts: drafts.value.map(draft => ({ ...draft })),
      frontDraftId: frontDraftId.value,
      error: error.value,
      ...(presentedInput
        ? { input: {
            requestId: presentedInput.requestId,
            sessionId: presentedInput.attempt.sessionId,
            phase: presentedInput.attempt.state.phase,
            text: transcript.value?.transcript.text ?? '',
            segments: (transcript.value?.transcript.segments ?? []).map(segment => ({ id: segment.id, text: segment.text, final: segment.final })),
          } }
        : {}),
    }

    getSpeechBusContext().emit(voiceSnapshotChanged, snapshot)
  }

  watch([state, transcript, frontDraftId, error, microphoneStream, microphoneEnabled, microphoneError, () => wakeWordDetection.preparation, () => wakeWordDetection.error], publishSnapshot)
  watch(drafts, publishSnapshot, { deep: true })

  function beginInput(options: BeginSpeechInput) {
    error.value = undefined
    return controller.beginInput(options)
  }

  function beginManual(sessionId: string) {
    beginCause = 'control'
    try {
      return beginInput({ sessionId, interruptTurns: activeTurns.value.filter(turn => turn.sessionId === sessionId), start: { kind: 'after-silence' } })
    }
    finally {
      beginCause = undefined
    }
  }

  function endInput() {
    return controller.activeInput?.end()
  }

  function cancelInput() {
    controller.activeInput?.cancel('Input cancelled by user')
  }

  function updateActiveTurns() {
    activeTurns.value = [...responses.values()].filter(entry => !entry.response.closed).map(entry => entry.response.turn)
    if (output && servesOtherWindows)
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

  /**
   * Publishes the microphone level while a voice message records, a speech input captures, or a control monitors the level.
   * A device change or the end of capture stops the current observation. The returned function stops publication.
   */
  function publishInputLevel() {
    let observation: AbortController | undefined
    /** A control shows a level meter. It turns off when the newest request expires. */
    const monitoring = shallowRef(false)
    let monitorTimer: ReturnType<typeof setTimeout> | undefined
    const stopMonitor = getSpeechBusContext().on(voiceLevelMonitor, ({ body }) => {
      if (!body)
        return
      clearTimeout(monitorTimer)
      const remaining = body.until - Date.now()
      monitoring.value = remaining > 0
      if (remaining > 0)
        monitorTimer = setTimeout(() => monitoring.value = false, remaining)
    })
    const stop = watch(
      [() => voiceMessages.isRecording || state.value?.phase === 'capturing' || monitoring.value, () => devices.input],
      ([capturing, input]) => {
        observation?.abort('Voice capture changed')
        observation = undefined
        if (!capturing)
          return

        const current = new AbortController()
        observation = current
        observeInputLevel(input, current.signal, level => getSpeechBusContext().emit(voiceInputLevel, { level }))
      },
      { immediate: true },
    )

    return () => {
      stop()
      stopMonitor()
      clearTimeout(monitorTimer)
      observation?.abort('Voice output host detached')
    }
  }

  function interrupt(turns: readonly TurnRef[], cause: string) {
    return controller.interrupt({ turns, cause })
  }

  /**
   * The application supplies the tools that its user granted to new turns, so a spoken turn reaches the same tools
   * as a typed one. The returned function disconnects this source only.
   */
  function connectTools(source: () => readonly ChatToolReference[]) {
    requestTools = source
    return () => {
      if (requestTools === source)
        requestTools = undefined
    }
  }

  /**
   * The mounted scene supplies its browser output. Detachment stops only this host's responses.
   *
   * With `windowOnly`, the host speaks only the replies of chats in this window. Speech and input commands of
   * other windows, such as read-aloud, go to their own host, so one command does not play in two windows.
   */
  function connectOutput(factory: (turn: TurnRef) => SpeechOutput, options: { windowOnly?: boolean } = {}) {
    if (output)
      throw new Error('Voice output host is already connected')

    output = factory
    servesOtherWindows = !options.windowOnly
    const context = getSpeechBusContext()
    const stops = [
      publishInputLevel(),
      context.on(voiceGenerationEnded, ({ body }) => {
        if (!body)
          return
        const entry = responses.get(turnKey(body))
        if (body.status !== 'finished')
          entry?.response.cancel(`Generation ${body.status}`)

        void finishResponse(body).catch(report)
      }),
      ...servesOtherWindows ? serveOtherWindows(context) : [],
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
      if (servesOtherWindows) {
        context.emit(voiceTurnsChanged, [])
        context.emit(voiceSnapshotChanged, { connected: false, drafts: drafts.value.map(draft => ({ ...draft })) })
      }
      servesOtherWindows = false
    }
  }

  /** Takes the speech and input commands of other windows. Returns the functions that stop each handler. */
  function serveOtherWindows(context: ReturnType<typeof getSpeechBusContext>) {
    const producers = new Map<string, SpeechStream>()
    const opened = new Set<string>()
    return [
      voiceMessages.connect(),
      context.on(voiceRequestSnapshot, publishSnapshot),
      defineInvokeHandler(context, voiceInputCommand, async (command) => {
        switch (command.type) {
          case 'begin': {
            if (inputRequests.has(command.requestId) || listeningLeasedElsewhere.value)
              return { status: 'closed' }

            const attempt = beginManual(command.sessionId)
            inputRequests.set(command.requestId, attempt)
            if (command.target === 'composer')
              composerInputs.set(attempt.id, undefined)
            void attempt.done.then((outcome) => {
              if (inputRequests.get(command.requestId) === attempt)
                inputRequests.delete(command.requestId)
              // A drafted composer input keeps its text until `end` reads it. Other outcomes have no text to return.
              if (outcome.status !== 'drafted')
                composerInputs.delete(attempt.id)
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
            if (!composerInputs.has(attempt.id))
              break

            const text = composerInputs.get(attempt.id)
            composerInputs.delete(attempt.id)
            publishSnapshot()
            return { status: 'accepted', ...(text ? { text } : {}) }
          }
          case 'cancel': {
            const attempt = inputRequests.get(command.requestId)
            if (!attempt)
              return { status: 'closed' }

            attempt.cancel('Input control cancelled')
            break
          }
          case 'cancel-presented': {
            // The request ID binds the command to the input that the control showed, not to a later one.
            if (presentedInput?.requestId !== command.requestId)
              return { status: 'closed' }

            presentedInput.attempt.cancel('Input dismissed')
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
  }

  function startListening(options: Pick<VoiceActivityOptions, 'detectWakeWord' | 'acceptSpeech'> = detectorOptions) {
    if (listening)
      return

    detectorOptions = options
    const model = new SileroVad()
    // The built-in KWS detection runs unless the host supplies its own adapter.
    // It returns no wake until the device catalog has an active pronunciation and the model is ready.
    const wakeWords = options.detectWakeWord ? undefined : wakeWordDetection.start({ resolveTarget: resolveWakeTarget, onError: report })
    const plugin = createVoiceActivityPlugin({
      detect: (window, signal) => model.score(window, signal),
      onActivity: inputTracer.activity,
      onScore: event => scoreObservers.forEach(observe => observe({ ts: Date.now(), ...event })),
      beforeBeginInput: (cause) => {
        beginCause = cause
      },
      detectWakeWord: options.detectWakeWord ?? wakeWords?.detect,
      enabled: () => !voiceMessages.isRecording,
      silenceMs: () => hearing.endJudgeEnabled ? tuning.pauseMs + tuning.graceMs : tuning.pauseMs,
      threshold: () => tuning.vadThreshold,
      minSpeechMs: () => tuning.minSpeechMs,
      preRollMs: tuning.preRollMs,
      // Automatic barge-in requires platform echo cancellation or an external echo classifier.
      acceptSpeech: options.acceptSpeech ?? (async () => !speaking.nowSpeaking || devices.source.echoCancellation),
      // Wake word mode returns no target, so VAD alone cannot start an input. A wake supplies its own target.
      target: () => sessions.activeSessionId && hearing.configured && startsInputOnSpeech(hearing.inputMode)
        ? { sessionId: sessions.activeSessionId, interruptTurns: activeTurns.value.filter(turn => turn.sessionId === sessions.activeSessionId) }
        : undefined,
    })

    listening = controller.use({ ...plugin, setup(scope) {
      plugin.setup(scope)
      scope.onDispose(() => {
        wakeWords?.stop()
        return model.close()
      })
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

  /** Calls `observe` with the score of each VAD window while listening runs. Returns the function that stops it. */
  function observeVadScores(observe: (score: VoiceActivityScore) => void) {
    scoreObservers.add(observe)
    return () => void scoreObservers.delete(observe)
  }

  /** Calls `observe` with each speech submission, before it becomes a draft or a chat turn. Returns the function that stops it. */
  function observeSubmissions(observe: (submission: SpeechSubmission) => void) {
    submissionObservers.add(observe)
    return () => void submissionObservers.delete(observe)
  }

  onScopeDispose(() => {
    stopBiasRebuild()
    transcriptionBias.dispose()
    void stopListening()
  })

  return { controller, state, transcript, error, tuning, observeVadScores, observeSubmissions, drafts, activeTurns, beginInput, beginManual, endInput, cancelInput, sendDraft, discardDraft, startResponse, getSpeech, finishResponse, interrupt, connectOutput, connectTools, startListening, stopListening, resolveWakeTarget }
})

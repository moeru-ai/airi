import type { PluginListenerHandle } from '@capacitor/core'

import workletUrl from '@proj-airi/stage-ui/workers/vad/process.worklet?worker&url'

import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { errorMessageFrom } from '@moeru/std'
import { useAudioRecorder } from '@proj-airi/stage-ui/composables/audio/audio-recorder'
import { KeywordListener } from '@proj-airi/stage-ui/libs/keyword-listener'
import { loadKwsModel } from '@proj-airi/stage-ui/libs/kws-model'
import { appendHearingDraft } from '@proj-airi/stage-ui/services/hearing-drafts'
import { pinnedKwsVocabulary, resolveWakeWordKeywords, supportedWakeWordKeywords } from '@proj-airi/stage-ui/services/wake-words'
import { useVAD } from '@proj-airi/stage-ui/stores/ai/models/vad'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useHearingSpeechInputPipeline, useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings/audio-device'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, shallowRef, watch } from 'vue'

import { BackgroundWakeWord } from '../modules/background-wake-word'

const isAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'

/** Owns Pocket hearing while this stage page is mounted. Manual voice messages use their own recorder. */
export function usePocketHearing() {
  const device = useSettingsAudioDevice()
  const { mode: selectedMode, enabled, stream } = storeToRefs(device)
  const mode = computed(() => enabled.value ? selectedMode.value : 'off')
  const hearing = useHearingStore()
  const cardStore = useAiriCardStore()
  const { cards, wakeWordOwnership } = storeToRefs(cardStore)
  const chatSession = useChatSessionStore()
  const chat = useChatStore()
  const pipeline = useHearingSpeechInputPipeline()
  const { supportsStreamInput } = storeToRefs(pipeline)
  const recorder = useAudioRecorder(stream)

  const mounted = shallowRef(false)
  const appActive = shallowRef(true)
  const wakeWords = computed(() => {
    const configured = resolveWakeWordKeywords(cards.value, wakeWordOwnership.value)
    const keywords = supportedWakeWordKeywords(configured.keywords, pinnedKwsVocabulary)
    const activeLabels = new Set(keywords.map(keyword => keyword.label))
    return {
      ...configured,
      keywords,
      targets: new Map([...configured.targets].filter(([label]) => activeLabels.has(label))),
    }
  })
  const nativeKeywords = computed(() => wakeWords.value.keywords.flatMap((keyword) => {
    const target = wakeWords.value.targets.get(keyword.label)
    return target
      ? keyword.matches.map(match => ({
          characterId: target.cardId,
          tokens: match.tokens,
          score: match.score ?? keyword.score,
          threshold: match.threshold ?? keyword.threshold,
        }))
      : []
  }))

  let keywordListener: KeywordListener | undefined
  let keywordStart: Promise<void> | undefined
  let keywordStartGeneration = -1
  let appStateListener: PluginListenerHandle | undefined
  let wakeTapListener: PluginListenerHandle | undefined
  let disposed = false
  let interactionGeneration = 0
  let wakeWindowTimer: ReturnType<typeof setTimeout> | undefined
  let wakeSession: Promise<string> | undefined
  let wakeAwaitingSpeech = false
  let wakeCapturing = false
  let recordingSession: Promise<string> | undefined
  let recordingStart: Promise<void> | undefined
  let streamTurn: { consumerId: string, browserRecognition: boolean, finalizedSegments: string[], providerText?: string } | undefined
  let streamStart: Promise<void> | undefined
  let streamTurnSequence = 0
  let speechEpoch = 0
  let nativeSync = Promise.resolve()
  let stoppingTranscription: Promise<unknown> = Promise.resolve()
  let discardingRecording: Promise<unknown> = Promise.resolve()

  const {
    init: initVAD,
    dispose: disposeVAD,
    start: startVAD,
  } = useVAD(workletUrl, {
    threshold: shallowRef(0.6),
    onSpeechStart: () => { void handleSpeechStart() },
    onSpeechEnd: () => { void handleSpeechEnd() },
    onSpeechCancel: () => { void handleSpeechCancel() },
  })

  async function currentSession(): Promise<string> {
    return await chatSession.ensureCurrentSession()
  }

  async function routeTranscript(target: Promise<string>, text: string | undefined) {
    if (!text?.trim())
      return
    const sessionId = await target
    if (!sessionId)
      return
    if (hearing.autoSendEnabled) {
      const generation = interactionGeneration
      const inputMode = mode.value
      if (hearing.autoSendDelay > 0)
        await new Promise(resolve => setTimeout(resolve, hearing.autoSendDelay))
      if (generation !== interactionGeneration || mode.value !== inputMode || chatSession.activeSessionId !== sessionId)
        return
      await chat.send({ sessionId, text: text.trim() })
    }
    else {
      appendHearingDraft(sessionId, text.trim())
    }
  }

  function clearWakeWindow() {
    if (wakeWindowTimer)
      clearTimeout(wakeWindowTimer)
    wakeWindowTimer = undefined
    wakeAwaitingSpeech = false
    wakeCapturing = false
    wakeSession = undefined
  }

  function finishWakeWindow() {
    clearWakeWindow()
    if (mode.value !== 'wake-word' || !appActive.value)
      return
    if (keywordListener)
      void keywordListener.resume().catch(error => console.error('Wake word listener failed to resume:', error))
    else
      void startKeywordListener(interactionGeneration)
  }

  function armWake(characterId: string) {
    if (mode.value !== 'wake-word' || !cardStore.getCard(characterId))
      return
    if (wakeAwaitingSpeech || wakeCapturing)
      return

    wakeAwaitingSpeech = true
    wakeSession = (async () => {
      const activated = await cardStore.activateCard(characterId)
      if (!activated)
        throw new Error('The wake word character is unavailable')
      return await chatSession.ensureCurrentSession()
    })()
    void wakeSession.catch(error => console.error('Could not select wake word character:', error))
    void keywordListener?.pause().catch(error => console.error('Wake word listener failed to pause:', error))
    wakeWindowTimer = setTimeout(finishWakeWindow, 15_000)
  }

  async function handleSpeechStart() {
    const generation = interactionGeneration
    const epoch = ++speechEpoch
    if (!appActive.value || !stream.value)
      return
    if (mode.value === 'wake-word') {
      if (!wakeAwaitingSpeech || !wakeSession)
        return
      wakeAwaitingSpeech = false
      wakeCapturing = true
      if (wakeWindowTimer)
        clearTimeout(wakeWindowTimer)
      wakeWindowTimer = undefined
      recordingSession = wakeSession
    }
    else if (mode.value === 'always') {
      recordingSession = currentSession()
    }
    else {
      return
    }

    const target = recordingSession
    if (!target)
      return
    if (supportsStreamInput.value) {
      await stoppingTranscription
      if (generation !== interactionGeneration || epoch !== speechEpoch || !stream.value)
        return
      const browserRecognition = hearing.activeTranscriptionProvider === 'browser-web-speech-api'
      const turn = { consumerId: `stage-pocket:hearing:${++streamTurnSequence}`, browserRecognition, finalizedSegments: [] as string[], providerText: undefined as string | undefined }
      streamTurn = turn
      streamStart = pipeline.transcribeForMediaStream(stream.value, {
        consumerId: turn.consumerId,
        onSentenceEnd: (text) => {
          if (browserRecognition && text.trim())
            turn.finalizedSegments.push(text.trim())
        },
        onSpeechEnd: (text) => {
          if (!browserRecognition)
            turn.providerText = text
        },
      })
      await streamStart
      return
    }

    await discardingRecording
    if (generation !== interactionGeneration || epoch !== speechEpoch)
      return
    recordingStart = recorder.startRecord()
    await recordingStart
  }

  async function handleSpeechEnd() {
    speechEpoch++
    const oneShot = mode.value === 'wake-word' && wakeCapturing
    if (mode.value !== 'always' && !oneShot)
      return

    const target = recordingSession
    recordingSession = undefined
    if (supportsStreamInput.value) {
      const turn = streamTurn
      streamTurn = undefined
      try {
        await streamStart
        streamStart = undefined
        const ending = pipeline.stopStreamingTranscription(false)
        stoppingTranscription = ending.catch(() => {})
        const finalText = await ending
        if (oneShot)
          finishWakeWindow()
        if (target && turn) {
          const text = turn.browserRecognition
            ? turn.finalizedSegments.join(' ') || finalText
            : turn.providerText || finalText
          await routeTranscript(target, text)
        }
      }
      finally {
        if (turn)
          pipeline.removeStreamingTranscriptionConsumer(turn.consumerId)
        if (oneShot && wakeCapturing)
          finishWakeWindow()
      }
      return
    }
    if (oneShot)
      finishWakeWindow()
    if (!target)
      return

    try {
      await recordingStart
      recordingStart = undefined
      const recording = await recorder.stopRecord()
      const text = await pipeline.transcribeForRecording(recording)
      await routeTranscript(target, text)
    }
    catch (error) {
      console.error('Could not transcribe Pocket hearing input:', error)
    }
  }

  async function handleSpeechCancel() {
    speechEpoch++
    if (mode.value === 'wake-word' && wakeCapturing)
      finishWakeWindow()
    recordingSession = undefined
    if (streamTurn) {
      pipeline.removeStreamingTranscriptionConsumer(streamTurn.consumerId)
      streamTurn = undefined
      await streamStart?.catch(() => {})
      streamStart = undefined
      await pipeline.stopStreamingTranscription(true)
    }
    await recorder.discardRecord()
  }

  function stopAudioInteraction(preserveWakeWindow = false) {
    interactionGeneration++
    speechEpoch++
    keywordListener?.stop()
    keywordListener = undefined
    if (streamTurn)
      pipeline.removeStreamingTranscriptionConsumer(streamTurn.consumerId)
    streamTurn = undefined
    const activeStreamStart = streamStart
    streamStart = undefined
    stoppingTranscription = stoppingTranscription
      .catch(() => {})
      .then(async () => {
        await activeStreamStart?.catch(() => {})
        return await pipeline.stopStreamingTranscription(true)
      })
    discardingRecording = recorder.discardRecord().catch(error => console.error('Could not discard Pocket recording:', error))
    disposeVAD()
    if (!preserveWakeWindow)
      clearWakeWindow()
    recordingSession = undefined
    recordingStart = undefined
  }

  async function startKeywordListener(generation: number) {
    if (generation !== interactionGeneration || !stream.value || wakeWords.value.keywords.length === 0)
      return
    if (keywordStart && keywordStartGeneration === generation)
      return await keywordStart
    keywordStartGeneration = generation
    const starting = (async () => {
      device.setWakeWordPreparation('preparing')
      try {
        const model = await loadKwsModel()
        if (generation !== interactionGeneration || !stream.value || wakeAwaitingSpeech || wakeCapturing)
          return
        if (wakeWords.value.keywords.length === 0) {
          device.setWakeWordPreparation('unconfigured')
          return
        }
        keywordListener = new KeywordListener(
          model,
          workletUrl,
          (label) => {
            const target = wakeWords.value.targets.get(label)
            if (target)
              armWake(target.cardId)
          },
          error => console.error('Pocket wake word listener failed:', error),
        )
        await keywordListener.start(stream.value, wakeWords.value.keywords)
        if (generation === interactionGeneration)
          device.setWakeWordPreparation('ready')
      }
      catch (error) {
        device.setWakeWordPreparation('error', errorMessageFrom(error) ?? 'Could not prepare wake word detection')
        console.error('Could not start Pocket wake word listener:', error)
      }
    })()
    keywordStart = starting
    try {
      await starting
    }
    finally {
      if (keywordStart === starting)
        keywordStart = undefined
    }
  }

  async function startAudioInteraction() {
    const generation = ++interactionGeneration
    try {
      await stoppingTranscription
      if (generation !== interactionGeneration)
        return
      await initVAD()
      if (generation !== interactionGeneration || !stream.value)
        return
      await startVAD(stream.value)
      if (generation === interactionGeneration && mode.value === 'wake-word' && !wakeAwaitingSpeech && !wakeCapturing)
        await startKeywordListener(generation)
    }
    catch (error) {
      console.error('Could not start Pocket hearing:', error)
    }
  }

  async function syncNativeListener() {
    if (!isAndroid)
      return
    if (mode.value !== 'wake-word' || nativeKeywords.value.length === 0) {
      await BackgroundWakeWord.stop()
      return
    }
    if (!appActive.value || !stream.value)
      return
    const currentPermission = await LocalNotifications.checkPermissions()
    const display = currentPermission.display === 'prompt'
      ? (await LocalNotifications.requestPermissions()).display
      : currentPermission.display
    if (display !== 'granted')
      throw new Error('Notification permission is required for Android background wake words')
    await BackgroundWakeWord.start({ keywords: nativeKeywords.value })
  }

  function queueNativeSync(): Promise<void> {
    nativeSync = nativeSync.catch(() => {}).then(syncNativeListener)
    return nativeSync
  }

  async function takePendingWake() {
    if (!isAndroid || mode.value !== 'wake-word')
      return
    const pending = await BackgroundWakeWord.takePendingWake()
    if (pending.characterId)
      armWake(pending.characterId)
  }

  async function handleAppState(active: boolean) {
    if (disposed)
      return
    if (!active) {
      appActive.value = false
      stopAudioInteraction()
      if (mode.value === 'wake-word' || mode.value === 'always')
        device.stopStream()
      return
    }
    await takePendingWake().catch(error => console.error('Could not read Android wake notification:', error))
    appActive.value = true
    await queueNativeSync().catch(error => console.error('Could not resume Android wake listener:', error))
    if (mode.value === 'wake-word' || mode.value === 'always')
      await device.startStream()
  }

  watch([mode, stream, appActive, mounted], ([nextMode, nextStream, active, isMounted]) => {
    stopAudioInteraction(nextMode === 'wake-word' && wakeAwaitingSpeech)
    if (!isMounted || !active || !nextStream)
      return
    if (nextMode === 'always' || (nextMode === 'wake-word' && (wakeWords.value.keywords.length > 0 || wakeAwaitingSpeech)))
      void startAudioInteraction()
  })

  watch([mode, wakeWords, appActive, mounted], ([nextMode, words, active, isMounted]) => {
    if (!isMounted || !active || nextMode !== 'wake-word')
      return
    if (words.keywords.length === 0 && !wakeAwaitingSpeech && !wakeCapturing)
      device.stopStream()
    else if (!stream.value)
      void device.startStream().catch(error => console.error('Could not start Pocket microphone:', error))
  })

  watch([mode, wakeWords, mounted], ([nextMode, words, isMounted]) => {
    if (!isMounted || nextMode !== 'wake-word')
      return
    if (words.keywords.length > 0)
      return
    device.setWakeWordPreparation('unconfigured')
    if (!device.claimWakeWordSetupPrompt())
      return
    void (async () => {
      const sessionId = await chatSession.ensureCurrentSession()
      await chat.promptCharacter({
        sessionId,
        instruction: 'Ask the user how they would like to address you. After they answer, use the wake word tool to configure the name and its pronunciation tokens.',
      })
    })().catch(error => console.error('Could not start wake word setup conversation:', error))
  })

  watch(wakeWords, (words) => {
    if (mode.value !== 'wake-word' || !appActive.value)
      return
    if (words.keywords.length === 0) {
      keywordListener?.stop()
      keywordListener = undefined
    }
    else if (keywordListener) {
      void keywordListener.setKeywords(words.keywords).catch(error => console.error('Could not update wake words:', error))
    }
    else if (stream.value && !wakeAwaitingSpeech && !wakeCapturing) {
      void startKeywordListener(interactionGeneration)
    }
  })

  watch([mode, nativeKeywords, stream], () => {
    if (mounted.value)
      void queueNativeSync().catch(error => console.error('Could not update Android wake words:', error))
  })

  onMounted(async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        const appListener = await CapacitorApp.addListener('appStateChange', (state) => {
          void handleAppState(state.isActive)
        })
        if (disposed)
          return await appListener.remove()
        appStateListener = appListener
        if (isAndroid) {
          const tapListener = await BackgroundWakeWord.addListener('wakeNotificationTapped', () => {
            void takePendingWake().catch(error => console.error('Could not claim Android wake notification:', error))
          })
          if (disposed)
            return await tapListener.remove()
          wakeTapListener = tapListener
        }
        const state = await CapacitorApp.getState()
        if (disposed)
          return
        appActive.value = state.isActive
      }
      await takePendingWake()
      if (disposed)
        return
      mounted.value = true
      await queueNativeSync().catch(error => console.error('Could not start Android wake listener:', error))
    }
    catch (error) {
      console.error('Could not prepare Pocket hearing:', error)
    }
  })

  onUnmounted(() => {
    disposed = true
    mounted.value = false
    stopAudioInteraction()
    void appStateListener?.remove()
    void wakeTapListener?.remove()
  })
}

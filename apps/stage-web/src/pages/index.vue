<script setup lang="ts">
import Header from '@proj-airi/stage-layouts/components/Layouts/Header.vue'
import InteractiveArea from '@proj-airi/stage-layouts/components/Layouts/InteractiveArea.vue'
import MobileInteractiveArea from '@proj-airi/stage-layouts/components/Layouts/MobileInteractiveArea.vue'
import workletUrl from '@proj-airi/stage-ui/workers/vad/process.worklet?worker&url'

import { errorMessageFrom } from '@moeru/std'
import { BackgroundProvider } from '@proj-airi/stage-layouts/components/Backgrounds'
import { useBackgroundThemeColor } from '@proj-airi/stage-layouts/composables/theme-color'
import { useBackgroundStore } from '@proj-airi/stage-layouts/stores/background'
import { HoloCoupon } from '@proj-airi/stage-ui/components'
import { ViewControlSlider, WidgetStage } from '@proj-airi/stage-ui/components/scenes'
import { useAudioRecorder } from '@proj-airi/stage-ui/composables/audio/audio-recorder'
import { KeywordListener } from '@proj-airi/stage-ui/libs/keyword-listener'
import { getKwsVocabulary, loadKwsModel } from '@proj-airi/stage-ui/libs/kws-model'
import { appendHearingDraft } from '@proj-airi/stage-ui/services/hearing-drafts'
import { resolveWakeWordKeywords, supportedWakeWordKeywords } from '@proj-airi/stage-ui/services/wake-words'
import { useVAD } from '@proj-airi/stage-ui/stores/ai/models/vad'
import { useSpeakingStore } from '@proj-airi/stage-ui/stores/audio'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useHearingSpeechInputPipeline, useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { useSpeechOutputControlStore } from '@proj-airi/stage-ui/stores/speech-output-control'
import { breakpointsTailwind, useBreakpoints, useMouse } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, shallowRef, useTemplateRef, watch } from 'vue'

const paused = ref(false)

function handleSettingsOpen(open: boolean) {
  paused.value = open
}

const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('md')
const stageViewport = shallowRef({ height: 0, offsetTop: 0 })
// NOTICE:
// Why: A fixed Stage follows Safari's input pan and moves Live2D with the keyboard.
// Root cause: Safari moves the Visual Viewport before the page receives the new offsetTop value.
// Source: https://bugs.webkit.org/show_bug.cgi?id=265578
// Removal condition: Safari keeps fixed content stable during the input pan.
const stageSurfaceStyle = computed(() => isMobile.value
  ? {
      position: 'fixed' as const,
      inset: '0',
      height: stageViewport.value.height > 0 ? `${stageViewport.value.height}px` : '100dvh',
      transform: `translate3d(0, ${stageViewport.value.offsetTop}px, 0)`,
      willChange: 'transform',
    }
  : undefined)

const backgroundStore = useBackgroundStore()
const { selectedOption, sampledColor } = storeToRefs(backgroundStore)
const backgroundSurface = useTemplateRef<InstanceType<typeof BackgroundProvider>>('backgroundSurface')
const { stageModelRenderer } = storeToRefs(useSettings())

const { syncBackgroundTheme } = useBackgroundThemeColor({ backgroundSurface, selectedOption, sampledColor })
onMounted(() => syncBackgroundTheme())

// Audio + transcription pipeline (mirrors stage-tamagotchi)
const settingsAudioDeviceStore = useSettingsAudioDevice()
const { stream, enabled, mode } = storeToRefs(settingsAudioDeviceStore)
const { discardRecord, startRecord, stopRecord, onStopRecord } = useAudioRecorder(stream)
const hearingPipeline = useHearingSpeechInputPipeline()
const { removeStreamingTranscriptionConsumer, stopStreamingTranscription, transcribeForMediaStream, transcribeForRecording } = hearingPipeline
const { supportsStreamInput } = storeToRefs(hearingPipeline)
const chatStore = useChatStore()
const chatSession = useChatSessionStore()
const cardStore = useAiriCardStore()
const { cards, wakeWordOwnership } = storeToRefs(cardStore)
const { autoSendEnabled, activeTranscriptionProvider } = storeToRefs(useHearingStore())
const speechOutput = useSpeechOutputControlStore()
let keywordListener: KeywordListener | undefined
let wakeSessionId: string | undefined
let wakeSpeechTimer: ReturnType<typeof setTimeout> | undefined
let wakeGeneration = 0
let detectorGeneration = 0
let browserFinalizedText = ''
let browserVadEnded = false
let browserSpeechActive = false

function deliverBrowserUtterance() {
  if (!browserVadEnded || !browserFinalizedText.trim())
    return
  const text = browserFinalizedText
  browserFinalizedText = ''
  browserVadEnded = false
  void sendVoiceInputTextToChat(text)
}

/** Identifies this page in the shared streaming transcription session. */
const transcriptionConsumerId = 'stage-web:voice-input'
const shouldUseStreamInput = computed(() => supportsStreamInput.value && !!stream.value)

const {
  init: initVAD,
  dispose: disposeVAD,
  start: startVAD,
  loaded: vadLoaded,
} = useVAD(workletUrl, {
  threshold: ref(0.6),
  onSpeechStart: () => handleSpeechStart(),
  onSpeechEnd: () => handleSpeechEnd(),
  onSpeechCancel: () => handleSpeechCancel(),
})

let stopOnStopRecord: (() => void) | undefined

async function sendVoiceInputTextToChat(text: string | undefined) {
  if (!text?.trim())
    return

  try {
    const sessionId = wakeSessionId ?? chatSession.activeSessionId
    if (!sessionId)
      return
    if (wakeSessionId)
      finishWakeInput()
    if (autoSendEnabled.value)
      await chatStore.send({ sessionId, text })
    else
      appendHearingDraft(sessionId, text)
  }
  catch (error) {
    console.error('Failed to send chat from voice:', error)
  }
}

function finishWakeInput() {
  if (wakeSpeechTimer)
    clearTimeout(wakeSpeechTimer)
  wakeSpeechTimer = undefined
  wakeSessionId = undefined
  stopAudioInteraction()
  void keywordListener?.resume()
}

async function handleWake(label: string, targets: Map<string, { cardId: string }>) {
  const target = targets.get(label)
  if (!target || mode.value !== 'wake-word')
    return
  const generation = ++wakeGeneration
  if (useSpeakingStore().nowSpeaking) {
    speechOutput.requestStopSpeaking('wake-word')
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  if (generation !== wakeGeneration || mode.value !== 'wake-word')
    return
  await cardStore.activateCard(target.cardId)
  wakeSessionId = await chatSession.ensureCurrentSession()
  await startAudioInteraction()
  wakeSpeechTimer = setTimeout(finishWakeInput, 15_000)
}

async function askForWakeWords() {
  if (!settingsAudioDeviceStore.claimWakeWordSetupPrompt())
    return
  const sessionId = await chatSession.ensureCurrentSession()
  void chatStore.promptCharacter({
    sessionId,
    instruction: 'Ask the user how they want to call you to start a voice conversation. Invite them to give one or more names or pronunciations. After they answer, use the configure_wake_words tool to save the encoded pronunciations.',
  })
}

async function startKeywordListening(currentStream: MediaStream | undefined, generation: number) {
  const configured = resolveWakeWordKeywords(cards.value, wakeWordOwnership.value)
  if (configured.keywords.length === 0)
    void askForWakeWords().catch(error => console.error('Could not ask for Wake Word setup:', error))
  settingsAudioDeviceStore.setWakeWordPreparation('preparing')
  const model = await loadKwsModel()
  if (generation !== detectorGeneration || mode.value !== 'wake-word')
    return
  const vocabulary = getKwsVocabulary(model)
  const active = resolveWakeWordKeywords(cards.value, wakeWordOwnership.value)
  const keywords = supportedWakeWordKeywords(active.keywords, vocabulary)
  keywordListener?.stop()
  const listener = new KeywordListener(model, workletUrl, label => void handleWake(label, active.targets), error => console.error('Wake Word detection failed:', error))
  keywordListener = listener
  if (currentStream)
    await listener.start(currentStream, keywords)
  if (generation !== detectorGeneration)
    return listener.stop()
  if (keywords.length > 0) {
    settingsAudioDeviceStore.setWakeWordPreparation('ready')
  }
  else {
    settingsAudioDeviceStore.setWakeWordPreparation('unconfigured')
    void askForWakeWords().catch(error => console.error('Could not ask for Wake Word setup:', error))
  }
}

async function startAudioInteraction() {
  try {
    await initVAD()
    if (stream.value)
      await startVAD(stream.value)

    if (shouldUseStreamInput.value && stream.value) {
      const browserRecognition = activeTranscriptionProvider.value === 'browser-web-speech-api'
      await transcribeForMediaStream(stream.value, {
        consumerId: transcriptionConsumerId,
        onSentenceEnd: (text) => {
          if (browserRecognition && (browserSpeechActive || browserVadEnded)) {
            browserFinalizedText += `${browserFinalizedText ? ' ' : ''}${text.trim()}`
            deliverBrowserUtterance()
          }
        },
        onSpeechEnd: (text) => {
          if (!browserRecognition)
            void sendVoiceInputTextToChat(text)
        },
      })
      return
    }

    stopOnStopRecord = onStopRecord(async (recording) => {
      const text = await transcribeForRecording(recording)
      await sendVoiceInputTextToChat(text)
    })
  }
  catch (error) {
    console.error('Audio interaction init failed:', error)
  }
}

async function handleSpeechStart() {
  if (wakeSpeechTimer) {
    clearTimeout(wakeSpeechTimer)
    wakeSpeechTimer = undefined
  }
  if (activeTranscriptionProvider.value === 'browser-web-speech-api') {
    browserFinalizedText = ''
    browserVadEnded = false
    browserSpeechActive = true
  }
  // For streaming providers, ChatArea component handles transcription manually
  // The main page should not start automatic transcription to avoid duplicate sessions
  if (shouldUseStreamInput.value) {
    return
  }

  startRecord()
}

async function handleSpeechEnd() {
  if (shouldUseStreamInput.value) {
    if (activeTranscriptionProvider.value === 'browser-web-speech-api') {
      browserSpeechActive = false
      browserVadEnded = true
      deliverBrowserUtterance()
    }
    return
  }

  stopRecord()
}

async function handleSpeechCancel() {
  if (!shouldUseStreamInput.value)
    await discardRecord()
  if (wakeSessionId)
    finishWakeInput()
}

function stopAudioInteraction() {
  try {
    browserFinalizedText = ''
    browserVadEnded = false
    browserSpeechActive = false
    removeStreamingTranscriptionConsumer(transcriptionConsumerId)
    stopOnStopRecord?.()
    stopOnStopRecord = undefined
    void stopStreamingTranscription(true)
    disposeVAD()
  }
  catch {}
}

watch([mode, enabled, stream, cards, wakeWordOwnership], async ([currentMode, isEnabled, currentStream]) => {
  const generation = ++detectorGeneration
  ++wakeGeneration
  if (wakeSpeechTimer)
    clearTimeout(wakeSpeechTimer)
  wakeSpeechTimer = undefined
  wakeSessionId = undefined
  stopAudioInteraction()
  keywordListener?.stop()
  try {
    if (currentMode === 'always' && isEnabled && currentStream)
      await startAudioInteraction()
    else if (currentMode === 'wake-word' && isEnabled)
      await startKeywordListening(currentStream, generation)
  }
  catch (error) {
    settingsAudioDeviceStore.setWakeWordPreparation('error', errorMessageFrom(error) ?? 'The model could not load.')
    console.error('Could not prepare Wake Word:', error)
  }
}, { immediate: true, deep: true })

onUnmounted(() => {
  ++detectorGeneration
  if (wakeSpeechTimer)
    clearTimeout(wakeSpeechTimer)
  stopAudioInteraction()
  keywordListener?.stop()
})

watch([stream, () => vadLoaded.value], async ([s, loaded]) => {
  if (enabled.value && loaded && s && (mode.value === 'always' || !!wakeSessionId)) {
    try {
      await startVAD(s)
    }
    catch (e) {
      console.error('Failed to start VAD with stream:', e)
    }
  }
})

const { x: mouseX, y: mouseY } = useMouse()
const cursorPosition = computed(() => ({
  x: mouseX.value,
  y: mouseY.value,
}))
</script>

<template>
  <BackgroundProvider
    ref="backgroundSurface"
    class="widgets top-widgets"
    :background="selectedOption"
    :style="stageSurfaceStyle"
    :top-color="sampledColor"
  >
    <div
      data-testid="mobile-stage-content"
      :class="[
        'relative z-2 h-full w-100vw overflow-hidden md:h-100dvh',
        'flex flex-col',
      ]"
    >
      <!-- header -->
      <div class="px-0 py-1 md:px-3 md:py-3" w-full gap-2>
        <Header class="hidden md:flex" />
      </div>
      <!-- page -->
      <div relative flex="~ 1 row gap-y-0 gap-x-2 <md:col">
        <div relative flex-1 min-w="1/2">
          <div
            absolute left-0 z-15 px-3
            :class="[
              stageModelRenderer === 'live2d' ? 'top-0 h-full py-[20vh]' : 'top-1/2 -translate-y-1/2',
            ]"
          >
            <ViewControlSlider />
          </div>
          <WidgetStage
            h-full w-full
            :cursor-position="cursorPosition"
            :enable-orbit-controls="!isMobile"
            :paused="paused"
          />
        </div>
        <InteractiveArea v-if="!isMobile" h="85dvh" absolute right-4 flex flex-1 flex-col max-w="500px" min-w="30%" />
      </div>
      <HoloCoupon />
    </div>
    <Teleport to="body">
      <MobileInteractiveArea
        v-if="isMobile"
        @settings-open="handleSettingsOpen"
        @stage-viewport-change="stageViewport = $event"
      />
    </Teleport>
  </BackgroundProvider>
</template>

<route lang="yaml">
name: IndexScenePage
meta:
  layout: stage
  stageTransition:
    name: bubble-wave-out
</route>

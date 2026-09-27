<script setup lang="ts">
import type { VoiceInputBinding } from '@proj-airi/stage-ui/libs/audio/voice-input-binding'

import Header from '@proj-airi/stage-layouts/components/Layouts/Header.vue'
import InteractiveArea from '@proj-airi/stage-layouts/components/Layouts/InteractiveArea.vue'
import MobileInteractiveArea from '@proj-airi/stage-layouts/components/Layouts/MobileInteractiveArea.vue'
import workletUrl from '@proj-airi/stage-ui/workers/vad/process.worklet?worker&url'

import { BackgroundProvider } from '@proj-airi/stage-layouts/components/Backgrounds'
import { useBackgroundThemeColor } from '@proj-airi/stage-layouts/composables/theme-color'
import { useBackgroundStore } from '@proj-airi/stage-layouts/stores/background'
import { HoloCoupon } from '@proj-airi/stage-ui/components'
import { ViewControlSlider, WidgetStage } from '@proj-airi/stage-ui/components/scenes'
import { useAudioRecorder } from '@proj-airi/stage-ui/composables/audio/audio-recorder'
import { createVoiceInputBinding } from '@proj-airi/stage-ui/libs/audio/voice-input-binding'
import { useVAD } from '@proj-airi/stage-ui/stores/ai/models/vad'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useHearingSpeechInputPipeline } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
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
const { stream, enabled } = storeToRefs(settingsAudioDeviceStore)
const { discardRecord, startRecord, stopRecord, onStopRecord } = useAudioRecorder(stream)
const hearingPipeline = useHearingSpeechInputPipeline()
const { releaseStreamingTranscriptionConsumer, transcribeForMediaStream, transcribeForRecording } = hearingPipeline
const { supportsStreamInput } = storeToRefs(hearingPipeline)
const consciousnessStore = useConsciousnessStore()
const { activeProvider: activeChatProvider, activeModel: activeChatModel, activeTemperature, activeTopP } = storeToRefs(consciousnessStore)
const chatStore = useChatStore()

/** Identifies this page in the shared streaming transcription session. */
const transcriptionConsumerId = 'stage-web:voice-input'

const {
  init: initVAD,
  dispose: disposeVAD,
  start: startVAD,
  loaded: vadLoaded,
  inferenceError: vadError,
} = useVAD(workletUrl, {
  threshold: ref(0.6),
  onSpeechStart: () => handleSpeechStart(),
  onSpeechEnd: () => handleSpeechEnd(),
  onSpeechCancel: () => handleSpeechCancel(),
})

let stopOnStopRecord: (() => void) | undefined
let currentBinding: VoiceInputBinding | undefined

async function sendVoiceInputTextToChat(text: string | undefined) {
  if (!text?.trim())
    return

  try {
    const providerId = activeChatProvider.value
    const model = activeChatModel.value
    if (!providerId || !model)
      return

    const provider = await consciousnessStore.getChatProviderInstance(providerId)

    await chatStore.ingest(text, {
      model,
      chatProvider: provider,
      temperature: activeTemperature.value,
      topP: activeTopP.value,
    })
  }
  catch (error) {
    console.error('Failed to send chat from voice:', error)
  }
}

async function startAudioInteraction(binding: VoiceInputBinding) {
  currentBinding = binding
  if (binding.mode === 'stream') {
    await transcribeForMediaStream(binding.stream, {
      consumerId: transcriptionConsumerId,
      onSentenceEnd: (text) => {
        if (currentBinding === binding)
          void sendVoiceInputTextToChat(text)
      },
    })
    if (hearingPipeline.error)
      throw new Error(hearingPipeline.error)
    return
  }

  await initVAD()
  if (!vadLoaded.value)
    throw new Error(vadError.value || 'Failed to initialize voice activity detection.')
  if (currentBinding !== binding)
    return
  await startVAD(binding.stream)

  stopOnStopRecord = onStopRecord(async (recording) => {
    const text = await transcribeForRecording(recording)
    if (currentBinding === binding)
      await sendVoiceInputTextToChat(text)
  })
}

async function handleSpeechStart() {
  if (currentBinding?.mode === 'recording')
    await startRecord()
}

async function handleSpeechEnd() {
  if (currentBinding?.mode === 'recording')
    await stopRecord()
}

async function handleSpeechCancel() {
  if (currentBinding?.mode === 'recording')
    await discardRecord()
}

async function stopAudioInteraction() {
  currentBinding = undefined
  stopOnStopRecord?.()
  stopOnStopRecord = undefined
  disposeVAD()
  await discardRecord()
  await releaseStreamingTranscriptionConsumer(transcriptionConsumerId)
}

const voiceInputBinding = createVoiceInputBinding({
  start: startAudioInteraction,
  stop: stopAudioInteraction,
})

watch([enabled, stream, supportsStreamInput], ([isEnabled, currentStream, supportsStream]) => {
  const binding: VoiceInputBinding | undefined = isEnabled && currentStream
    ? { stream: currentStream, mode: supportsStream ? 'stream' : 'recording' }
    : undefined
  void voiceInputBinding.update(binding).catch((error) => {
    console.error('Audio interaction failed:', error)
  })
}, { immediate: true })

onUnmounted(() => {
  void voiceInputBinding.update().catch(error => console.error('Failed to stop audio interaction:', error))
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

<script setup lang="ts">
import type { ChatProvider } from '@xsai-ext/providers/utils'

import Header from '@proj-airi/stage-layouts/components/Layouts/Header.vue'
import InteractiveArea from '@proj-airi/stage-layouts/components/Layouts/InteractiveArea.vue'
import MobileHeader from '@proj-airi/stage-layouts/components/Layouts/MobileHeader.vue'
import MobileInteractiveArea from '@proj-airi/stage-layouts/components/Layouts/MobileInteractiveArea.vue'
import workletUrl from '@proj-airi/stage-ui/workers/vad/process.worklet?worker&url'

import { BackgroundProvider } from '@proj-airi/stage-layouts/components/Backgrounds'
import { useBackgroundThemeColor } from '@proj-airi/stage-layouts/composables/theme-color'
import { useBackgroundStore } from '@proj-airi/stage-layouts/stores/background'
import { HoloCoupon } from '@proj-airi/stage-ui/components'
import { ViewControlSlider, WidgetStage } from '@proj-airi/stage-ui/components/scenes'
import { useAudioRecorder } from '@proj-airi/stage-ui/composables/audio/audio-recorder'
import { useVAD } from '@proj-airi/stage-ui/stores/ai/models/vad'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useHearingSpeechInputPipeline } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
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
const stageViewportOffset = shallowRef(0)
// WORKAROUND:
// NOTICE:
// Why: A fixed Stage follows Safari's input pan and moves Live2D with the keyboard.
// Root cause: Safari moves the Visual Viewport before the page receives the new offsetTop value.
// Source: https://bugs.webkit.org/show_bug.cgi?id=265578
// Context: packages/stage-layouts/src/browser/adaptive-input.ts
// Removal condition: Safari keeps fixed content stable during the input pan.
const stageSurfaceStyle = computed(() => isMobile.value
  ? {
      position: 'fixed' as const,
      inset: '0',
      height: '100dvh',
      transform: `translate3d(0, ${stageViewportOffset.value}px, 0)`,
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
const { removeStreamingTranscriptionConsumer, stopStreamingTranscription, transcribeForMediaStream, transcribeForRecording } = hearingPipeline
const { supportsStreamInput } = storeToRefs(hearingPipeline)
const providersStore = useProviderStore()
const consciousnessStore = useConsciousnessStore()
const { activeProvider: activeChatProvider, activeModel: activeChatModel } = storeToRefs(consciousnessStore)
const chatStore = useChatStore()

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
    const provider = await providersStore.getProviderInstance(activeChatProvider.value)
    if (!provider || !activeChatModel.value)
      return

    await chatStore.ingest(text, { model: activeChatModel.value, chatProvider: provider as ChatProvider })
  }
  catch (error) {
    console.error('Failed to send chat from voice:', error)
  }
}

async function startAudioInteraction() {
  try {
    await initVAD()
    if (stream.value)
      await startVAD(stream.value)

    if (shouldUseStreamInput.value && stream.value) {
      await transcribeForMediaStream(stream.value, {
        consumerId: transcriptionConsumerId,
        onSentenceEnd: text => void sendVoiceInputTextToChat(text),
      })
      return
    }

    // Hook once
    stopOnStopRecord = onStopRecord(async (recording) => {
      const text = await transcribeForRecording(recording)
      await sendVoiceInputTextToChat(text)
    })
  }
  catch (e) {
    console.error('Audio interaction init failed:', e)
  }
}

async function handleSpeechStart() {
  // For streaming providers, ChatArea component handles transcription manually
  // The main page should not start automatic transcription to avoid duplicate sessions
  if (shouldUseStreamInput.value) {
    return
  }

  startRecord()
}

async function handleSpeechEnd() {
  if (shouldUseStreamInput.value) {
    // Keep streaming session alive; idle timer in pipeline will handle teardown.
    return
  }

  stopRecord()
}

async function handleSpeechCancel() {
  if (!shouldUseStreamInput.value)
    await discardRecord()
}

function stopAudioInteraction() {
  try {
    removeStreamingTranscriptionConsumer(transcriptionConsumerId)
    stopOnStopRecord?.()
    stopOnStopRecord = undefined
    void stopStreamingTranscription(true)
    disposeVAD()
  }
  catch {}
}

watch(enabled, async (val) => {
  if (val) {
    await startAudioInteraction()
  }
  else {
    stopAudioInteraction()
  }
}, { immediate: true })

onUnmounted(() => {
  stopAudioInteraction()
})

watch([stream, () => vadLoaded.value], async ([s, loaded]) => {
  if (enabled.value && loaded && s) {
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
        'relative z-2 h-100dvh w-100vw overflow-hidden',
        'flex flex-col',
      ]"
    >
      <!-- header -->
      <div class="px-0 py-1 md:px-3 md:py-3" w-full gap-2>
        <Header class="hidden md:flex" />
        <MobileHeader class="flex md:hidden" />
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
        keyboard-avoidance
        @settings-open="handleSettingsOpen"
        @viewport-offset-change="stageViewportOffset = $event"
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

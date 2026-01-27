<script setup lang="ts">
import type { ChatProvider } from '@xsai-ext/providers/utils'

import workletUrl from '@proj-airi/stage-ui/workers/vad/process.worklet?worker&url'

import { useThreeSceneIsTransparentAtPoint } from '@proj-airi/stage-ui-three'
import { WidgetStage } from '@proj-airi/stage-ui/components/scenes'
import { useAudioRecorder } from '@proj-airi/stage-ui/composables/audio/audio-recorder'
import { useCanvasPixelIsTransparentAtPoint } from '@proj-airi/stage-ui/composables/canvas-alpha'
import { useVAD } from '@proj-airi/stage-ui/stores/ai/models/vad'
import { useChatOrchestratorStore } from '@proj-airi/stage-ui/stores/chat'
import { useLive2d } from '@proj-airi/stage-ui/stores/live2d'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useHearingSpeechInputPipeline } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { refDebounced, useBroadcastChannel } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onUnmounted, ref, toRef, watch } from 'vue'

import ControlsIsland from '../components/stage-islands/controls-island/index.vue'
import ResourceStatusIsland from '../components/stage-islands/resource-status-island/index.vue'

import { electron } from '../../shared/electron'
import {
  useElectronEventaInvoke,
  useElectronMouseAroundWindowBorder,
  useElectronMouseInElement,
  useElectronMouseInWindow,
  useElectronRelativeMouse,
} from '../composables/electron-vueuse'
import { useControlsIslandStore } from '../stores/controls-island'
import { useWindowStore } from '../stores/window'

const controlsIslandRef = ref<InstanceType<typeof ControlsIsland>>()
const widgetStageRef = ref<InstanceType<typeof WidgetStage>>()
const stageCanvas = toRef(() => widgetStageRef.value?.canvasElement())
const componentStateStage = ref<'pending' | 'loading' | 'mounted'>('pending')

const isLoading = ref(true)

const isIgnoringMouseEvents = ref(false)
const shouldFadeOnCursorWithin = ref(false)

const { isOutside: isOutsideWindow } = useElectronMouseInWindow()
const { isOutside } = useElectronMouseInElement(controlsIslandRef)
const isOutsideFor250Ms = refDebounced(isOutside, 250)
const { x: relativeMouseX, y: relativeMouseY } = useElectronRelativeMouse()
// NOTICE: In real-world use cases of Fade on Hover feature, the cursor may move around the edge of the
// model rapidly, causing flickering effects when checking pixel transparency strictly.
// Here we use render-target pixel sampling to keep detection aligned with the actual render output.
const isTransparentByPixels = useCanvasPixelIsTransparentAtPoint(
  stageCanvas,
  relativeMouseX,
  relativeMouseY,
  { regionRadius: 25 },
)
const isTransparentByThree = useThreeSceneIsTransparentAtPoint(
  widgetStageRef,
  relativeMouseX,
  relativeMouseY,
  { regionRadius: 25 },
)

const { stageModelRenderer } = storeToRefs(useSettings())
const isTransparent = computed(() => {
  if (stageModelRenderer.value === 'vrm')
    return isTransparentByThree.value

  if (stageModelRenderer.value === 'live2d')
    return isTransparentByPixels.value

  return true
})

const { isNearAnyBorder: isAroundWindowBorder } = useElectronMouseAroundWindowBorder({ threshold: 30 })
const isAroundWindowBorderFor250Ms = refDebounced(isAroundWindowBorder, 250)

const setIgnoreMouseEvents = useElectronEventaInvoke(electron.window.setIgnoreMouseEvents)

const { scale, positionInPercentageString } = storeToRefs(useLive2d())
const { live2dLookAtX, live2dLookAtY } = storeToRefs(useWindowStore())
const { fadeOnHoverEnabled } = storeToRefs(useControlsIslandStore())

watch(componentStateStage, () => isLoading.value = componentStateStage.value !== 'mounted', { immediate: true })

const { pause, resume } = watch(isTransparent, (transparent) => {
  shouldFadeOnCursorWithin.value = fadeOnHoverEnabled.value && !transparent
}, { immediate: true })

const hearingDialogOpen = computed(() => controlsIslandRef.value?.hearingDialogOpen ?? false)

watch([isOutsideFor250Ms, isAroundWindowBorderFor250Ms, isOutsideWindow, isTransparent, hearingDialogOpen, fadeOnHoverEnabled], () => {
  if (hearingDialogOpen.value) {
    // Hearing dialog/drawer is open; keep window interactive
    isIgnoringMouseEvents.value = false
    shouldFadeOnCursorWithin.value = false
    setIgnoreMouseEvents([false, { forward: true }])
    pause()
    return
  }

  const insideControls = !isOutsideFor250Ms.value
  const nearBorder = isAroundWindowBorderFor250Ms.value

  if (insideControls || nearBorder) {
    // Inside interactive controls or near resize border: do NOT ignore events
    isIgnoringMouseEvents.value = false
    shouldFadeOnCursorWithin.value = false
    setIgnoreMouseEvents([false, { forward: true }])
    pause()
  }
  else {
    const fadeEnabled = fadeOnHoverEnabled.value
    // Otherwise allow click-through while we fade UI based on transparency (when enabled)
    isIgnoringMouseEvents.value = fadeEnabled
    shouldFadeOnCursorWithin.value = fadeEnabled && !isOutsideWindow.value && !isTransparent.value
    setIgnoreMouseEvents([fadeEnabled, { forward: true }])
    if (fadeEnabled)
      resume()
    else
      pause()
  }
})

const settingsAudioDeviceStore = useSettingsAudioDevice()
const { stream, enabled } = storeToRefs(settingsAudioDeviceStore)
const { askPermission } = settingsAudioDeviceStore
const { startRecord, stopRecord, onStopRecord } = useAudioRecorder(stream)
const hearingPipeline = useHearingSpeechInputPipeline()
const {
  transcribeForRecording,
  transcribeForMediaStream,
  stopStreamingTranscription,
} = hearingPipeline
const { supportsStreamInput } = storeToRefs(hearingPipeline)
const providersStore = useProvidersStore()
const consciousnessStore = useConsciousnessStore()
const { activeProvider: activeChatProvider, activeModel: activeChatModel } = storeToRefs(consciousnessStore)
const chatStore = useChatOrchestratorStore()
const shouldUseStreamInput = computed(() => supportsStreamInput.value && !!stream.value)

const {
  init: initVAD,
  dispose: disposeVAD,
  start: startVAD,
  loaded: vadLoaded,
} = useVAD(workletUrl, {
  threshold: ref(0.6),
  onSpeechStart: () => {
    void handleSpeechStart()
  },
  onSpeechEnd: () => {
    void handleSpeechEnd()
  },
})

let stopOnStopRecord: (() => void) | undefined

// Caption overlay broadcast channel
type CaptionChannelEvent
  = | { type: 'caption-speaker', text: string }
    | { type: 'caption-assistant', text: string }
const { post: postCaption } = useBroadcastChannel<CaptionChannelEvent, CaptionChannelEvent>({ name: 'airi-caption-overlay' })

async function handleSpeechStart() {
  if (shouldUseStreamInput.value) {
    console.info('Speech detected - transcription session should already be active')
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

async function startAudioInteraction() {
  try {
    console.info('[Main Page] Starting audio interaction...')

    initVAD().then(() => {
      if (stream.value)
        return startVAD(stream.value)
    }).catch((err) => {
      console.warn('[Main Page] VAD initialization failed (non-critical for Web Speech API):', err)
    })

    if (shouldUseStreamInput.value) {
      console.info('[Main Page] Starting streaming transcription...', {
        supportsStreamInput: supportsStreamInput.value,
        hasStream: !!stream.value,
      })

      if (!stream.value) {
        console.warn('[Main Page] Stream not available despite shouldUseStreamInput being true')
        return
      }

      // Use sentence deltas for live captions and speech end for final text.
      await transcribeForMediaStream(stream.value, {
        onSentenceEnd: (delta) => {
          console.info('[Main Page] Received transcription delta:', delta)
          const finalText = delta
          if (!finalText || !finalText.trim()) {
            return
          }

          postCaption({ type: 'caption-speaker', text: finalText })

          void (async () => {
            try {
              const provider = await providersStore.getProviderInstance(activeChatProvider.value)
              if (!provider || !activeChatModel.value) {
                console.warn('[Main Page] No provider or model available, skipping chat send')
                return
              }

              console.info('[Main Page] Sending transcription to chat:', finalText)
              await chatStore.ingest(finalText, { model: activeChatModel.value, chatProvider: provider as ChatProvider })
            }
            catch (err) {
              console.error('[Main Page] Failed to send chat from voice:', err)
            }
          })()
        },
        onSpeechEnd: (text) => {
          console.info('[Main Page] Speech ended, final text:', text)
          postCaption({ type: 'caption-speaker', text })
        },
      })

      console.info('[Main Page] Streaming transcription started successfully')
    }
    else {
      console.warn('[Main Page] Not starting streaming transcription:', {
        shouldUseStreamInput: shouldUseStreamInput.value,
        hasStream: !!stream.value,
        supportsStreamInput: supportsStreamInput.value,
      })
    }

    // Hook once
    stopOnStopRecord = onStopRecord(async (recording) => {
      if (shouldUseStreamInput.value)
        return

      const text = await transcribeForRecording(recording)
      if (!text || !text.trim())
        return

      // Update caption overlay speaker text via BroadcastChannel
      postCaption({ type: 'caption-speaker', text })

      try {
        const provider = await providersStore.getProviderInstance(activeChatProvider.value)
        if (!provider || !activeChatModel.value)
          return

        await chatStore.ingest(text, { model: activeChatModel.value, chatProvider: provider as ChatProvider })
      }
      catch (err) {
        console.error('Failed to send chat from voice:', err)
      }
    })
  }
  catch (e) {
    console.error('Audio interaction init failed:', e)
  }
}

function stopAudioInteraction() {
  try {
    stopOnStopRecord?.()
    stopOnStopRecord = undefined
    void stopStreamingTranscription(true)
    disposeVAD()
  }
  catch {}
}

watch(enabled, async (val) => {
  console.info('[Main Page] Audio enabled changed:', val, 'stream available:', !!stream.value)
  if (val) {
    await askPermission()
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

// Assistant caption is broadcast from Stage.vue via the same channel
</script>

<template>
  <div
    max-h="[100vh]"
    max-w="[100vw]"
    flex="~ col"
    relative z-2 h-full overflow-hidden rounded-xl
    transition="opacity duration-500 ease-in-out"
  >
    <div
      v-show="!isLoading"
      :class="[
        'relative h-full w-full items-end gap-2',
        'transition-opacity duration-250 ease-in-out',
      ]"
    >
      <div
        :class="[
          shouldFadeOnCursorWithin ? 'op-0' : 'op-100',
          'absolute',
          'top-0 left-0 w-full h-full',
          'overflow-hidden',
          'rounded-2xl',
          'transition-opacity duration-250 ease-in-out',
        ]"
      >
        <ResourceStatusIsland />
        <WidgetStage
          ref="widgetStageRef"
          v-model:state="componentStateStage"
          h-full w-full
          flex-1
          :focus-at="{ x: live2dLookAtX, y: live2dLookAtY }"
          :scale="scale"
          :x-offset="positionInPercentageString.x"
          :y-offset="positionInPercentageString.y"
          mb="<md:18"
        />
        <ControlsIsland
          ref="controlsIslandRef"
        />
      </div>
    </div>
    <div v-show="isLoading" h-full w-full>
      <div class="absolute left-0 top-0 z-99 h-full w-full flex cursor-grab items-center justify-center overflow-hidden">
        <div
          :class="[
            'absolute h-24 w-full overflow-hidden rounded-xl',
            'flex items-center justify-center',
            'bg-white/80 dark:bg-neutral-950/80',
            'backdrop-blur-md',
          ]"
        >
          <div
            :class="[
              'drag-region',
              'absolute left-0 top-0',
              'h-full w-full flex items-center justify-center',
              'text-1.5rem text-primary-600 dark:text-primary-400 font-normal',
              'select-none',
              'animate-flash animate-duration-5s animate-count-infinite',
            ]"
          >
            Loading...
          </div>
        </div>
      </div>
    </div>
  </div>
  <Transition
    enter-active-class="transition-opacity duration-250"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-250"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="false"
      class="absolute left-0 top-0 z-99 h-full w-full flex cursor-grab items-center justify-center overflow-hidden drag-region"
    >
      <div
        class="absolute h-32 w-full flex items-center justify-center overflow-hidden rounded-xl"
        bg="white/80 dark:neutral-950/80" backdrop-blur="md"
      >
        <div class="wall absolute top-0 h-8" />
        <div class="absolute left-0 top-0 h-full w-full flex animate-flash animate-duration-5s animate-count-infinite select-none items-center justify-center text-1.5rem text-primary-400 font-normal drag-region">
          DRAG HERE TO MOVE
        </div>
        <div class="wall absolute bottom-0 h-8 drag-region" />
      </div>
    </div>
  </Transition>
  <Transition
    enter-active-class="transition-opacity duration-250 ease-in-out"
    enter-from-class="opacity-50"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-250 ease-in-out"
    leave-from-class="opacity-100"
    leave-to-class="opacity-50"
  >
    <div v-if="isAroundWindowBorderFor250Ms && !isLoading" class="pointer-events-none absolute left-0 top-0 z-999 h-full w-full">
      <div
        :class="[
          'b-primary/50',
          'h-full w-full animate-flash animate-duration-3s animate-count-infinite b-4 rounded-2xl',
        ]"
      />
    </div>
  </Transition>
</template>

<style scoped>
@keyframes wall-move {
  0% {
    transform: translateX(calc(var(--wall-width) * -2));
  }
  100% {
    transform: translateX(calc(var(--wall-width) * 1));
  }
}

.wall {
  --at-apply: text-primary-300;

  --wall-width: 8px;
  animation: wall-move 1s linear infinite;
  background-image: repeating-linear-gradient(
    45deg,
    currentColor,
    currentColor var(--wall-width),
    #ff00 var(--wall-width),
    #ff00 calc(var(--wall-width) * 2)
  );
  width: calc(100% + 4 * var(--wall-width));
}
</style>

<route lang="yaml">
meta:
  layout: stage
</route>

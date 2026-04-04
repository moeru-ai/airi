<script setup lang="ts">
import type { ModelSettingsRuntimeSnapshot } from '@proj-airi/stage-ui/components/scenarios/settings/model-settings/runtime'

import type { ModelSettingsRuntimeChannelEvent } from '../../shared/model-settings-runtime'

import workletUrl from '@proj-airi/stage-ui/workers/vad/process.worklet?worker&url'

import { electron } from '@proj-airi/electron-eventa'
import {
  useElectronEventaInvoke,
  useElectronMouseAroundWindowBorder,
  useElectronMouseInElement,
  useElectronMouseInWindow,
  useElectronRelativeMouse,
} from '@proj-airi/electron-vueuse'
import { useModelStore, useThreeSceneIsTransparentAtPoint } from '@proj-airi/stage-ui-three'
import { HoloCoupon } from '@proj-airi/stage-ui/components'
import {
  createEmptyModelSettingsRuntimeSnapshot,
  resolveComponentStateToRuntimePhase,
} from '@proj-airi/stage-ui/components/scenarios/settings/model-settings/runtime'
import { WidgetStage } from '@proj-airi/stage-ui/components/scenes'
import { useAudioAnalyzer } from '@proj-airi/stage-ui/composables/audio/audio-analyzer'
import { useAudioRecorder } from '@proj-airi/stage-ui/composables/audio/audio-recorder'
import { useCanvasPixelIsTransparentAtPoint } from '@proj-airi/stage-ui/composables/canvas-alpha'
import { useVAD } from '@proj-airi/stage-ui/stores/ai/models/vad'
import { useAudioContext } from '@proj-airi/stage-ui/stores/audio'
import { useLive2d } from '@proj-airi/stage-ui/stores/live2d'
import { useHearingSpeechInputPipeline, useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useOnboardingStore } from '@proj-airi/stage-ui/stores/onboarding'
import { useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { refDebounced, useBroadcastChannel, useEventBus } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, toRef, watch } from 'vue'

import ControlsIsland from '../components/stage-islands/controls-island/index.vue'
import ResourceStatusIsland from '../components/stage-islands/resource-status-island/index.vue'
import StatusIsland from '../components/stage-islands/status-island/index.vue'

import { electronOpenOnboarding } from '../../shared/eventa'
import { modelSettingsRuntimeSnapshotChannelName } from '../../shared/model-settings-runtime'
import { useChatSyncStore } from '../stores/chat-sync'
import { useControlsIslandStore } from '../stores/controls-island'
import { useStageWindowLifecycleStore } from '../stores/stage-window-lifecycle'
import { useWindowStore } from '../stores/window'
import { shouldSampleStageTransparency } from '../utils/stage-three-transparency'

const controlsIslandRef = ref<InstanceType<typeof ControlsIsland>>()
const statusIslandRef = ref<InstanceType<typeof StatusIsland>>()
const widgetStageRef = ref<InstanceType<typeof WidgetStage>>()
const stageCanvas = toRef(() => widgetStageRef.value?.canvasElement())
const componentStateStage = ref<'pending' | 'loading' | 'mounted'>('pending')
const stageMounted = computed(() => componentStateStage.value === 'mounted')
const isLoading = computed(() => !stageMounted.value)

const isIgnoringMouseEvents = ref(false)
const shouldFadeOnCursorWithin = ref(false)

const onboardingStore = useOnboardingStore()
const openOnboarding = useElectronEventaInvoke(electronOpenOnboarding)

const { isOutside: isOutsideWindow } = useElectronMouseInWindow()
const { isOutside } = useElectronMouseInElement(controlsIslandRef)
const { isOutside: isOutsideStatusIsland } = useElectronMouseInElement(statusIslandRef)
const isOutsideFor250Ms = refDebounced(isOutside, 250)
const isOutsideStatusIslandFor250Ms = refDebounced(isOutsideStatusIsland, 250)
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

const settingsStore = useSettings()
const { stageModelRenderer, stageModelSelectedUrl } = storeToRefs(settingsStore)
const modelStore = useModelStore()
const { sceneMutationLocked, scenePhase } = storeToRefs(modelStore)
const { stagePaused } = storeToRefs(useStageWindowLifecycleStore())
const { fadeOnHoverEnabled } = storeToRefs(useControlsIslandStore())
const modelSettingsRuntimeOwnerInstanceId = `tamagotchi-main-stage:${Math.random().toString(36).slice(2, 10)}`
const { data: modelSettingsRuntimeChannelEvent, post: postModelSettingsRuntimeChannelEvent } = useBroadcastChannel<ModelSettingsRuntimeChannelEvent, ModelSettingsRuntimeChannelEvent>({ name: modelSettingsRuntimeSnapshotChannelName })
const shouldUseThreeTransparencyHitTest = computed(() => shouldSampleStageTransparency({
  componentState: componentStateStage.value,
  fadeOnHoverEnabled: fadeOnHoverEnabled.value,
  stageModelRenderer: stageModelRenderer.value,
  stagePaused: stagePaused.value,
}))
const isTransparent = computed(() => {
  if (stagePaused.value || componentStateStage.value !== 'mounted' || !fadeOnHoverEnabled.value)
    return true

  if (stageModelRenderer.value === 'vrm')
    return shouldUseThreeTransparencyHitTest.value ? isTransparentByThree.value : true

  if (stageModelRenderer.value === 'live2d')
    return isTransparentByPixels.value

  return true
})

const { isNearAnyBorder: isAroundWindowBorder } = useElectronMouseAroundWindowBorder({ threshold: 30 })
const isAroundWindowBorderFor250Ms = refDebounced(isAroundWindowBorder, 250)

const setIgnoreMouseEvents = useElectronEventaInvoke(electron.window.setIgnoreMouseEvents)

const live2dStore = useLive2d()
const { scale, positionInPercentageString } = storeToRefs(live2dStore)
const { live2dLookAtX, live2dLookAtY } = storeToRefs(useWindowStore())

const { pause, resume } = watch(isTransparent, (transparent) => {
  shouldFadeOnCursorWithin.value = fadeOnHoverEnabled.value && !transparent
}, { immediate: true })

const hearingDialogOpen = computed(() => controlsIslandRef.value?.hearingDialogOpen ?? false)

const modelSettingsRuntimeSnapshot = computed<ModelSettingsRuntimeSnapshot>(() => {
  const hasModel = !!stageModelSelectedUrl.value

  if (stageModelRenderer.value === 'live2d') {
    const phase = resolveComponentStateToRuntimePhase(componentStateStage.value, { hasModel })

    return createEmptyModelSettingsRuntimeSnapshot({
      ownerInstanceId: modelSettingsRuntimeOwnerInstanceId,
      renderer: 'live2d',
      phase,
      controlsLocked: hasModel ? phase !== 'mounted' : false,
      previewAvailable: hasModel,
      canCapturePreview: false,
      updatedAt: Date.now(),
    })
  }

  if (stageModelRenderer.value === 'vrm') {
    return createEmptyModelSettingsRuntimeSnapshot({
      ownerInstanceId: modelSettingsRuntimeOwnerInstanceId,
      renderer: 'vrm',
      phase: hasModel ? scenePhase.value : 'no-model',
      controlsLocked: hasModel
        ? (!stageMounted.value || sceneMutationLocked.value)
        : false,
      previewAvailable: hasModel,
      canCapturePreview: false,
      updatedAt: Date.now(),
    })
  }

  return createEmptyModelSettingsRuntimeSnapshot({
    ownerInstanceId: modelSettingsRuntimeOwnerInstanceId,
    updatedAt: Date.now(),
  })
})

watch([isOutsideFor250Ms, isOutsideStatusIslandFor250Ms, isAroundWindowBorderFor250Ms, isOutsideWindow, isTransparent, hearingDialogOpen, fadeOnHoverEnabled, stagePaused], () => {
  if (stagePaused.value) {
    isIgnoringMouseEvents.value = false
    shouldFadeOnCursorWithin.value = false
    setIgnoreMouseEvents([false, { forward: true }])
    pause()
    return
  }

  if (hearingDialogOpen.value) {
    // Hearing dialog/drawer is open; keep window interactive
    isIgnoringMouseEvents.value = false
    shouldFadeOnCursorWithin.value = false
    setIgnoreMouseEvents([false, { forward: true }])
    pause()
    return
  }

  const insideControls = !isOutsideFor250Ms.value || !isOutsideStatusIslandFor250Ms.value
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

// Emit runtime snapshot on change and on request from settings panel
watch(modelSettingsRuntimeSnapshot, (snapshot) => {
  postModelSettingsRuntimeChannelEvent({ type: 'snapshot', snapshot })
}, { immediate: true })

watch(modelSettingsRuntimeChannelEvent, (event) => {
  if (event?.type !== 'request-current')
    return

  postModelSettingsRuntimeChannelEvent({ type: 'snapshot', snapshot: modelSettingsRuntimeSnapshot.value })
})

const settingsAudioDeviceStore = useSettingsAudioDevice()
const { stream, enabled } = storeToRefs(settingsAudioDeviceStore)
const { askPermission } = settingsAudioDeviceStore
const { startRecord, stopRecord, onStopRecord } = useAudioRecorder(stream)
const hearingPipeline = useHearingSpeechInputPipeline()
const { transcribeForRecording, transcribeForMediaStream, stopStreamingTranscription } = hearingPipeline
const { supportsStreamInput } = storeToRefs(hearingPipeline)
const chatSyncStore = useChatSyncStore()
const shouldUseStreamInput = computed(() => supportsStreamInput.value && !!stream.value)

const hearingStore = useHearingStore()
// NOTICE: 增加 useVADModel 与 volumeThreshold
const { useVADModel, volumeThreshold, useVADThreshold, minSilenceDurationMs, autoSendEnabled } = storeToRefs(hearingStore)

// 音量检测回退方案 (Volume-based Fallback)
const { audioContext } = storeToRefs(useAudioContext())
const { startAnalyzer, stopAnalyzer, onAnalyzerUpdate } = useAudioAnalyzer()
const isSpeechVolume = ref(false)
let silenceTimer: ReturnType<typeof setTimeout> | undefined
// NOTICE: 定义音量监听回调的卸载方法
let stopAnalyzerUpdate: (() => void) | undefined
// NOTICE: PR 修复 - 保存 MediaStreamSourceNode 引用以便在停止时断开，防止 AudioGraph 内存泄漏
let volumeMediaStreamSource: MediaStreamAudioSourceNode | undefined

const { init: initVAD, dispose: disposeVAD, start: startVAD, loaded: vadLoaded } = useVAD(workletUrl, {
  threshold: useVADThreshold,
  minSilenceDurationMs,
  onSpeechStart: () => {
    if (useVADModel.value)
      void handleSpeechStart()
  },
  onSpeechEnd: () => {
    if (useVADModel.value)
      void handleSpeechEnd()
  },
})

// eslint-disable-next-line unused-imports/no-unused-vars
let audioSessionId = 0
let stopOnStopRecord: (() => void) | undefined
const audioInteractionStarting = ref(false)

// Caption overlay broadcast channel
type CaptionChannelEvent
  = | { type: 'caption-speaker', text: string }
    | { type: 'caption-assistant', text: string }
const { post: postCaption } = useBroadcastChannel<CaptionChannelEvent, CaptionChannelEvent>({ name: 'airi-caption-overlay' })

// NOTICE: 文本传送带发射器：用于在自动发送关闭时，将录音结果传送到客厅 (ChatArea) 的输入框中
const { emit: postChatInput } = useEventBus<{ type: 'append-text', text: string }>('airi-chat-input-commands')

function handleStreamingSentenceEnd(delta: string) {
  console.info('[Main Page] Received transcription delta:', delta)
  const finalText = delta
  if (!finalText || !finalText.trim()) {
    return
  }

  postCaption({ type: 'caption-speaker', text: finalText })

  // NOTICE: 只有在全局开启了自动发送时，才将语音文本真正发送给后端，否则仅显示气泡字幕
  if (autoSendEnabled.value) {
    void (async () => {
      try {
        console.info('[Main Page] Sending transcription to chat:', finalText)
        await chatSyncStore.requestIngest({ text: finalText })
      }
      catch (err) {
        console.error('[Main Page] Failed to send chat from voice:', err)
      }
    })()
  }
  else {
    postChatInput({ type: 'append-text', text: finalText })
  }
}
function handleStreamingSpeechEnd(text: string) {
  console.info('[Main Page] Speech ended, final text:', text)
  postCaption({ type: 'caption-speaker', text })
}

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
  if (audioInteractionStarting.value)
    return

  audioSessionId++

  audioInteractionStarting.value = true
  try {
    console.info('[Main Page] Starting audio interaction...')

    // 监测引擎分流：根据 VAD 模型配置选择底层监听方式
    if (useVADModel.value) {
      initVAD().then(() => {
        // NOTICE: 竞态拦截 - 仅在模式切出，或 VAD 未真正就绪（并发提前返回）时丢弃。
        // 这样可以确保并发触发时，首个真正完成加载的 init 能接管最新流，防止 VAD 永久卡在 loading 失聪
        if (!useVADModel.value || !vadLoaded.value)
          return

        if (stream.value) {
          console.info('[Main Page] VAD initialized successfully, starting with stream input')
          // NOTICE: 克隆 MediaStream 传入 VAD，防止 disposeVAD() 时物理停止原始麦克风轨道
          return startVAD(stream.value.clone())
        }
      }).catch((err) => {
        console.warn('[Main Page] VAD initialization failed (non-critical for Web Speech API):', err)
      })
    }
    else {
      // 纯音量检测机制 (Fallback)
      if (stream.value) {
        // NOTICE: 确保 AudioContext 在挂载分析器前被唤醒，解决挂起失聪问题
        if (audioContext.value.state === 'suspended') {
          audioContext.value.resume().catch(e => console.warn('Failed to resume AudioContext:', e))
        }

        // NOTICE: 挂载新流前断开旧节点的连接，防止 AudioGraph 泄露
        volumeMediaStreamSource?.disconnect()
        const source = audioContext.value.createMediaStreamSource(stream.value)
        volumeMediaStreamSource = source
        const analyzer = startAnalyzer(audioContext.value)

        // NOTICE: 重新赋值前必须执行一次卸载，防止因设备重连或流刷新造成的函数重入，导致旧闭包残留和幽灵并发
        stopAnalyzerUpdate?.()

        // NOTICE: 捕获并保存 unsubscribe 钩子以防止内存泄漏和多重触发
        stopAnalyzerUpdate = onAnalyzerUpdate((volumeLevel) => {
          if (useVADModel.value)
            return

          const isSpeaking = volumeLevel > volumeThreshold.value

          if (isSpeaking && !isSpeechVolume.value) {
            isSpeechVolume.value = true
            if (silenceTimer)
              clearTimeout(silenceTimer)
            void handleSpeechStart()
          }
          else if (!isSpeaking && isSpeechVolume.value) {
            if (!silenceTimer) {
              silenceTimer = setTimeout(() => {
                isSpeechVolume.value = false
                void handleSpeechEnd()
                silenceTimer = undefined
              }, minSilenceDurationMs.value)
            }
          }
          else if (isSpeaking && isSpeechVolume.value) {
            if (silenceTimer) {
              clearTimeout(silenceTimer)
              silenceTimer = undefined
            }
          }
        })

        if (analyzer)
          source.connect(analyzer)
      }
    }

    if (shouldUseStreamInput.value) {
      console.info('[Main Page] Starting streaming transcription...', {
        supportsStreamInput: supportsStreamInput.value,
        hasStream: !!stream.value,
      })

      if (!stream.value) {
        console.warn('[Main Page] Stream not available despite shouldUseStreamInput being true')
        return
      }

      await transcribeForMediaStream(stream.value, {
        onSentenceEnd: handleStreamingSentenceEnd,
        onSpeechEnd: handleStreamingSpeechEnd,
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

    if (!stopOnStopRecord) {
      stopOnStopRecord = onStopRecord(async (recording) => {
        if (shouldUseStreamInput.value)
          return

        const text = await transcribeForRecording(recording)
        if (!text || !text.trim())
          return

        postCaption({ type: 'caption-speaker', text })

        if (autoSendEnabled.value) {
          try {
            await chatSyncStore.requestIngest({ text })
          }
          catch (err) {
            console.error('Failed to send chat from voice:', err)
          }
        }
        else {
          postChatInput({ type: 'append-text', text })
        }
      })
    }
  }
  catch (e) {
    console.error('Audio interaction init failed:', e)
  }
  finally {
    audioInteractionStarting.value = false
  }
}

async function stopAudioInteraction() {
  try {
    audioSessionId++ // 废弃所有仍在 inflight 的启动流程

    // NOTICE: 必须 await 等待录音 finalize 完成并触发回调后，才能卸载钩子，否则最后一句会被丢弃
    await stopRecord()
    stopOnStopRecord?.()
    stopOnStopRecord = undefined
    audioInteractionStarting.value = false

    if (silenceTimer) {
      clearTimeout(silenceTimer)
      silenceTimer = undefined
    }
    isSpeechVolume.value = false

    stopAnalyzerUpdate?.()
    stopAnalyzerUpdate = undefined

    void stopStreamingTranscription(true)
    stopAnalyzer()

    volumeMediaStreamSource?.disconnect()
    volumeMediaStreamSource = undefined

    disposeVAD()
  }
  catch (e) {
    console.error('Failed to stop audio interaction cleanly', e)
  }
}

watch(enabled, async (val) => {
  console.info('[Main Page] Audio enabled changed:', val, 'stream available:', !!stream.value)
  if (val) {
    await askPermission()
    await startAudioInteraction()
  }
  else {
    await stopAudioInteraction()
  }
}, { immediate: true })

// 监听 VAD 模式开关动态热插拔引擎
watch(useVADModel, async () => {
  if (enabled.value) {
    await stopAudioInteraction()
    await startAudioInteraction()
  }
})

onMounted(() => {
  chatSyncStore.initialize('authority')
  if (onboardingStore.needsOnboarding) {
    openOnboarding()
  }
})

onUnmounted(() => {
  postModelSettingsRuntimeChannelEvent({
    type: 'owner-gone',
    ownerInstanceId: modelSettingsRuntimeOwnerInstanceId,
  })
  void stopAudioInteraction()
  chatSyncStore.dispose()
})

watch(stream, async (currentStream) => {
  if (!enabled.value || !currentStream || audioInteractionStarting.value)
    return

  console.info('[Main Page] Stream became available, ensuring audio interaction is restarted')
  await stopAudioInteraction()
  await startAudioInteraction()
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
    <!-- Stage is always in DOM so TresCanvas can measure dimensions -->
    <div
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
        <StatusIsland ref="statusIslandRef" />
        <ResourceStatusIsland />
        <WidgetStage
          ref="widgetStageRef"
          v-model:state="componentStateStage"
          h-full w-full
          flex-1
          :paused="stagePaused"
          :focus-at="{ x: live2dLookAtX, y: live2dLookAtY }"
          :scale="scale"
          :x-offset="positionInPercentageString.x"
          :y-offset="positionInPercentageString.y"
        />
        <HoloCoupon />
        <ControlsIsland
          ref="controlsIslandRef"
        />
      </div>
    </div>
    <!-- Loading overlay sits on top, does not hide the stage -->
    <div v-show="isLoading" class="absolute left-0 top-0 z-99 h-full w-full flex cursor-grab items-center justify-center overflow-hidden">
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

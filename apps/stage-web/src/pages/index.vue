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
import { WidgetStage } from '@proj-airi/stage-ui/components/scenes'
// Audio + transcription pipeline (mirrors stage-tamagotchi)
import { useAudioAnalyzer } from '@proj-airi/stage-ui/composables/audio/audio-analyzer'
import { useAudioRecorder } from '@proj-airi/stage-ui/composables/audio/audio-recorder'
import { useVAD } from '@proj-airi/stage-ui/stores/ai/models/vad'
import { useAudioContext } from '@proj-airi/stage-ui/stores/audio'
import { useChatOrchestratorStore } from '@proj-airi/stage-ui/stores/chat'
import { useLive2d } from '@proj-airi/stage-ui/stores/live2d'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useHearingSpeechInputPipeline, useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { breakpointsTailwind, useBreakpoints, useEventBus, useMouse } from '@vueuse/core'
// NOTICE: 从 hearingStore 解构出全局配置与自动发送开关
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'

const paused = ref(false)

function handleSettingsOpen(open: boolean) {
  paused.value = open
}

const positionCursor = useMouse()
const { scale, position, positionInPercentageString } = storeToRefs(useLive2d())
const breakpoints = useBreakpoints(breakpointsTailwind)
const isMobile = breakpoints.smaller('md')

const backgroundStore = useBackgroundStore()
const { selectedOption, sampledColor } = storeToRefs(backgroundStore)
const backgroundSurface = useTemplateRef<InstanceType<typeof BackgroundProvider>>('backgroundSurface')

const { syncBackgroundTheme } = useBackgroundThemeColor({ backgroundSurface, selectedOption, sampledColor })
onMounted(() => syncBackgroundTheme())

const settingsAudioDeviceStore = useSettingsAudioDevice()
const { stream, enabled } = storeToRefs(settingsAudioDeviceStore)
const { startRecord, stopRecord, onStopRecord } = useAudioRecorder(stream)
const hearingPipeline = useHearingSpeechInputPipeline()
const { transcribeForRecording } = hearingPipeline
const { supportsStreamInput } = storeToRefs(hearingPipeline)
const providersStore = useProvidersStore()
const consciousnessStore = useConsciousnessStore()
const { activeProvider: activeChatProvider, activeModel: activeChatModel } = storeToRefs(consciousnessStore)
const chatStore = useChatOrchestratorStore()

const shouldUseStreamInput = computed(() => supportsStreamInput.value && !!stream.value)

const hearingStore = useHearingStore()
const { useVADModel, volumeThreshold, useVADThreshold, minSilenceDurationMs, autoSendEnabled } = storeToRefs(hearingStore)
// NOTICE: PR 修复 - 将跨 Tab 广播改为基于内存的 EventBus，防止多窗口串流导致文本泄露到其他实例
const { emit: postChatInput } = useEventBus<{ type: 'append-text', text: string }>('airi-chat-input-commands')

// 音量检测回退方案 (Volume-based Fallback)
const { audioContext } = storeToRefs(useAudioContext())
const { startAnalyzer, stopAnalyzer, onAnalyzerUpdate } = useAudioAnalyzer()
const isSpeechVolume = ref(false)
let silenceTimer: ReturnType<typeof setTimeout> | undefined
// NOTICE: 定义音量监听回调的卸载方法
let stopAnalyzerUpdate: (() => void) | undefined
// NOTICE: PR 修复 - 保存 MediaStreamSourceNode 引用以便在停止时断开，防止 AudioGraph 内存泄漏
let volumeMediaStreamSource: MediaStreamAudioSourceNode | undefined

const {
  init: initVAD,
  dispose: disposeVAD,
  start: startVAD,
  loaded: vadLoaded,
} = useVAD(workletUrl, {
  threshold: useVADThreshold,
  minSilenceDurationMs,
  onSpeechStart: () => {
    if (useVADModel.value)
      handleSpeechStart()
  },
  onSpeechEnd: () => {
    if (useVADModel.value)
      handleSpeechEnd()
  },
})

// eslint-disable-next-line unused-imports/no-unused-vars
let audioSessionId = 0
let stopOnStopRecord: (() => void) | undefined

async function startAudioInteraction() {
  audioSessionId++

  try {
    // Hook once
    if (!stopOnStopRecord) {
      stopOnStopRecord = onStopRecord(async (recording) => {
        const text = await transcribeForRecording(recording)
        if (!text || !text.trim())
          return

        // NOTICE: 增加 autoSendEnabled 的拦截判断
        if (autoSendEnabled.value) {
          try {
            const provider = await providersStore.getProviderInstance(activeChatProvider.value)
            if (!provider || !activeChatModel.value)
              return

            await chatStore.ingest(text, { model: activeChatModel.value, chatProvider: provider as ChatProvider })
          }
          catch (err) {
            console.error('Failed to send chat from voice:', err)
          }
        }
        else {
          // NOTICE: 如果关闭了自动发送，就把文本扔到对讲机频道上，让 ChatArea/InteractiveArea 捡走填入输入框
          postChatInput({ type: 'append-text', text })
        }
      })
    }

    if (!stream.value)
      return

    if (useVADModel.value) {
      await initVAD()
      // NOTICE: 竞态拦截 - 仅在模式切出，或 VAD 未真正就绪（并发提前返回）时丢弃。
      // 这样可以确保并发触发时，首个真正完成加载的 init 能接管最新流，防止 VAD 永久卡在 loading 失聪
      if (!useVADModel.value || !vadLoaded.value)
        return
      // NOTICE: 克隆 MediaStream 传入 VAD，防止 disposeVAD() 时物理停止原始麦克风轨道
      await startVAD(stream.value.clone())
    }
    else {
      // NOTICE: 确保 AudioContext 在挂载分析器前被唤醒，解决自动恢复配置时的挂起失聪问题
      if (audioContext.value.state === 'suspended') {
        await audioContext.value.resume()
      }

      // NOTICE: 挂载新流前断开旧节点的连接，防止 AudioGraph 泄露
      volumeMediaStreamSource?.disconnect()
      const source = audioContext.value.createMediaStreamSource(stream.value)
      volumeMediaStreamSource = source
      const analyzer = startAnalyzer(audioContext.value)

      // NOTICE: 确保卸载上一次的闭包
      stopAnalyzerUpdate?.()

      stopAnalyzerUpdate = onAnalyzerUpdate((volumeLevel) => {
        if (useVADModel.value)
          return

        const isSpeaking = volumeLevel > volumeThreshold.value

        if (isSpeaking && !isSpeechVolume.value) {
          isSpeechVolume.value = true
          if (silenceTimer)
            clearTimeout(silenceTimer)
          handleSpeechStart()
        }
        else if (!isSpeaking && isSpeechVolume.value) {
          if (!silenceTimer) {
            silenceTimer = setTimeout(() => {
              isSpeechVolume.value = false
              handleSpeechEnd()
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

async function stopAudioInteraction() {
  try {
    audioSessionId++ // 废弃所有仍在 inflight 的启动流程

    // NOTICE: 必须 await 等待录音 finalize 完成并触发回调后，才能卸载钩子，否则最后一句会被丢弃
    await stopRecord()
    stopOnStopRecord?.()
    stopOnStopRecord = undefined

    if (silenceTimer) {
      clearTimeout(silenceTimer)
      silenceTimer = undefined
    }
    isSpeechVolume.value = false

    stopAnalyzerUpdate?.()
    stopAnalyzerUpdate = undefined

    stopAnalyzer()

    volumeMediaStreamSource?.disconnect()
    volumeMediaStreamSource = undefined

    disposeVAD()
  }
  catch {}
}

watch(enabled, async (val) => {
  if (val) {
    await startAudioInteraction()
  }
  else {
    await stopAudioInteraction()
  }
}, { immediate: true })

watch(useVADModel, async () => {
  if (enabled.value) {
    await stopAudioInteraction()
    await startAudioInteraction()
  }
})

onUnmounted(() => {
  // unmounted 是同步的，直接 void 即可
  void stopAudioInteraction()
})

watch(stream, async (currentStream) => {
  if (!enabled.value || !currentStream)
    return

  console.info('[Main Page] Stream became available, ensuring audio interaction is restarted')
  await stopAudioInteraction()
  await startAudioInteraction()
})
</script>

<template>
  <BackgroundProvider
    ref="backgroundSurface"
    class="widgets top-widgets"
    :background="selectedOption"
    :top-color="sampledColor"
  >
    <div relative flex="~ col" z-2 h-100dvh w-100vw of-hidden>
      <!-- header -->
      <div class="px-0 py-1 md:px-3 md:py-3" w-full gap-2>
        <Header class="hidden md:flex" />
        <MobileHeader class="flex md:hidden" />
      </div>
      <!-- page -->
      <div relative flex="~ 1 row gap-y-0 gap-x-2 <md:col">
        <WidgetStage
          flex-1 min-w="1/2"
          :paused="paused"
          :focus-at="{
            x: positionCursor.x.value,
            y: positionCursor.y.value,
          }"
          :x-offset="`${isMobile ? position.x : position.x - 10}%`"
          :y-offset="positionInPercentageString.y"
          :scale="scale"
        />
        <InteractiveArea v-if="!isMobile" h="85dvh" absolute right-4 flex flex-1 flex-col max-w="500px" min-w="30%" />
        <MobileInteractiveArea v-if="isMobile" @settings-open="handleSettingsOpen" />
      </div>
      <HoloCoupon />
    </div>
  </BackgroundProvider>
</template>

<route lang="yaml">
name: IndexScenePage
meta:
  layout: stage
  stageTransition:
    name: bubble-wave-out
</route>

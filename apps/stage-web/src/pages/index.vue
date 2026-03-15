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
import { WidgetStage } from '@proj-airi/stage-ui/components/scenes'
import { useAudioRecorder } from '@proj-airi/stage-ui/composables/audio/audio-recorder'
import { useVAD } from '@proj-airi/stage-ui/stores/ai/models/vad'
import { useChatOrchestratorStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useLive2d } from '@proj-airi/stage-ui/stores/live2d'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useHearingSpeechInputPipeline } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useVolcVoiceStore } from '@proj-airi/stage-ui/stores/modules/volc-voice'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { useSettingsAudioDevice, useSettingsVolcRealtime } from '@proj-airi/stage-ui/stores/settings'
import { breakpointsTailwind, useBreakpoints, useMouse } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, shallowRef, useTemplateRef, watch } from 'vue'

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

// Audio + transcription pipeline (mirrors stage-tamagotchi)
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
const volcVoice = useVolcVoiceStore()
const { isConnected: volcVoiceConnected } = storeToRefs(volcVoice)
const volcSettings = useSettingsVolcRealtime()
const { enabled: volcEnabled, autoConnect: volcAutoConnect } = storeToRefs(volcSettings)

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
})

let stopOnStopRecord: (() => void) | undefined

async function startAudioInteraction() {
  // Skip built-in STT when Volc Voice is handling audio
  if (volcVoiceConnected.value)
    return

  try {
    await initVAD()
    if (stream.value)
      await startVAD(stream.value)

    // Hook once
    stopOnStopRecord = onStopRecord(async (recording) => {
      const text = await transcribeForRecording(recording)
      if (!text || !text.trim())
        return

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

function stopAudioInteraction() {
  try {
    stopOnStopRecord?.()
    stopOnStopRecord = undefined
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
  stopAudioForwarding()
  volcVoice.disconnect()
})

watch([stream, () => vadLoaded.value], async ([s, loaded]) => {
  if (volcVoiceConnected.value)
    return
  if (enabled.value && loaded && s) {
    try {
      await startVAD(s)
    }
    catch (e) {
      console.error('Failed to start VAD with stream:', e)
    }
  }
})

// --- Volcengine Realtime: auto-connect + audio forwarding ---

const VOICE_SAMPLE_RATE = 16000
const CHUNK_SAMPLES = 320 // 20ms at 16kHz

const forwardingCtx = shallowRef<AudioContext | null>(null)
const forwardingWorklet = shallowRef<AudioWorkletNode | null>(null)
const forwardingSource = shallowRef<MediaStreamAudioSourceNode | null>(null)

function float32ToInt16(buffer: Float32Array): Int16Array {
  const output = new Int16Array(buffer.length)
  for (let i = 0; i < buffer.length; i++) {
    const value = Math.max(-1, Math.min(1, buffer[i]))
    output[i] = value < 0 ? value * 0x8000 : value * 0x7FFF
  }
  return output
}

async function startAudioForwarding(mediaStream: MediaStream) {
  stopAudioForwarding()

  try {
    // Use system default sample rate (usually 48kHz) — do NOT force 16kHz
    // Forcing 16kHz AudioContext causes zero-data on macOS Chrome
    const ctx = new AudioContext({ latencyHint: 'interactive' })
    forwardingCtx.value = ctx
    const nativeSR = ctx.sampleRate
    const ratio = nativeSR / VOICE_SAMPLE_RATE

    const workletCode = `
class VolcForwardProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buffer = new Float32Array(0)
    this.ratio = ${ratio}
    this.targetChunkSize = ${CHUNK_SAMPLES}
  }
  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0]) return true
    const channel = input[0]
    const ratio = this.ratio
    const downLen = Math.floor(channel.length / ratio)
    if (downLen === 0) return true

    const newBuffer = new Float32Array(this.buffer.length + downLen)
    newBuffer.set(this.buffer)
    for (let i = 0; i < downLen; i++) {
      newBuffer[this.buffer.length + i] = channel[Math.floor(i * ratio)]
    }
    this.buffer = newBuffer

    while (this.buffer.length >= this.targetChunkSize) {
      const chunk = this.buffer.slice(0, this.targetChunkSize)
      this.port.postMessage({ buffer: chunk })
      this.buffer = this.buffer.slice(this.targetChunkSize)
    }
    return true
  }
}
registerProcessor('volc-forward-processor', VolcForwardProcessor)
`
    const blob = new Blob([workletCode], { type: 'application/javascript' })
    const blobUrl = URL.createObjectURL(blob)
    await ctx.audioWorklet.addModule(blobUrl)
    URL.revokeObjectURL(blobUrl)

    const node = new AudioWorkletNode(ctx, 'volc-forward-processor')
    forwardingWorklet.value = node

    node.port.onmessage = ({ data }: MessageEvent<{ buffer: Float32Array }>) => {
      if (!data.buffer)
        return
      const pcm16 = float32ToInt16(data.buffer)
      volcVoice.sendAudioChunk(pcm16.buffer as ArrayBuffer)
    }

    const source = ctx.createMediaStreamSource(mediaStream)
    forwardingSource.value = source
    source.connect(node)

    // Silent sink to keep the graph alive without feedback
    const silentGain = ctx.createGain()
    silentGain.gain.value = 0
    node.connect(silentGain)
    silentGain.connect(ctx.destination)
  }
  catch (err) {
    console.error('[VolcForward] Failed to start audio forwarding:', err)
    stopAudioForwarding()
  }
}

function stopAudioForwarding() {
  if (forwardingSource.value) {
    forwardingSource.value.disconnect()
    forwardingSource.value = null
  }
  if (forwardingWorklet.value) {
    forwardingWorklet.value.port.onmessage = null
    forwardingWorklet.value.disconnect()
    forwardingWorklet.value = null
  }
  if (forwardingCtx.value) {
    forwardingCtx.value.close()
    forwardingCtx.value = null
  }
}

// Auto-connect when enabled + autoConnect
onMounted(() => {
  if (volcEnabled.value && volcAutoConnect.value && !volcVoiceConnected.value) {
    volcVoice.connect()
  }
})

// Start/stop audio forwarding based on connection + mic stream
watch([volcVoiceConnected, stream], ([connected, s]) => {
  if (connected && s) {
    startAudioForwarding(s)
  }
  else {
    stopAudioForwarding()
  }
})

// Write Volcengine dialog messages into AIRI's chat history
const chatSession = useChatSessionStore()

volcVoice.onChatEnded(({ userText, assistantText }) => {
  if (!userText && !assistantText)
    return

  const sessionId = chatSession.activeSessionId
  if (!sessionId)
    return

  chatSession.ensureSession(sessionId)
  const msgs = chatSession.sessionMessages[sessionId]
  if (!msgs)
    return

  const now = Date.now()
  if (userText) {
    msgs.push({ role: 'user', content: userText, createdAt: now, id: `volc-u-${now}` })
  }
  if (assistantText) {
    msgs.push({
      role: 'assistant',
      content: assistantText,
      slices: [{ type: 'text', text: assistantText }],
      tool_results: [],
      createdAt: now + 1,
      id: `volc-a-${now}`,
    })
  }
  chatSession.persistSessionMessages(sessionId)
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

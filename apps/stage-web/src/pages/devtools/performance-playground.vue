<script setup lang="ts">
import type { GestureFrame, VrmUpperBodyBone } from '@proj-airi/stage-ui-three'
import type { Emotion } from '@proj-airi/stage-ui/constants/emotions'
import type { TTSChunkItem } from '@proj-airi/stage-ui/utils/tts'
import type { ChatProvider, SpeechProviderWithExtraOptions } from '@xsai-ext/shared-providers'

import { ThreeScene } from '@proj-airi/stage-ui-three'
import { animations } from '@proj-airi/stage-ui-three/assets/vrm'
import { useDelayMessageQueue, useEmotionsMessageQueue, usePipelineCharacterSpeechPlaybackQueueStore, usePipelineWorkflowTextSegmentationStore } from '@proj-airi/stage-ui/composables/queues'
import { llmInferenceEndToken } from '@proj-airi/stage-ui/constants'
import { EMOTION_VRMExpressionName_value, EmotionThinkMotionName } from '@proj-airi/stage-ui/constants/emotions'
import { useAudioContext, useSpeakingStore } from '@proj-airi/stage-ui/stores/audio'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { createQueue } from '@proj-airi/stage-ui/utils/queue'
import { generateSpeech } from '@xsai/generate-speech'
import { storeToRefs } from 'pinia'
import { Euler, MathUtils, Quaternion } from 'three'
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'

// VRM scene refs
const sceneRef = ref<InstanceType<typeof ThreeScene>>()
const pendingGestureByAudio = new WeakMap<AudioBuffer, GestureFrame[]>()

// Playback + lip sync (VRM uses currentAudioSource)
const characterSpeechPlaybackQueue = usePipelineCharacterSpeechPlaybackQueueStore()
const { connectAudioContext, connectAudioAnalyser, clearAll, onPlaybackStarted, onPlaybackFinished } = characterSpeechPlaybackQueue
const { currentAudioSource, playbackQueue } = storeToRefs(characterSpeechPlaybackQueue)

// Audio context / analyser
const { audioContext } = useAudioContext()
connectAudioContext(audioContext)
const audioAnalyser = ref<AnalyserNode>()
function setupAnalyser() {
  if (!audioAnalyser.value) {
    audioAnalyser.value = audioContext.createAnalyser()
    connectAudioAnalyser(audioAnalyser.value)
  }
}

// Settings + force VRM model
const settingsStore = useSettings()
const { stageModelRenderer, stageModelSelected, stageModelSelectedUrl, stageViewControlsEnabled } = storeToRefs(settingsStore)
onMounted(async () => {
  // Preserve existing VRM selection if available; otherwise fall back to preset VRM
  const needsFallback = !stageModelSelectedUrl.value || stageModelRenderer.value !== 'vrm'
  if (needsFallback)
    stageModelSelected.value = 'preset-vrm-1'

  await settingsStore.updateStageModel()
  setupAnalyser()
  refreshExpressions()
})

// Speech
const providersStore = useProvidersStore()
const speechStore = useSpeechStore()
const { activeSpeechProvider, activeSpeechVoice, activeSpeechModel, ssmlEnabled, pitch } = storeToRefs(speechStore)
const consciousnessStore = useConsciousnessStore()
const { activeProvider: activeChatProvider, activeModel: activeChatModel } = storeToRefs(consciousnessStore)

// Text segmentation
const textSegmentationStore = usePipelineWorkflowTextSegmentationStore()
const { onTextSegmented, clearHooks: clearTextSegmentationHooks } = textSegmentationStore
const { textSegmentationQueue } = storeToRefs(textSegmentationStore)
clearTextSegmentationHooks()

// Emotion/delay queues (special tokens)
const delaysQueue = useDelayMessageQueue()
const emotionsQueue = createQueue<Emotion>({
  handlers: [
    async (ctx) => {
      const expression = EMOTION_VRMExpressionName_value[ctx.data]
      console.log('[playground] emotion dequeue:', { emotion: ctx.data, expression })
      if (!expression)
        return
      await sceneRef.value?.setExpression(expression)
    },
  ],
})
const emotionMessageContentQueue = useEmotionsMessageQueue(emotionsQueue)
emotionMessageContentQueue.onHandlerEvent('emotion', (emotion) => {
  log(`emotion detected: ${emotion}`)
})

function playSpecialToken(special: string) {
  console.log('[playground] playSpecialToken:', special)
  delaysQueue.enqueue(special)
  emotionMessageContentQueue.enqueue(special)
}

// State
const { mouthOpenSize } = storeToRefs(useSpeakingStore())
const nowSpeaking = ref(false)
const logLines = ref<string[]>([])
const chatInput = ref('')
const exampleAudioBuffer = ref<AudioBuffer | null>(null)
const exampleAudioStatus = ref<string>('')
const exampleAudioText = ref<string>('')
const exampleAudioLoading = ref(false)
const chatStore = useChatStore()
const chatMessages = computed(() => {
  return chatStore.messages
    .filter(msg => msg.role !== 'system')
    .map((msg) => {
      const text = typeof msg.content === 'string'
        ? msg.content
        : Array.isArray(msg.content)
          ? msg.content.map((part: any) => typeof part === 'string' ? part : part.text ?? '').join('')
          : JSON.stringify(msg.content ?? '')
      return { role: msg.role as 'user' | 'assistant', text }
    })
})

function log(line: string) {
  logLines.value = [line, ...logLines.value].slice(0, 50)
}

async function handleExampleAudioFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file)
    return
  exampleAudioStatus.value = `加载中：${file.name}`
  try {
    const arrayBuffer = await file.arrayBuffer()
    const buffer = await audioContext.decodeAudioData(arrayBuffer)
    exampleAudioBuffer.value = buffer
    exampleAudioStatus.value = `已加载：${file.name}（${buffer.duration.toFixed(2)}s）`
  }
  catch (error) {
    console.error('[playground] example audio decode failed', error)
    exampleAudioBuffer.value = null
    exampleAudioStatus.value = '加载失败：请确认音频格式（wav/mp3）'
  }
}

async function playExampleAudio() {
  if (!exampleAudioBuffer.value) {
    exampleAudioStatus.value = '请先选择音频文件'
    return
  }
  exampleAudioLoading.value = true
  const text = exampleAudioText.value.trim()
  const frames = await requestGestureFromServer(text, exampleAudioBuffer.value)
  if (frames?.length) {
    pendingGestureByAudio.set(exampleAudioBuffer.value, frames)
    log(`[playground] example audio gestures: ${frames.length} frames`)
  }
  else {
    log('[playground] example audio gestures: empty')
  }
  playbackQueue.value.enqueue({ audioBuffer: exampleAudioBuffer.value, text: text || 'example-audio' })
  exampleAudioLoading.value = false
}

async function audioBufferToMono(buffer: AudioBuffer) {
  const { length, numberOfChannels, sampleRate } = buffer
  const mono = new Float32Array(length)
  const tmp = new Float32Array(length)
  for (let ch = 0; ch < numberOfChannels; ch++) {
    buffer.copyFromChannel(tmp, ch)
    for (let i = 0; i < length; i++)
      mono[i] += tmp[i]
  }
  for (let i = 0; i < length; i++)
    mono[i] /= numberOfChannels
  return { data: mono, sampleRate }
}

async function resampleToWav(buffer: AudioBuffer, targetSampleRate = 16000): Promise<Blob> {
  const mono = await audioBufferToMono(buffer)
  if (mono.sampleRate === targetSampleRate) {
    return float32ToWav(mono.data, targetSampleRate)
  }

  const duration = mono.data.length / mono.sampleRate
  const length = Math.ceil(duration * targetSampleRate)
  const offline = new OfflineAudioContext(1, length, targetSampleRate)
  const audioBuf = offline.createBuffer(1, mono.data.length, mono.sampleRate)
  audioBuf.copyToChannel(mono.data, 0)
  const src = offline.createBufferSource()
  src.buffer = audioBuf
  src.connect(offline.destination)
  src.start()
  const rendered = await offline.startRendering()
  const renderedData = rendered.getChannelData(0)
  return float32ToWav(renderedData, targetSampleRate)
}

function float32ToWav(samples: Float32Array, sampleRate: number) {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++)
      view.setUint8(offset + i, str.charCodeAt(i))
  }

  writeString(0, 'RIFF')
  view.setUint32(4, 36 + samples.length * 2, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true) // PCM chunk size
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true) // byte rate
  view.setUint16(32, 2, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  writeString(36, 'data')
  view.setUint32(40, samples.length * 2, true)

  let offset = 44
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

async function requestGestureFromServer(text: string, audioBuffer?: AudioBuffer): Promise<GestureFrame[] | null> {
  try {
    if (!audioBuffer) {
      console.warn('[playground] no AudioBuffer available for gesture generation')
      return null
    }
    const wavBlob = await resampleToWav(audioBuffer, 16000)
    const fd = new FormData()
    fd.append('audio', wavBlob, 'chunk.wav')
    fd.append('chunkId', crypto.randomUUID())
    fd.append('model', 'camn')
    fd.append('fps', '30')
    fd.append('startOffsetMs', '0')
    fd.append('text', text)

    const resp = await fetch('http://127.0.0.1:7777/gesture/generate_chunk', {
      method: 'POST',
      body: fd,
    })
    if (!resp.ok) {
      console.warn('[playground] gesture server responded non-200', resp.status)
      return null
    }
    const data = await resp.json()
    if (!data?.frames?.length) {
      console.warn('[playground] gesture server returned empty frames')
      return null
    }
    return data.frames as GestureFrame[]
  }
  catch (err) {
    console.error('[playground] gesture server error', err)
    return null
  }
}

// Expression debug panel (manual trigger)
const availableExpressions = ref<string[]>([])
const selectedExpression = ref<string>('')
const expressionWeight = ref<number>(1)
const expressionHoldMs = ref<number>(1500)

async function refreshExpressions() {
  await nextTick()
  const list = sceneRef.value?.listExpressions?.() ?? []
  availableExpressions.value = list.slice().sort((a, b) => a.localeCompare(b))
  if (!selectedExpression.value && availableExpressions.value.length > 0)
    selectedExpression.value = availableExpressions.value[0]
}

function triggerExpression() {
  const name = selectedExpression.value
  if (!name)
    return
  sceneRef.value?.setExpressionValue?.(name, expressionWeight.value, expressionHoldMs.value)
}

function clearExpression() {
  const name = selectedExpression.value
  if (!name)
    return
  sceneRef.value?.setExpressionValue?.(name, 0)
}

const gestureTuningReady = computed(() => {
  return typeof sceneRef.value?.setGestureRotationScale === 'function'
})

watch(sceneRef, () => {
  refreshExpressions()
})
function quatFromEulerDeg(x: number, y: number, z: number): [number, number, number, number] {
  const q = new Quaternion().setFromEuler(new Euler(
    MathUtils.degToRad(x),
    MathUtils.degToRad(y),
    MathUtils.degToRad(z),
    'XYZ',
  ))
  return [q.x, q.y, q.z, q.w]
}

const vrmUpperBodyBones: VrmUpperBodyBone[] = [
  'hips',
  'spine',
  'chest',
  'upperChest',
  'neck',
  'head',
  'leftShoulder',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
  'rightShoulder',
  'rightUpperArm',
  'rightLowerArm',
  'rightHand',
]

const defaultGestureBoneWeights: Record<VrmUpperBodyBone, number> = {
  hips: 0.4,
  spine: 0.5,
  chest: 0.7,
  upperChest: 0.7,
  neck: 0.35,
  head: 0.25,
  leftShoulder: 0.6,
  rightShoulder: 0.6,
  leftUpperArm: 0.8,
  rightUpperArm: 0.8,
  leftLowerArm: 0.6,
  rightLowerArm: 0.6,
  leftHand: 0.5,
  rightHand: 0.5,
}

const gestureRotationScale = ref(0.6)
const gestureAxisGlobal = reactive({ x: 0, y: 0, z: 0 })
const gestureAxisNeck = reactive({ x: 0, y: 0, z: 0 })
const gestureAxisHead = reactive({ x: 0, y: 0, z: 0 })
const gestureBoneWeights = reactive<Record<VrmUpperBodyBone, number>>({ ...defaultGestureBoneWeights })

function applyGestureTuning() {
  const scene = sceneRef.value
  if (!scene)
    return
  try {
    scene.setGestureRotationScale?.(gestureRotationScale.value)
    scene.setGestureBoneWeights?.(gestureBoneWeights)
    scene.setGestureAxisCorrection?.({
      global: quatFromEulerDeg(gestureAxisGlobal.x, gestureAxisGlobal.y, gestureAxisGlobal.z),
      perBone: {
        neck: quatFromEulerDeg(gestureAxisNeck.x, gestureAxisNeck.y, gestureAxisNeck.z),
        head: quatFromEulerDeg(gestureAxisHead.x, gestureAxisHead.y, gestureAxisHead.z),
      },
    })
  }
  catch (err) {
    console.warn('[playground] gesture tuning failed', err)
  }
}

function resetGestureTuning() {
  gestureRotationScale.value = 0.6
  gestureAxisGlobal.x = 0
  gestureAxisGlobal.y = 0
  gestureAxisGlobal.z = 0
  gestureAxisNeck.x = 0
  gestureAxisNeck.y = 0
  gestureAxisNeck.z = 0
  gestureAxisHead.x = 0
  gestureAxisHead.y = 0
  gestureAxisHead.z = 0
  for (const bone of vrmUpperBodyBones)
    gestureBoneWeights[bone] = defaultGestureBoneWeights[bone]
}

watch(gestureTuningReady, (ready) => {
  if (ready)
    applyGestureTuning()
})

watch([gestureRotationScale, gestureAxisGlobal, gestureAxisNeck, gestureAxisHead, gestureBoneWeights], () => {
  if (gestureTuningReady.value)
    applyGestureTuning()
}, { deep: true })

function buildSpeakingGestureFrames(text: string): GestureFrame[] {
  const durationMs = MathUtils.clamp(400 + text.length * 45, 700, 1600)
  const stepMs = 100
  const frames: GestureFrame[] = []

  for (let t = 0; t <= durationMs; t += stepMs) {
    const p = t / durationMs
    const nod = Math.sin(p * Math.PI * 2) * 6 // degrees
    const sway = Math.sin(p * Math.PI * 1.5) * 3 // degrees
    const emphasis = Math.sin(p * Math.PI) ** 2

    frames.push({
      t,
      weight: 0.7,
      bones: {
        chest: { rot: quatFromEulerDeg(-nod * 0.35, sway, 0) },
        head: { rot: quatFromEulerDeg(nod, -sway * 0.6, 0) },
        leftUpperArm: { rot: quatFromEulerDeg(0, 0, -emphasis * 10) },
        rightUpperArm: { rot: quatFromEulerDeg(0, 0, emphasis * 10) },
      },
    })
  }

  return frames
}

// TTS generation handler
async function handleSpeechGeneration(ctx: { data: TTSChunkItem }) {
  try {
    if (!activeSpeechProvider.value || !activeSpeechVoice.value) {
      console.warn('No active speech provider configured')
      return
    }
    const provider = await providersStore.getProviderInstance(activeSpeechProvider.value) as SpeechProviderWithExtraOptions<string, any>
    if (!provider) {
      console.error('Failed to initialize speech provider')
      return
    }
    if (ctx.data.chunk === '' && !ctx.data.special)
      return
    if (ctx.data.chunk === '' && ctx.data.special) {
      playSpecialToken(ctx.data.special)
      return
    }
    const providerConfig = providersStore.getProviderConfig(activeSpeechProvider.value)
    const input = ssmlEnabled.value
      ? speechStore.generateSSML(ctx.data.chunk, activeSpeechVoice.value, { ...providerConfig, pitch: pitch.value })
      : ctx.data.chunk

    const res = await generateSpeech({
      ...provider.speech(activeSpeechModel.value, providerConfig),
      input,
      voice: activeSpeechVoice.value.id,
    })

    const audioBuffer = await audioContext.decodeAudioData(res)
    if (stageModelRenderer.value === 'vrm' && audioBuffer) {
      const serverFrames = await requestGestureFromServer(ctx.data.chunk, audioBuffer)
      const frames = serverFrames ?? buildSpeakingGestureFrames(ctx.data.chunk)
      pendingGestureByAudio.set(audioBuffer, frames)
    }
    log(`    - 排队：${ctx.data.chunk}${ctx.data.special ? ` [special: ${ctx.data.special}]` : ''}`)
    playbackQueue.value.enqueue({ audioBuffer, text: ctx.data.chunk, special: ctx.data.special })
  }
  catch (error) {
    console.error('Speech generation failed:', error)
  }
}

const ttsQueue = createQueue<TTSChunkItem>({
  handlers: [
    handleSpeechGeneration,
  ],
})

// text segmentation hooks
onTextSegmented((chunkItem) => {
  ttsQueue.enqueue(chunkItem)
})

async function sendChat() {
  const content = chatInput.value.trim()
  if (!content)
    return

  const provider = await providersStore.getProviderInstance(activeChatProvider.value)
  if (!provider || !activeChatModel.value) {
    log('未配置聊天模型或 provider')
    return
  }

  try {
    await chatStore.send(content, {
      model: activeChatModel.value,
      chatProvider: provider as ChatProvider,
    })
    chatInput.value = ''
  }
  catch (err) {
    console.error(err)
    log('发送到 LLM 失败')
  }
}

function resetChat() {
  chatStore.cleanupMessages()
  chatInput.value = ''
  logLines.value = []
  clearAll()
}

// Chat hooks (reuse Stage pipeline but Live2D removed)
const { onBeforeMessageComposed, onBeforeSend, onTokenLiteral, onTokenSpecial, onStreamEnd } = chatStore
const chatHookCleanups: Array<() => void> = []

chatHookCleanups.push(onBeforeMessageComposed(async () => {
  clearAll()
  setupAnalyser()
  logLines.value = []
}))

chatHookCleanups.push(onBeforeSend(async () => {
  void EmotionThinkMotionName
}))

chatHookCleanups.push(onTokenLiteral(async (literal) => {
  textSegmentationQueue.value.enqueue({ type: 'literal', value: literal })
}))

chatHookCleanups.push(onTokenSpecial(async (special) => {
  textSegmentationQueue.value.enqueue({ type: 'special', value: special })
}))

chatHookCleanups.push(onStreamEnd(async () => {
  delaysQueue.enqueue(llmInferenceEndToken)
}))

// Wire playback to VRM + logs
onPlaybackFinished(({ special }) => {
  nowSpeaking.value = false
  mouthOpenSize.value = 0
  sceneRef.value?.clearGestureStream?.()
  log(`播放结束${special ? `，special: ${special}` : ''}`)
  if (special)
    playSpecialToken(special)
})

onPlaybackStarted(({ text, audioBuffer }) => {
  nowSpeaking.value = true
  const frames = pendingGestureByAudio.get(audioBuffer)
  if (frames?.length) {
    const startAtMs = sceneRef.value?.getPerformanceTimeMs?.() ?? 0
    sceneRef.value?.enqueueGestureFrames(frames, { startAtMs })
    pendingGestureByAudio.delete(audioBuffer)
  }
  log(`播放开始：${text}`)
})

onUnmounted(() => {
  chatHookCleanups.forEach(dispose => dispose?.())
  clearAll()
})
</script>

<template>
  <div p-4 space-y-4>
    <div text-lg font-600>
      Performance Layer Playground（复刻 Stage，去掉 Live2D）
    </div>
    <div grid gap-4 lg:grid-cols-2>
      <div border="1 solid neutral-300/40 dark:neutral-700/40" h="[80vh]" min-h-80 overflow-hidden rounded-2xl>
        <ThreeScene
          v-if="stageModelRenderer === 'vrm'"
          ref="sceneRef"
          :model-src="stageModelSelectedUrl"
          :idle-animation="animations.idleLoop.toString()"
          :current-audio-source="currentAudioSource"
          :show-axes="stageViewControlsEnabled"
          :paused="false"
          @error="console.error"
        />
        <div v-else p-4 text-sm text-red-500>
          请选择 VRM 模型（当前模型类型不支持）。
        </div>
      </div>

      <div
        :class="[
          'border',
          'border-neutral-300/50',
          'rounded-xl',
          'p-3',
          'text-xs',
          'leading-relaxed',
          'space-y-3',
          'dark:border-neutral-700/60',
        ]"
      >
        <div font-600>
          聊天 / 播放
        </div>
        <details
          v-if="gestureTuningReady"
          :class="[
            'border',
            'border-neutral-200/60',
            'rounded-lg',
            'overflow-hidden',
            'dark:border-neutral-700/60',
          ]"
          open
        >
          <summary
            :class="[
              'cursor-pointer',
              'px-2',
              'py-1.5',
              'font-600',
              'bg-neutral-100/50',
              'dark:bg-neutral-900/40',
            ]"
          >
            Expression Debug
          </summary>
          <div :class="['p-2', 'space-y-2']">
            <div :class="['flex', 'items-center', 'justify-between']">
              <div :class="['text-[11px]', 'text-neutral-500']">
                已发现 {{ availableExpressions.length }} 个 expression
              </div>
              <button
                :class="[
                  'border',
                  'border-neutral-300/60',
                  'rounded-lg',
                  'px-2',
                  'py-1',
                  'text-[11px]',
                  'dark:border-neutral-700/60',
                ]"
                @click="refreshExpressions"
              >
                刷新
              </button>
            </div>

            <select
              v-model="selectedExpression"
              :class="[
                'w-full',
                'border',
                'border-neutral-300/60',
                'rounded-lg',
                'bg-white',
                'px-2',
                'py-1.5',
                'text-xs',
                'dark:bg-neutral-900/60',
              ]"
            >
              <option v-for="name in availableExpressions" :key="name" :value="name">
                {{ name }}
              </option>
            </select>

            <div :class="['grid', 'grid-cols-2', 'gap-2']">
              <label :class="['flex', 'flex-col', 'gap-1']">
                <span :class="['text-[11px]', 'text-neutral-500']">Weight</span>
                <input
                  v-model.number="expressionWeight"
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  :class="[
                    'w-full',
                    'border',
                    'border-neutral-300/60',
                    'rounded-lg',
                    'bg-white',
                    'px-2',
                    'py-1.5',
                    'text-xs',
                    'dark:bg-neutral-900/60',
                  ]"
                >
              </label>
              <label :class="['flex', 'flex-col', 'gap-1']">
                <span :class="['text-[11px]', 'text-neutral-500']">Hold (ms)</span>
                <input
                  v-model.number="expressionHoldMs"
                  type="number"
                  min="0"
                  step="100"
                  :class="[
                    'w-full',
                    'border',
                    'border-neutral-300/60',
                    'rounded-lg',
                    'bg-white',
                    'px-2',
                    'py-1.5',
                    'text-xs',
                    'dark:bg-neutral-900/60',
                  ]"
                >
              </label>
            </div>

            <div :class="['flex', 'items-center', 'gap-2']">
              <button
                :class="[
                  'rounded-lg',
                  'bg-primary-500',
                  'px-3',
                  'py-1.5',
                  'text-white',
                  'disabled:bg-neutral-400',
                ]"
                :disabled="!selectedExpression"
                @click="triggerExpression"
              >
                触发
              </button>
              <button
                :class="[
                  'border',
                  'border-neutral-300/60',
                  'rounded-lg',
                  'px-3',
                  'py-1.5',
                  'text-xs',
                  'dark:border-neutral-700/60',
                ]"
                :disabled="!selectedExpression"
                @click="clearExpression"
              >
                清空
              </button>
            </div>
          </div>
        </details>

        <details
          :class="[
            'border',
            'border-neutral-200/60',
            'rounded-lg',
            'overflow-hidden',
            'dark:border-neutral-700/60',
          ]"
          open
        >
          <summary
            :class="[
              'cursor-pointer',
              'px-2',
              'py-1.5',
              'font-600',
              'bg-neutral-100/50',
              'dark:bg-neutral-900/40',
            ]"
          >
            Gesture Tuning
          </summary>
          <div :class="['p-2', 'space-y-2']">
            <div :class="['flex', 'items-center', 'justify-between']">
              <div :class="['text-[11px]', 'text-neutral-500']">
                调整 VRM 动作权重
              </div>
              <button
                :class="[
                  'border',
                  'border-neutral-300/60',
                  'rounded-lg',
                  'px-2',
                  'py-1',
                  'text-[11px]',
                  'dark:border-neutral-700/60',
                ]"
                @click="resetGestureTuning"
              >
                重置
              </button>
            </div>

            <label :class="['flex', 'flex-col', 'gap-1']">
              <span :class="['text-[11px]', 'text-neutral-500']">Rotation Scale (0-1)</span>
              <input
                v-model.number="gestureRotationScale"
                type="number"
                min="0"
                max="1"
                step="0.05"
                :class="[
                  'w-full',
                  'border',
                  'border-neutral-300/60',
                  'rounded-lg',
                  'bg-white',
                  'px-2',
                  'py-1.5',
                  'text-xs',
                  'dark:bg-neutral-900/60',
                ]"
              >
            </label>

            <div :class="['text-[11px]', 'text-neutral-500']">
              Axis Correction (deg)
            </div>
            <div :class="['grid', 'grid-cols-3', 'gap-2']">
              <label :class="['flex', 'flex-col', 'gap-1']">
                <span :class="['text-[11px]', 'text-neutral-500']">Global X</span>
                <input
                  v-model.number="gestureAxisGlobal.x"
                  type="number"
                  step="1"
                  :class="[
                    'w-full',
                    'border',
                    'border-neutral-300/60',
                    'rounded-lg',
                    'bg-white',
                    'px-2',
                    'py-1.5',
                    'text-xs',
                    'dark:bg-neutral-900/60',
                  ]"
                >
              </label>
              <label :class="['flex', 'flex-col', 'gap-1']">
                <span :class="['text-[11px]', 'text-neutral-500']">Global Y</span>
                <input
                  v-model.number="gestureAxisGlobal.y"
                  type="number"
                  step="1"
                  :class="[
                    'w-full',
                    'border',
                    'border-neutral-300/60',
                    'rounded-lg',
                    'bg-white',
                    'px-2',
                    'py-1.5',
                    'text-xs',
                    'dark:bg-neutral-900/60',
                  ]"
                >
              </label>
              <label :class="['flex', 'flex-col', 'gap-1']">
                <span :class="['text-[11px]', 'text-neutral-500']">Global Z</span>
                <input
                  v-model.number="gestureAxisGlobal.z"
                  type="number"
                  step="1"
                  :class="[
                    'w-full',
                    'border',
                    'border-neutral-300/60',
                    'rounded-lg',
                    'bg-white',
                    'px-2',
                    'py-1.5',
                    'text-xs',
                    'dark:bg-neutral-900/60',
                  ]"
                >
              </label>
            </div>

            <div :class="['grid', 'grid-cols-3', 'gap-2']">
              <label :class="['flex', 'flex-col', 'gap-1']">
                <span :class="['text-[11px]', 'text-neutral-500']">Neck X</span>
                <input
                  v-model.number="gestureAxisNeck.x"
                  type="number"
                  step="1"
                  :class="[
                    'w-full',
                    'border',
                    'border-neutral-300/60',
                    'rounded-lg',
                    'bg-white',
                    'px-2',
                    'py-1.5',
                    'text-xs',
                    'dark:bg-neutral-900/60',
                  ]"
                >
              </label>
              <label :class="['flex', 'flex-col', 'gap-1']">
                <span :class="['text-[11px]', 'text-neutral-500']">Neck Y</span>
                <input
                  v-model.number="gestureAxisNeck.y"
                  type="number"
                  step="1"
                  :class="[
                    'w-full',
                    'border',
                    'border-neutral-300/60',
                    'rounded-lg',
                    'bg-white',
                    'px-2',
                    'py-1.5',
                    'text-xs',
                    'dark:bg-neutral-900/60',
                  ]"
                >
              </label>
              <label :class="['flex', 'flex-col', 'gap-1']">
                <span :class="['text-[11px]', 'text-neutral-500']">Neck Z</span>
                <input
                  v-model.number="gestureAxisNeck.z"
                  type="number"
                  step="1"
                  :class="[
                    'w-full',
                    'border',
                    'border-neutral-300/60',
                    'rounded-lg',
                    'bg-white',
                    'px-2',
                    'py-1.5',
                    'text-xs',
                    'dark:bg-neutral-900/60',
                  ]"
                >
              </label>
            </div>

            <div :class="['grid', 'grid-cols-3', 'gap-2']">
              <label :class="['flex', 'flex-col', 'gap-1']">
                <span :class="['text-[11px]', 'text-neutral-500']">Head X</span>
                <input
                  v-model.number="gestureAxisHead.x"
                  type="number"
                  step="1"
                  :class="[
                    'w-full',
                    'border',
                    'border-neutral-300/60',
                    'rounded-lg',
                    'bg-white',
                    'px-2',
                    'py-1.5',
                    'text-xs',
                    'dark:bg-neutral-900/60',
                  ]"
                >
              </label>
              <label :class="['flex', 'flex-col', 'gap-1']">
                <span :class="['text-[11px]', 'text-neutral-500']">Head Y</span>
                <input
                  v-model.number="gestureAxisHead.y"
                  type="number"
                  step="1"
                  :class="[
                    'w-full',
                    'border',
                    'border-neutral-300/60',
                    'rounded-lg',
                    'bg-white',
                    'px-2',
                    'py-1.5',
                    'text-xs',
                    'dark:bg-neutral-900/60',
                  ]"
                >
              </label>
              <label :class="['flex', 'flex-col', 'gap-1']">
                <span :class="['text-[11px]', 'text-neutral-500']">Head Z</span>
                <input
                  v-model.number="gestureAxisHead.z"
                  type="number"
                  step="1"
                  :class="[
                    'w-full',
                    'border',
                    'border-neutral-300/60',
                    'rounded-lg',
                    'bg-white',
                    'px-2',
                    'py-1.5',
                    'text-xs',
                    'dark:bg-neutral-900/60',
                  ]"
                >
              </label>
            </div>

            <div :class="['text-[11px]', 'text-neutral-500']">
              Bone Weights
            </div>
            <div :class="['grid', 'grid-cols-2', 'gap-2']">
              <label
                v-for="bone in vrmUpperBodyBones"
                :key="bone"
                :class="['flex', 'flex-col', 'gap-1']"
              >
                <span :class="['text-[11px]', 'text-neutral-500']">{{ bone }}</span>
                <input
                  v-model.number="gestureBoneWeights[bone]"
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  :class="[
                    'w-full',
                    'border',
                    'border-neutral-300/60',
                    'rounded-lg',
                    'bg-white',
                    'px-2',
                    'py-1.5',
                    'text-xs',
                    'dark:bg-neutral-900/60',
                  ]"
                >
              </label>
            </div>
          </div>
        </details>

        <details
          :class="[
            'border',
            'border-neutral-200/60',
            'rounded-lg',
            'overflow-hidden',
            'dark:border-neutral-700/60',
          ]"
          open
        >
          <summary
            :class="[
              'cursor-pointer',
              'px-2',
              'py-1.5',
              'font-600',
              'bg-neutral-100/50',
              'dark:bg-neutral-900/40',
            ]"
          >
            Example 音频测试
          </summary>
          <div :class="['p-2', 'space-y-2']">
            <div :class="['text-[11px]', 'text-neutral-500']">
              选择 Panto 示例音频（如：Panto/examples/audio/2_scott_0_103_103_28s.wav）
            </div>
            <input
              type="file"
              accept="audio/*"
              :class="[
                'w-full',
                'border',
                'border-neutral-300/60',
                'rounded-lg',
                'bg-white',
                'px-2',
                'py-1.5',
                'text-xs',
                'dark:bg-neutral-900/60',
              ]"
              @change="handleExampleAudioFile"
            >
            <input
              v-model="exampleAudioText"
              :class="[
                'w-full',
                'border',
                'border-neutral-300/60',
                'rounded-lg',
                'bg-white',
                'px-2',
                'py-1.5',
                'text-xs',
                'dark:bg-neutral-900/60',
              ]"
              placeholder="可选：附带 text（空则只用音频）"
            >
            <div :class="['flex', 'items-center', 'gap-2']">
              <button
                :class="[
                  'rounded-lg',
                  'bg-primary-500',
                  'px-3',
                  'py-1.5',
                  'text-white',
                  'disabled:bg-neutral-400',
                ]"
                :disabled="exampleAudioLoading || !exampleAudioBuffer"
                @click="playExampleAudio"
              >
                {{ exampleAudioLoading ? '生成中...' : '生成动作并播放' }}
              </button>
              <div :class="['text-[11px]', 'text-neutral-500']">
                {{ exampleAudioStatus }}
              </div>
            </div>
          </div>
        </details>

        <details
          :class="[
            'border',
            'border-neutral-200/60',
            'rounded-lg',
            'overflow-hidden',
            'dark:border-neutral-700/60',
          ]"
          open
        >
          <summary
            :class="[
              'cursor-pointer',
              'px-2',
              'py-1.5',
              'font-600',
              'bg-neutral-100/50',
              'dark:bg-neutral-900/40',
            ]"
          >
            聊天
          </summary>
          <div :class="['p-2', 'space-y-2']">
            <div :class="['h-60', 'overflow-auto', 'border', 'border-neutral-200/60', 'rounded-lg', 'p-2', 'dark:border-neutral-700/60']">
              <div v-for="(msg, idx) in chatMessages" :key="idx" :class="['mb-2']">
                <div :class="['text-[11px]', 'text-neutral-500']">
                  {{ msg.role === 'user' ? 'User' : 'AIRI' }}
                </div>
                <div :class="['whitespace-pre-wrap', 'break-words', 'text-sm']">
                  {{ msg.text }}
                </div>
              </div>
              <div v-if="!chatMessages.length" :class="['text-sm', 'text-neutral-500']">
                输入消息进行对话。
              </div>
            </div>
            <div :class="['flex', 'items-center', 'gap-2']">
              <input
                v-model="chatInput"
                :class="[
                  'flex-1',
                  'border',
                  'border-neutral-300/60',
                  'rounded-lg',
                  'bg-white',
                  'px-3',
                  'py-2',
                  'text-sm',
                  'dark:bg-neutral-900/60',
                ]"
                placeholder="输入消息，点击发送"
                @keyup.enter="sendChat"
              >
              <button
                :class="[
                  'rounded-lg',
                  'bg-primary-500',
                  'px-3',
                  'py-2',
                  'text-white',
                  'disabled:bg-neutral-400',
                ]"
                :disabled="!chatInput.trim()"
                @click="sendChat"
              >
                发送
              </button>
              <button
                :class="[
                  'border',
                  'border-neutral-300/60',
                  'rounded-lg',
                  'px-3',
                  'py-2',
                  'text-sm',
                ]"
                @click="resetChat"
              >
                重置对话
              </button>
            </div>
          </div>
        </details>

        <details
          :class="[
            'border',
            'border-neutral-200/60',
            'rounded-lg',
            'overflow-hidden',
            'dark:border-neutral-700/60',
          ]"
          open
        >
          <summary
            :class="[
              'cursor-pointer',
              'px-2',
              'py-1.5',
              'font-600',
              'bg-neutral-100/50',
              'dark:bg-neutral-900/40',
            ]"
          >
            播放队列 / 日志
          </summary>
          <div :class="['p-2']">
            <ul :class="['max-h-60', 'overflow-auto', 'space-y-1']">
              <li v-for="line in logLines" :key="line">
                {{ line }}
              </li>
            </ul>
          </div>
        </details>
      </div>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
</route>

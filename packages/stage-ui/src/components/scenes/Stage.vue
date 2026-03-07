<script setup lang="ts">
import type { DuckDBWasmDrizzleDatabase } from '@proj-airi/drizzle-duckdb-wasm'
import type { Live2DLipSync, Live2DLipSyncOptions } from '@proj-airi/model-driver-lipsync'
import type { Profile } from '@proj-airi/model-driver-lipsync/shared/wlipsync'
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'
import type { UnElevenLabsOptions } from 'unspeech'

import type { EmotionPayload } from '../../constants/emotions'

import { drizzle } from '@proj-airi/drizzle-duckdb-wasm'
import { getImportUrlBundles } from '@proj-airi/drizzle-duckdb-wasm/bundles/import-url-browser'
import { createLive2DLipSync } from '@proj-airi/model-driver-lipsync'
import { wlipsyncProfile } from '@proj-airi/model-driver-lipsync/shared/wlipsync'
import { createPlaybackManager, createSpeechPipeline } from '@proj-airi/pipelines-audio'
import { defaultModelParameters, Live2DScene, useLive2d } from '@proj-airi/stage-ui-live2d'
import { ThreeScene, useModelStore } from '@proj-airi/stage-ui-three'
import { animations } from '@proj-airi/stage-ui-three/assets/vrm'
import { createQueue } from '@proj-airi/stream-kit'
import { useBroadcastChannel } from '@vueuse/core'
// import { createTransformers } from '@xsai-transformers/embed'
// import embedWorkerURL from '@xsai-transformers/embed/worker?worker&url'
// import { embed } from '@xsai/embed'
import { generateSpeech } from '@xsai/generate-speech'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref } from 'vue'

import { useDelayMessageQueue, useEmotionsMessageQueue } from '../../composables/queues'
import { llmInferenceEndToken } from '../../constants'
import { EMOTION_EmotionMotionName_value, EMOTION_VRMExpressionName_value, Emotion } from '../../constants/emotions'
import { useAudioContext, useSpeakingStore } from '../../stores/audio'
import { useChatOrchestratorStore } from '../../stores/chat'
import { useAiriCardStore } from '../../stores/modules'
import { useSpeechStore } from '../../stores/modules/speech'
import { useProvidersStore } from '../../stores/providers'
import { useSettings } from '../../stores/settings'
import { useSpeechRuntimeStore } from '../../stores/speech-runtime'

withDefaults(defineProps<{
  paused?: boolean
  focusAt: { x: number, y: number }
  xOffset?: number | string
  yOffset?: number | string
  scale?: number
}>(), { paused: false, scale: 1 })

const componentState = defineModel<'pending' | 'loading' | 'mounted'>('state', { default: 'pending' })

const db = ref<DuckDBWasmDrizzleDatabase>()
// const transformersProvider = createTransformers({ embedWorkerURL })

const vrmViewerRef = ref<InstanceType<typeof ThreeScene>>()
const live2dSceneRef = ref<InstanceType<typeof Live2DScene>>()

const settingsStore = useSettings()
const {
  stageModelRenderer,
  stageViewControlsEnabled,
  live2dDisableFocus,
  stageModelSelectedUrl,
  stageModelSelected,
  themeColorsHue,
  themeColorsHueDynamic,
  live2dIdleAnimationEnabled,
  live2dAutoBlinkEnabled,
  live2dForceAutoBlinkEnabled,
  live2dShadowEnabled,
  live2dMaxFps,
  live2dDebugControlsEnabled,
  live2dEmotionMotionMap,
} = storeToRefs(settingsStore)
const { mouthOpenSize } = storeToRefs(useSpeakingStore())
const { audioContext } = useAudioContext()
const currentAudioSource = ref<AudioBufferSourceNode>()

const { onBeforeMessageComposed, onBeforeSend, onTokenLiteral, onTokenSpecial, onStreamEnd, onAssistantResponseEnd } = useChatOrchestratorStore()
const chatHookCleanups: Array<() => void> = []
// WORKAROUND: clear previous handlers on unmount to avoid duplicate calls when this component remounts.
//             We keep per-hook disposers instead of wiping the global chat hooks to play nicely with
//             cross-window broadcast wiring.

const providersStore = useProvidersStore()
const live2dStore = useLive2d()
const vrmStore = useModelStore()

const showStage = ref(true)
const viewUpdateCleanups: Array<() => void> = []

// Caption + Presentation broadcast channels
type CaptionChannelEvent
  = | { type: 'caption-speaker', text: string }
    | { type: 'caption-assistant', text: string }
const { post: postCaption } = useBroadcastChannel<CaptionChannelEvent, CaptionChannelEvent>({ name: 'airi-caption-overlay' })
const assistantCaption = ref('')

type PresentEvent
  = | { type: 'assistant-reset' }
    | { type: 'assistant-append', text: string }
const { post: postPresent } = useBroadcastChannel<PresentEvent, PresentEvent>({ name: 'airi-chat-present' })

viewUpdateCleanups.push(live2dStore.onShouldUpdateView(async () => {
  showStage.value = false
  await settingsStore.updateStageModel()
  setTimeout(() => {
    showStage.value = true
  }, 100)
}))

viewUpdateCleanups.push(vrmStore.onShouldUpdateView(async () => {
  showStage.value = false
  await settingsStore.updateStageModel()
  setTimeout(() => {
    showStage.value = true
  }, 100)
}))

const audioAnalyser = ref<AnalyserNode>()
const nowSpeaking = ref(false)
const lipSyncStarted = ref(false)
const lipSyncLoopId = ref<number>()
const live2dLipSync = ref<Live2DLipSync>()
const live2dLipSyncOptions: Live2DLipSyncOptions = { mouthUpdateIntervalMs: 50, mouthLerpWindowMs: 50 }
const textMouthUntil = ref(0)
const textMouthStrength = 0.7
const textMouthWaveMs = 140
const textMouthDurationMs = 6000
const assistantMotionTriggered = ref(false)
const idleHeadWaveId = ref<number>()
const headFrozen = ref(false)
const headFrozenAngles = ref<{ x: number, y: number, z: number }>({ x: 0, y: 0, z: 0 })

const { activeCard } = storeToRefs(useAiriCardStore())
const speechStore = useSpeechStore()
const { ssmlEnabled, activeSpeechProvider, activeSpeechModel, activeSpeechVoice, pitch } = storeToRefs(speechStore)
const activeCardId = computed(() => activeCard.value?.name ?? 'default')
const speechRuntimeStore = useSpeechRuntimeStore()

const { currentMotion, availableMotions, motionMap, modelParameters } = storeToRefs(useLive2d())
const emotionMotionCursor = ref<Record<string, number>>({})
const forceMotionTimer = ref<number>()
const cachedIdleAnimationEnabled = ref<boolean>()
const commandOnlyMotionMode = true
const debugEmotionButtons: EmotionPayload['name'][] = [Emotion.Happy, Emotion.Sad, Emotion.Angry, Emotion.Think, Emotion.Surprise]
const debugMotionScanTimer = ref<number>()
const debugPulseAnimationId = ref<number>()
const lastEmotionTrigger = ref<{ source: 'button' | 'act' | 'scan' | 'pulse', name?: EmotionPayload['name'], timestamp: number } | null>(null)
const lastEmotionTriggerLabel = computed(() => {
  if (!lastEmotionTrigger.value)
    return ''
  return lastEmotionTrigger.value.name
    ? `${lastEmotionTrigger.value.source}:${lastEmotionTrigger.value.name}`
    : lastEmotionTrigger.value.source
})

const EMOTION_CHOREOGRAPHY_PLAN: Record<EmotionPayload['name'], string[][]> = {
  happy: [['happy', 'smile', 'joy', 'laugh'], ['greet', 'wave', 'dance', 'special']],
  sad: [['sad', 'cry', 'tears', 'down'], ['idle', 'slow', 'low', 'breathe']],
  angry: [['angry', 'mad', 'rage', 'fury'], ['shake', 'fast', 'hit', 'tap']],
  think: [['think', 'thinking', 'ponder', 'consider'], ['idle', 'focus', 'look', 'head']],
  surprised: [['surprise', 'shocked', 'wow'], ['jump', 'quick', 'special', 'look']],
  awkward: [['awkward', 'embarrass', 'shy'], ['idle', 'small', 'look', 'aside']],
  question: [['question', '疑', '问', 'confuse'], ['tilt', 'head', 'look', 'focus']],
  curious: [['curious', 'interest', 'wonder'], ['look', 'focus', 'turn', 'head']],
  neutral: [['idle', 'neutral', 'normal'], ['base', 'stand', 'loop', 'default']],
}
const STRONG_MOTION_KEYWORDS = ['jump', 'wave', 'dance', 'special', 'fast', 'hit', 'tap', 'shake', 'spin', 'run', 'kick', 'punch', 'throw', 'attack', 'power', 'big']

function toMotionSearchText(motion: { motionName: string, fileName: string }): string {
  return `${motion.motionName} ${motion.fileName}`.toLowerCase()
}

function pickMotionByKeywords(emotionName: EmotionPayload['name']) {
  const rounds = EMOTION_CHOREOGRAPHY_PLAN[emotionName] ?? []
  for (const keywords of rounds) {
    const matched = availableMotions.value.filter((motion) => {
      const source = toMotionSearchText(motion)
      return keywords.some(keyword => source.includes(keyword.toLowerCase()))
    })
    if (matched.length > 0)
      return matched
  }
  return []
}

function pickStrongMotions() {
  const candidates = availableMotions.value.filter((motion) => {
    const source = toMotionSearchText(motion)
    return STRONG_MOTION_KEYWORDS.some(keyword => source.includes(keyword))
  })
  return candidates.length > 0 ? candidates : []
}

function pickMotionBySettings(emotionName: EmotionPayload['name']) {
  const configured = live2dEmotionMotionMap.value?.[emotionName] ?? []
  if (configured.length === 0)
    return []
  const availableByFile = new Map(availableMotions.value.map(motion => [motion.fileName, motion]))
  const fallbackList = availableMotions.value
  return configured
    .map(item => availableByFile.get(item.fileName) || fallbackList.find(motion => motion.motionName === item.motionName && motion.motionIndex === item.motionIndex))
    .filter((motion): motion is { motionName: string, motionIndex: number, fileName: string } => motion != null)
}

function resolveLive2DMotion(emotionName: EmotionPayload['name']) {
  const configuredCandidates = pickMotionBySettings(emotionName)
  const strongCandidates = pickStrongMotions()
  const plannedCandidates = pickMotionByKeywords(emotionName)
  const mappedCandidates = availableMotions.value
    .filter(motion => motionMap.value[motion.fileName] === emotionName)
  const thinkCandidates = availableMotions.value
    .filter((motion) => {
      const source = toMotionSearchText(motion)
      return source.includes('think')
    })
  const nonIdleCandidates = availableMotions.value.filter((motion) => {
    const source = toMotionSearchText(motion)
    return !source.includes('idle')
  })
  const fallbackCandidates = nonIdleCandidates.length > 0 ? nonIdleCandidates : availableMotions.value
  const motionCandidates = configuredCandidates.length > 0
    ? configuredCandidates
    : strongCandidates.length > 0
      ? strongCandidates
      : plannedCandidates.length > 0
        ? plannedCandidates
        : mappedCandidates.length > 0
          ? mappedCandidates
          : thinkCandidates.length > 0
            ? thinkCandidates
            : fallbackCandidates

  if (motionCandidates.length > 0) {
    const cursor = emotionMotionCursor.value[emotionName] ?? 0
    const selected = motionCandidates[cursor % motionCandidates.length]
    emotionMotionCursor.value[emotionName] = cursor + 1
    return { group: selected.motionName, index: selected.motionIndex }
  }

  if (!commandOnlyMotionMode) {
    return { group: EMOTION_EmotionMotionName_value[emotionName] }
  }
  return null
}

function clearForceMotionTimer() {
  if (forceMotionTimer.value) {
    clearTimeout(forceMotionTimer.value)
    forceMotionTimer.value = undefined
  }
}

function applyLive2DMotionByEmotion(emotion: EmotionPayload) {
  const nextMotion = resolveLive2DMotion(emotion.name)
  if (nextMotion) {
    currentMotion.value = nextMotion
  }
  if (emotion.force !== true)
    return

  clearForceMotionTimer()
  if (cachedIdleAnimationEnabled.value === undefined) {
    cachedIdleAnimationEnabled.value = live2dIdleAnimationEnabled.value
  }
  live2dIdleAnimationEnabled.value = false
  const holdMs = emotion.holdMs ?? 1800
  forceMotionTimer.value = window.setTimeout(() => {
    live2dIdleAnimationEnabled.value = commandOnlyMotionMode
      ? false
      : (cachedIdleAnimationEnabled.value ?? true)
    cachedIdleAnimationEnabled.value = undefined
    forceMotionTimer.value = undefined
  }, holdMs)
}

function triggerDebugEmotion(name: EmotionPayload['name']) {
  lastEmotionTrigger.value = { source: 'button', name, timestamp: Date.now() }
  emotionsQueue.enqueue({
    name,
    intensity: 1,
    force: true,
    holdMs: 3000,
  })
}

function stopDebugMotionScan() {
  if (debugMotionScanTimer.value) {
    clearInterval(debugMotionScanTimer.value)
    debugMotionScanTimer.value = undefined
  }
}

function stopDebugPulse() {
  if (debugPulseAnimationId.value) {
    cancelAnimationFrame(debugPulseAnimationId.value)
    debugPulseAnimationId.value = undefined
  }
}

function triggerDebugMotionScan() {
  if (stageModelRenderer.value !== 'live2d')
    return

  lastEmotionTrigger.value = { source: 'scan', timestamp: Date.now() }
  stopDebugMotionScan()
  const candidates = availableMotions.value
    .filter(motion => !toMotionSearchText(motion).includes('idle'))
    .slice(0, 10)
  const queue = candidates.length > 0 ? candidates : availableMotions.value.slice(0, 10)
  if (queue.length === 0)
    return

  let index = 0
  debugMotionScanTimer.value = window.setInterval(() => {
    const motion = queue[index % queue.length]
    currentMotion.value = { group: motion.motionName, index: motion.motionIndex }
    index++
    if (index >= queue.length) {
      stopDebugMotionScan()
    }
  }, 500)
}

function triggerDebugPulse() {
  if (stageModelRenderer.value !== 'live2d')
    return

  lastEmotionTrigger.value = { source: 'pulse', timestamp: Date.now() }
  stopDebugPulse()
  const base = { ...modelParameters.value }
  const start = performance.now()
  const durationMs = 2400

  const step = (timestamp: number) => {
    const elapsed = timestamp - start
    const t = Math.min(1, elapsed / durationMs)
    const wave = Math.sin(elapsed / 70)
    const mouth = (Math.sin(elapsed / 40) + 1) / 2
    modelParameters.value = {
      ...modelParameters.value,
      angleX: wave * 28,
      angleY: Math.cos(elapsed / 90) * 10,
      bodyAngleX: wave * 18,
      mouthOpen: mouth,
      cheek: Math.max(0, Math.min(1, mouth * 0.9)),
    }
    if (t < 1) {
      debugPulseAnimationId.value = requestAnimationFrame(step)
      return
    }
    modelParameters.value = {
      ...modelParameters.value,
      ...defaultModelParameters,
      ...base,
    }
    debugPulseAnimationId.value = undefined
  }

  debugPulseAnimationId.value = requestAnimationFrame(step)
}

function triggerLargeMotion(name: EmotionPayload['name'], holdMs: number) {
  lastEmotionTrigger.value = { source: 'act', name, timestamp: Date.now() }
  emotionsQueue.enqueue({
    name,
    intensity: 1,
    force: true,
    holdMs,
  })
}

function bumpTextMouth(durationMs: number) {
  const next = Date.now() + durationMs
  if (next > textMouthUntil.value) {
    textMouthUntil.value = next
  }
}

function freezeHeadAngles() {
  headFrozen.value = true
  headFrozenAngles.value = {
    x: modelParameters.value.angleX,
    y: modelParameters.value.angleY,
    z: modelParameters.value.angleZ,
  }
}

function releaseHeadAngles() {
  headFrozen.value = false
}

function startIdleHeadWave() {
  if (idleHeadWaveId.value)
    return
  const base = {
    x: modelParameters.value.angleX,
    y: modelParameters.value.angleY,
  }
  const start = performance.now()
  const step = (timestamp: number) => {
    const elapsed = timestamp - start
    if (headFrozen.value) {
      idleHeadWaveId.value = requestAnimationFrame(step)
      return
    }
    modelParameters.value = {
      ...modelParameters.value,
      angleX: base.x + Math.sin(elapsed / 420) * 6,
      angleY: base.y + Math.cos(elapsed / 520) * 4,
    }
    idleHeadWaveId.value = requestAnimationFrame(step)
  }
  idleHeadWaveId.value = requestAnimationFrame(step)
}

function stopIdleHeadWave() {
  if (!idleHeadWaveId.value)
    return
  cancelAnimationFrame(idleHeadWaveId.value)
  idleHeadWaveId.value = undefined
}

const emotionsQueue = createQueue<EmotionPayload>({
  handlers: [
    async (ctx) => {
      if (stageModelRenderer.value === 'vrm') {
        // console.debug('VRM emotion anime: ', ctx.data)
        const value = EMOTION_VRMExpressionName_value[ctx.data.name]
        if (!value)
          return

        await vrmViewerRef.value!.setExpression(value, ctx.data.intensity)
      }
      else if (stageModelRenderer.value === 'live2d') {
        applyLive2DMotionByEmotion(ctx.data)
      }
    },
  ],
})

const emotionMessageContentQueue = useEmotionsMessageQueue(emotionsQueue)
emotionMessageContentQueue.onHandlerEvent('emotion', (emotion) => {
  lastEmotionTrigger.value = { source: 'act', name: emotion.name, timestamp: Date.now() }
  // eslint-disable-next-line no-console
  console.debug('emotion detected', emotion)
})

const delaysQueue = useDelayMessageQueue()
delaysQueue.onHandlerEvent('delay', (delay) => {
  // eslint-disable-next-line no-console
  console.debug('delay detected', delay)
})

// Play special token: delay or emotion
function playSpecialToken(special: string) {
  if (special.includes('<|API')) {
    const emotion: EmotionPayload = {
      name: Emotion.Think,
      intensity: 1,
      force: true,
      holdMs: 2500,
    }
    lastEmotionTrigger.value = { source: 'act', name: emotion.name, timestamp: Date.now() }
    emotionsQueue.enqueue(emotion)
  }
  delaysQueue.enqueue(special)
  emotionMessageContentQueue.enqueue(special)
}
const lipSyncNode = ref<AudioNode>()

async function playFunction(item: Parameters<Parameters<typeof createPlaybackManager<AudioBuffer>>[0]['play']>[0], signal: AbortSignal): Promise<void> {
  if (!audioContext || !item.audio)
    return

  // Ensure audio context is resumed (browsers suspend it by default until user interaction)
  if (audioContext.state === 'suspended') {
    try {
      await audioContext.resume()
    }
    catch {
      return
    }
  }

  const source = audioContext.createBufferSource()
  currentAudioSource.value = source
  source.buffer = item.audio

  source.connect(audioContext.destination)
  if (audioAnalyser.value)
    source.connect(audioAnalyser.value)
  if (lipSyncNode.value)
    source.connect(lipSyncNode.value)

  return new Promise<void>((resolve) => {
    let settled = false
    const resolveOnce = () => {
      if (settled)
        return
      settled = true
      resolve()
    }

    const stopPlayback = () => {
      try {
        source.stop()
        source.disconnect()
      }
      catch {}
      if (currentAudioSource.value === source)
        currentAudioSource.value = undefined
      resolveOnce()
    }

    if (signal.aborted) {
      stopPlayback()
      return
    }

    signal.addEventListener('abort', stopPlayback, { once: true })
    source.onended = () => {
      signal.removeEventListener('abort', stopPlayback)
      stopPlayback()
    }

    try {
      source.start(0)
    }
    catch {
      stopPlayback()
    }
  })
}

const playbackManager = createPlaybackManager<AudioBuffer>({
  play: playFunction,
  maxVoices: 1,
  maxVoicesPerOwner: 1,
  overflowPolicy: 'queue',
  ownerOverflowPolicy: 'steal-oldest',
})

const speechPipeline = createSpeechPipeline<AudioBuffer>({
  tts: async (request, signal) => {
    if (signal.aborted)
      return null

    if (!activeSpeechProvider.value)
      return null

    const provider = await providersStore.getProviderInstance(activeSpeechProvider.value) as SpeechProviderWithExtraOptions<string, UnElevenLabsOptions>
    if (!provider) {
      console.error('Failed to initialize speech provider')
      return null
    }

    if (!request.text && !request.special)
      return null

    const providerConfig = providersStore.getProviderConfig(activeSpeechProvider.value)

    // For OpenAI Compatible providers, always use provider config for model and voice
    // since these are manually configured in provider settings
    let model = activeSpeechModel.value
    let voice = activeSpeechVoice.value

    if (activeSpeechProvider.value === 'openai-compatible-audio-speech') {
      // Always prefer provider config for OpenAI Compatible (user configured it there)
      if (providerConfig?.model) {
        model = providerConfig.model as string
      }
      else {
        // Fallback to default if not in provider config
        model = 'tts-1'
        console.warn('[Speech Pipeline] OpenAI Compatible: No model in provider config, using default', { providerConfig })
      }

      if (providerConfig?.voice) {
        voice = {
          id: providerConfig.voice as string,
          name: providerConfig.voice as string,
          description: providerConfig.voice as string,
          previewURL: '',
          languages: [{ code: 'en', title: 'English' }],
          provider: activeSpeechProvider.value,
          gender: 'neutral',
        }
      }
      else {
        // Fallback to default if not in provider config
        voice = {
          id: 'alloy',
          name: 'alloy',
          description: 'alloy',
          previewURL: '',
          languages: [{ code: 'en', title: 'English' }],
          provider: activeSpeechProvider.value,
          gender: 'neutral',
        }
        console.warn('[Speech Pipeline] OpenAI Compatible: No voice in provider config, using default', { providerConfig })
      }
    }

    if (!model || !voice)
      return null

    const input = ssmlEnabled.value
      ? speechStore.generateSSML(request.text, voice, { ...providerConfig, pitch: pitch.value })
      : request.text

    try {
      const res = await generateSpeech({
        ...provider.speech(model, providerConfig),
        input,
        voice: voice.id,
      })

      if (signal.aborted || !res || res.byteLength === 0)
        return null

      const audioBuffer = await audioContext.decodeAudioData(res)
      return audioBuffer
    }
    catch {
      return null
    }
  },
  playback: playbackManager,
})

void speechRuntimeStore.registerHost(speechPipeline)

speechPipeline.on('onSpecial', (segment) => {
  if (segment.special)
    playSpecialToken(segment.special)
})

playbackManager.onEnd(({ item }) => {
  if (item.special)
    playSpecialToken(item.special)

  nowSpeaking.value = false
  mouthOpenSize.value = 0
})

playbackManager.onStart(({ item }) => {
  nowSpeaking.value = true
  // NOTICE: postCaption and postPresent may throw errors if the BroadcastChannel is closed
  // (e.g., when navigating away from the page). We wrap these in try-catch to prevent
  // breaking playback when the channel is unavailable.
  assistantCaption.value += ` ${item.text}`
  try {
    postCaption({ type: 'caption-assistant', text: assistantCaption.value })
  }
  catch {
    // BroadcastChannel may be closed - don't break playback
  }
  try {
    postPresent({ type: 'assistant-append', text: item.text })
  }
  catch {
    // BroadcastChannel may be closed - don't break playback
  }
})

function startLipSyncLoop() {
  if (lipSyncLoopId.value)
    return

  const tick = () => {
    const audioOpen = nowSpeaking.value && live2dLipSync.value ? live2dLipSync.value.getMouthOpen() : 0
    const textActive = Date.now() < textMouthUntil.value
    const textOpen = textActive ? (0.2 + textMouthStrength * ((Math.sin(performance.now() / textMouthWaveMs) + 1) / 2)) : 0
    if (headFrozen.value) {
      modelParameters.value = {
        ...modelParameters.value,
        angleX: headFrozenAngles.value.x,
        angleY: headFrozenAngles.value.y,
        angleZ: headFrozenAngles.value.z,
      }
    }
    mouthOpenSize.value = Math.max(audioOpen, textOpen)
    lipSyncLoopId.value = requestAnimationFrame(tick)
  }

  lipSyncLoopId.value = requestAnimationFrame(tick)
}

async function setupLipSync() {
  if (lipSyncStarted.value)
    return

  try {
    const lipSync = await createLive2DLipSync(audioContext, wlipsyncProfile as Profile, live2dLipSyncOptions)
    live2dLipSync.value = lipSync
    lipSyncNode.value = lipSync.node
    await audioContext.resume()
    startLipSyncLoop()
    lipSyncStarted.value = true
  }
  catch (error) {
    lipSyncStarted.value = false
    console.error('Failed to setup Live2D lip sync', error)
  }
}

function setupAnalyser() {
  if (!audioAnalyser.value) {
    audioAnalyser.value = audioContext.createAnalyser()
  }
}

let currentChatIntent: ReturnType<typeof speechRuntimeStore.openIntent> | null = null

chatHookCleanups.push(onBeforeMessageComposed(async () => {
  playbackManager.stopAll('new-message')

  setupAnalyser()
  await setupLipSync()
  startIdleHeadWave()
  assistantMotionTriggered.value = false
  textMouthUntil.value = 0
  // Reset assistant caption for a new message
  assistantCaption.value = ''
  try {
    postCaption({ type: 'caption-assistant', text: '' })
  }
  catch (error) {
    // BroadcastChannel may be closed if user navigated away - don't break flow
    console.warn('[Stage] Failed to post caption reset (channel may be closed)', { error })
  }
  try {
    postPresent({ type: 'assistant-reset' })
  }
  catch (error) {
    // BroadcastChannel may be closed if user navigated away - don't break flow
    console.warn('[Stage] Failed to post present reset (channel may be closed)', { error })
  }

  if (currentChatIntent) {
    currentChatIntent.cancel('new-message')
    currentChatIntent = null
  }

  currentChatIntent = speechRuntimeStore.openIntent({
    ownerId: activeCardId.value,
    priority: 'normal',
    behavior: 'queue',
  })
}))

chatHookCleanups.push(onBeforeSend(async (message) => {
  playSpecialToken(message)
  triggerLargeMotion(Emotion.Surprise, 2200)
  if (!commandOnlyMotionMode) {
    currentMotion.value = { group: 'Think' }
  }
}))

chatHookCleanups.push(onTokenLiteral(async (literal) => {
  currentChatIntent?.writeLiteral(literal)
  playSpecialToken(literal)
  if (!assistantMotionTriggered.value) {
    stopIdleHeadWave()
    freezeHeadAngles()
    triggerLargeMotion(Emotion.Happy, 2400)
    assistantMotionTriggered.value = true
  }
  bumpTextMouth(textMouthDurationMs)
}))

chatHookCleanups.push(onTokenSpecial(async (special) => {
  // console.debug('Stage received special token:', special)
  currentChatIntent?.writeSpecial(special)
  bumpTextMouth(textMouthDurationMs)
}))

chatHookCleanups.push(onStreamEnd(async () => {
  delaysQueue.enqueue(llmInferenceEndToken)
  currentChatIntent?.writeFlush()
}))

chatHookCleanups.push(onAssistantResponseEnd(async (_message) => {
  currentChatIntent?.end()
  currentChatIntent = null
  releaseHeadAngles()
  startIdleHeadWave()
  textMouthUntil.value = Date.now()
  assistantMotionTriggered.value = false
  // const res = await embed({
  //   ...transformersProvider.embed('Xenova/nomic-embed-text-v1'),
  //   input: message,
  // })

  // await db.value?.execute(`INSERT INTO memory_test (vec) VALUES (${JSON.stringify(res.embedding)});`)
}))

onUnmounted(() => {
  lipSyncStarted.value = false
})

// Resume audio context on first user interaction (browser requirement)
let audioContextResumed = false
function resumeAudioContextOnInteraction() {
  if (audioContextResumed || !audioContext)
    return
  audioContextResumed = true
  audioContext.resume().catch(() => {
    // Ignore errors - audio context will be resumed when needed
  })
}

// Add event listeners for user interaction
if (typeof window !== 'undefined') {
  const events = ['click', 'touchstart', 'keydown']
  events.forEach((event) => {
    window.addEventListener(event, resumeAudioContextOnInteraction, { once: true, passive: true })
  })
}

onMounted(async () => {
  if (commandOnlyMotionMode) {
    live2dIdleAnimationEnabled.value = false
  }
  db.value = drizzle({ connection: { bundles: getImportUrlBundles() } })
  await db.value.execute(`CREATE TABLE memory_test (vec FLOAT[768]);`)
})

function canvasElement() {
  if (stageModelRenderer.value === 'live2d')
    return live2dSceneRef.value?.canvasElement()

  else if (stageModelRenderer.value === 'vrm')
    return vrmViewerRef.value?.canvasElement()
}

function readRenderTargetRegionAtClientPoint(clientX: number, clientY: number, radius: number) {
  if (stageModelRenderer.value !== 'vrm')
    return null

  return vrmViewerRef.value?.readRenderTargetRegionAtClientPoint?.(clientX, clientY, radius) ?? null
}

onUnmounted(() => {
  clearForceMotionTimer()
  stopDebugMotionScan()
  stopDebugPulse()
  stopIdleHeadWave()
  if (cachedIdleAnimationEnabled.value !== undefined) {
    live2dIdleAnimationEnabled.value = cachedIdleAnimationEnabled.value
    cachedIdleAnimationEnabled.value = undefined
  }
  if (lipSyncLoopId.value) {
    cancelAnimationFrame(lipSyncLoopId.value)
    lipSyncLoopId.value = undefined
  }

  chatHookCleanups.forEach(dispose => dispose?.())
  viewUpdateCleanups.forEach(dispose => dispose?.())
})

defineExpose({
  canvasElement,
  readRenderTargetRegionAtClientPoint,
})
</script>

<template>
  <div relative>
    <div v-if="live2dDebugControlsEnabled" left-3 top-3 z-60 flex flex-wrap gap-2 rounded-lg bg="black/45" p-2 backdrop-blur absolute>
      <div v-if="lastEmotionTriggerLabel" rounded-md border="1 white/20" px-2 py-1 text-xs text="white/80">
        触发: {{ lastEmotionTriggerLabel }}
      </div>
      <button
        v-for="emotionName in debugEmotionButtons"
        :key="emotionName"
        rounded-md border="1 white/30" px-2 py-1 text-xs text-white
        hover:bg="white/15"
        @click="triggerDebugEmotion(emotionName)"
      >
        {{ emotionName }}
      </button>
      <button
        rounded-md border="1 white/30" px-2 py-1 text-xs text-white
        hover:bg="white/15"
        @click="triggerDebugMotionScan"
      >
        scan
      </button>
      <button
        rounded-md border="1 white/30" px-2 py-1 text-xs text-white
        hover:bg="white/15"
        @click="triggerDebugPulse"
      >
        pulse
      </button>
    </div>
    <div h-full w-full>
      <Live2DScene
        v-if="stageModelRenderer === 'live2d' && showStage"
        ref="live2dSceneRef"
        v-model:state="componentState"
        min-w="50% <lg:full" min-h="100 sm:100"
        h-full w-full flex-1
        :model-src="stageModelSelectedUrl"
        :model-id="stageModelSelected"
        :focus-at="focusAt"
        :mouth-open-size="mouthOpenSize"
        :paused="paused"
        :x-offset="xOffset"
        :y-offset="yOffset"
        :scale="scale"
        :disable-focus-at="live2dDisableFocus"
        :theme-colors-hue="themeColorsHue"
        :theme-colors-hue-dynamic="themeColorsHueDynamic"
        :live2d-idle-animation-enabled="live2dIdleAnimationEnabled"
        :live2d-auto-blink-enabled="live2dAutoBlinkEnabled"
        :live2d-force-auto-blink-enabled="live2dForceAutoBlinkEnabled"
        :live2d-shadow-enabled="live2dShadowEnabled"
        :live2d-max-fps="live2dMaxFps"
      />
      <ThreeScene
        v-if="stageModelRenderer === 'vrm' && showStage"
        ref="vrmViewerRef"
        v-model:state="componentState"
        :model-src="stageModelSelectedUrl"
        :idle-animation="animations.idleLoop.toString()"
        min-w="50% <lg:full" min-h="100 sm:100" h-full w-full flex-1
        :paused="paused"
        :show-axes="stageViewControlsEnabled"
        :current-audio-source="currentAudioSource"
        @error="console.error"
      />
    </div>
  </div>
</template>

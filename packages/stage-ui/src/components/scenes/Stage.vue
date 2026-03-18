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
import { Live2DScene, useLive2d } from '@proj-airi/stage-ui-live2d'
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

import { useSpecialTokenQueue } from '../../composables/queues'
import { llmInferenceEndToken } from '../../constants'
import { EMOTION_EmotionMotionName_value, EMOTION_VRMExpressionName_value, EmotionThinkMotionName } from '../../constants/emotions'
import { useAudioContext, useSpeakingStore } from '../../stores/audio'
import { useChatOrchestratorStore } from '../../stores/chat'
import { useModsServerChannelStore } from '../../stores/mods/api/channel-server'
import { useAiriCardStore } from '../../stores/modules'
import { useSpeechStore } from '../../stores/modules/speech'
import { useProvidersStore } from '../../stores/providers'
import { useSceneStore } from '../../stores/scene'
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
  stageModelSelectedFile,
  stageModelSelected,
  themeColorsHue,
  themeColorsHueDynamic,
  live2dIdleAnimationEnabled,
  live2dAutoBlinkEnabled,
  live2dForceAutoBlinkEnabled,
  live2dShadowEnabled,
  live2dMaxFps,
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

viewUpdateCleanups.push(live2dStore.onShouldUpdateView(() => {
  // Live2D models already handle their own reload path inside the scene package.
}))

viewUpdateCleanups.push(vrmStore.onShouldUpdateView(() => {
  // VRM reloads are driven by modelSrc changes after updateStageModel().
}))

const audioAnalyser = ref<AnalyserNode>()
const nowSpeaking = ref(false)
const lipSyncStarted = ref(false)
const lipSyncLoopId = ref<number>()
const live2dLipSync = ref<Live2DLipSync>()
const live2dLipSyncOptions: Live2DLipSyncOptions = { mouthUpdateIntervalMs: 50, mouthLerpWindowMs: 50 }

const { activeCard } = storeToRefs(useAiriCardStore())
const speechStore = useSpeechStore()
const { ssmlEnabled, activeSpeechProvider, activeSpeechModel, activeSpeechVoice, pitch } = storeToRefs(speechStore)
const activeCardId = computed(() => activeCard.value?.name ?? 'default')
const speechRuntimeStore = useSpeechRuntimeStore()
const sceneStore = useSceneStore()

const { activeBackgroundUrl } = storeToRefs(sceneStore)

const { currentMotion, availableExpressions: live2dExpressions, expressionData: live2dExpressionData, activeExpressions: live2dActiveExpressions, modelParameters: live2dModelParameters } = storeToRefs(live2dStore)

const temporaryVrma = ref<string | null>(null)
let temporaryVrmaTimeout: ReturnType<typeof setTimeout> | null = null

const vrmActiveAnimation = computed(() => {
  const vrmaKey = temporaryVrma.value || vrmStore.vrmIdleAnimation
  return (animations as any)[vrmaKey] || animations.idleLoop
})

const emotionsQueue = createQueue<EmotionPayload>({
  handlers: [
    async (ctx) => {
      if (stageModelRenderer.value === 'vrm') {
        const emotionName = ctx.data.name
        const isVrma = emotionName in animations

        if (isVrma) {
          temporaryVrma.value = emotionName
        }

        const value = (EMOTION_VRMExpressionName_value as any)[emotionName] ?? emotionName

        if (!value)
          return

        if (vrmViewerRef.value) {
          // Only trigger expression if it's a known mapping or a valid raw expression.
          // This prevents warnings and interference for motion-only tokens.
          const isExpression = emotionName in EMOTION_VRMExpressionName_value || vrmViewerRef.value.listExpressions().includes(value)

          if (isExpression) {
            vrmViewerRef.value.setExpression(value, ctx.data.intensity, 2000)
          }
        }
        else {
          console.warn('[Stage] vrmViewerRef is NULL')
        }
      }
      else if (stageModelRenderer.value === 'live2d') {
        const emotionName = ctx.data.name
        // eslint-disable-next-line no-console
        console.log('[Stage] Live2D emotion processing:', { name: emotionName, intensity: ctx.data.intensity })

        // Case-insensitive match against available Live2D expressions
        const matchedExp = live2dExpressions.value.find(
          e => e.name.toLowerCase() === emotionName.toLowerCase(),
        )

        if (matchedExp) {
          // eslint-disable-next-line no-console
          console.log('[Stage] Live2D expression matched:', matchedExp.name, matchedExp.fileName)

          // Apply the expression parameters
          const expEntry = live2dExpressionData.value.find((e: any) => e.fileName === matchedExp.fileName)
          if (expEntry?.data?.Parameters) {
            // Store original values so we can restore them
            const originalValues: Record<string, number> = {}
            for (const param of expEntry.data.Parameters) {
              const id = param.Id || param.id
              const value = param.Value ?? param.value
              if (id !== undefined && value !== undefined) {
                originalValues[id] = live2dModelParameters.value[id] ?? 0
                live2dModelParameters.value[id] = value
              }
            }
            // Mark as active
            live2dActiveExpressions.value = { ...live2dActiveExpressions.value, [matchedExp.fileName]: 1 }

            // Auto-reset after 2 seconds (like VRM)
            setTimeout(() => {
              for (const [id, origValue] of Object.entries(originalValues)) {
                live2dModelParameters.value[id] = origValue
              }
              live2dActiveExpressions.value = { ...live2dActiveExpressions.value, [matchedExp.fileName]: 0 }
              // eslint-disable-next-line no-console
              console.log('[Stage] Live2D expression auto-reset:', matchedExp.name)
            }, 2000)
          }
        }
        else {
          // Fallback: try motion mapping
          const motionGroup = (EMOTION_EmotionMotionName_value as any)[emotionName]
          if (motionGroup) {
            currentMotion.value = { group: motionGroup }
          }
          else {
            console.warn('[Stage] No Live2D expression or motion found for:', emotionName)
          }
        }
      }
    },
  ],
})

const specialTokenQueue = useSpecialTokenQueue(emotionsQueue)
specialTokenQueue.onHandlerEvent('emotion', (emotion) => {
  // eslint-disable-next-line no-console
  console.log('[Stage] Emotion token detected:', emotion)
})
specialTokenQueue.onHandlerEvent('delay', (delay) => {
  // eslint-disable-next-line no-console
  console.log('[Stage] Delay token detected:', delay)
})

// Play special token: delay or emotion
function playSpecialToken(special: string) {
  // eslint-disable-next-line no-console
  console.log('[Stage] Enqueueing special token:', special)
  specialTokenQueue.enqueue(special)
}

const modsServer = useModsServerChannelStore()

function processMarkers(content: string) {
  const markers = content.match(/<\|(?:ACT|DELAY)[\s\S]*?\|>/gi)
  if (markers) {
    // eslint-disable-next-line no-console
    console.debug('[Stage] Markers detected:', markers)
    for (const marker of markers) {
      playSpecialToken(marker)
    }
  }
}

modsServer.onEvent('output:gen-ai:chat:message', (event) => {
  // eslint-disable-next-line no-console
  console.debug('[Stage] Received external message:', event.data)
  if (typeof event.data?.message?.content === 'string') {
    processMarkers(event.data.message.content)
  }
})

modsServer.onEvent('input:text', (event) => {
  // eslint-disable-next-line no-console
  console.debug('[Stage] Received external input:', event.data)
  if (event.data?.text) {
    processMarkers(event.data.text)
  }
})

const lipSyncNode = ref<AudioNode>()

if (typeof window !== 'undefined') {
  (window as any).testEmotion = (emotion: string) => {
    // eslint-disable-next-line no-console
    console.log('[DEBUG] Manually triggering emotion:', emotion)
    processMarkers(`<|ACT:{"emotion":"${emotion}"}|>`)
  }

  (window as any).listExpressions = () => {
    const expressions = vrmViewerRef.value?.listExpressions?.()
    // eslint-disable-next-line no-console
    console.log('[DEBUG] Available Expressions:', expressions)
    return expressions
  }

  (window as any).setRawExpression = (name: string, value: number) => {
    // eslint-disable-next-line no-console
    console.log('[DEBUG] Setting raw expression (3s reset):', name, value)
    vrmViewerRef.value?.setExpression(name, value, 3000)
  }

  (window as any).setPersistentExpression = (name: string, value: number) => {
    // eslint-disable-next-line no-console
    console.log('[DEBUG] Setting persistent expression (NO reset):', name, value)
    vrmViewerRef.value?.setExpression(name, value)
  }

  (window as any).stopAnimations = () => {
    // eslint-disable-next-line no-console
    console.log('[DEBUG] Stopping all animations')
    vrmViewerRef.value?.stopAnimations()
  }
}

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

  // Ensure connections are robust
  source.connect(audioContext.destination)
  if (audioAnalyser.value)
    source.connect(audioAnalyser.value)

  // Explicitly ensure lip-sync setup is called if not already started
  if (!lipSyncStarted.value) {
    await setupLipSync()
  }

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

    if (activeSpeechProvider.value === 'speech-noop')
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
      // Prioritize global selections, then provider settings, then defaults
      model = model || providerConfig?.model as string || 'tts-1'

      if (!voice) {
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
          voice = {
            id: 'alloy',
            name: 'alloy',
            description: 'alloy',
            previewURL: '',
            languages: [{ code: 'en', title: 'English' }],
            provider: activeSpeechProvider.value,
            gender: 'neutral',
          }
        }
      }

      console.info('[Speech Pipeline] Resolved OpenAI Compatible Stats', { model, voice: voice?.id })
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
    if (!nowSpeaking.value || !live2dLipSync.value) {
      mouthOpenSize.value = 0
    }
    else {
      mouthOpenSize.value = live2dLipSync.value.getMouthOpen()
    }
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

function ensureSpeechIntent() {
  if (currentChatIntent)
    return currentChatIntent

  console.log('[Stage] Opening speech intent', { ownerId: activeCardId.value })
  currentChatIntent = speechRuntimeStore.openIntent({
    ownerId: activeCardId.value,
    priority: 'normal',
    behavior: 'interrupt',
  })
  console.log('[Stage] Speech intent opened', { intentId: currentChatIntent.intentId, streamId: currentChatIntent.streamId })

  return currentChatIntent
}

chatHookCleanups.push(onBeforeMessageComposed(async () => {
  playbackManager.stopAll('new-message')

  setupAnalyser()
  await setupLipSync()
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
    console.log('[Stage] Cancelling existing speech intent for new message', { intentId: currentChatIntent.intentId })
    currentChatIntent.cancel('new-message')
    currentChatIntent = null
  }

  ensureSpeechIntent()
}))

chatHookCleanups.push(onBeforeSend(async () => {
  currentMotion.value = { group: EmotionThinkMotionName }
}))

chatHookCleanups.push(onTokenLiteral(async (literal) => {
  const intent = ensureSpeechIntent()
  if (!intent)
    return
  console.log('[Stage] onTokenLiteral -> forwarding to speech', {
    intentId: intent.intentId,
    length: literal.length,
    preview: literal.slice(0, 120),
  })
  intent.writeLiteral(literal)
}))

chatHookCleanups.push(onTokenSpecial(async (special) => {
  const intent = ensureSpeechIntent()
  if (!intent)
    return
  // console.debug('Stage received special token:', special)
  console.log('[Stage] onTokenSpecial -> forwarding', { intentId: intent.intentId, special })
  intent.writeSpecial(special)
}))

chatHookCleanups.push(onStreamEnd(async () => {
  specialTokenQueue.enqueue(llmInferenceEndToken)
  const intent = ensureSpeechIntent()
  if (intent)
    console.log('[Stage] onStreamEnd -> flush intent', { intentId: intent.intentId })
  intent?.writeFlush()
}))

chatHookCleanups.push(onAssistantResponseEnd(async (_message) => {
  if (currentChatIntent)
    console.log('[Stage] onAssistantResponseEnd -> ending intent', { intentId: currentChatIntent.intentId })
  currentChatIntent?.end()
  currentChatIntent = null

  // Restore VRM expressions and animations to user-configured defaults after speech ends
  if (stageModelRenderer.value === 'vrm') {
    vrmViewerRef.value?.restoreDefaultExpressions()

    // Reset to idle animation when the entire turn ends
    if (temporaryVrmaTimeout) {
      clearTimeout(temporaryVrmaTimeout)
      temporaryVrmaTimeout = null
    }
    temporaryVrma.value = null
  }
  // const res = await embed({
  //   ...transformersProvider.embed('Xenova/nomic-embed-text-v1'),
  //   input: message,
  // })

  // await db.value?.execute(`INSERT INTO memory_test (vec) VALUES (${JSON.stringify(res.embedding)});`)
}))

function handleAnimationFinished() {
  if (stageModelRenderer.value !== 'vrm')
    return

  // Resume idle from ACT performance
  if (temporaryVrma.value) {
    temporaryVrma.value = null
  }

  // Cycle if enabled
  if (vrmStore.vrmIdleCycleEnabled) {
    const keys = Object.keys(animations)
    const currentKey = vrmStore.vrmIdleAnimation
    const otherKeys = keys.filter(key => key !== currentKey)
    const randomKey = otherKeys[Math.floor(Math.random() * otherKeys.length)]
    if (randomKey) {
      vrmStore.vrmIdleAnimation = randomKey
    }
  }
}

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
  <div :class="['relative h-full w-full']">
    <!-- Scene Background Layer -->
    <div
      v-if="activeBackgroundUrl"
      :class="[
        'absolute left-0 top-0 z-0 h-full w-full',
        'transition-opacity duration-500',
      ]"
      :style="{
        backgroundImage: `url(${activeBackgroundUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }"
    />

    <div :class="['relative h-full w-full']">
      <Live2DScene
        v-if="stageModelRenderer === 'live2d'"
        ref="live2dSceneRef"
        v-model:state="componentState"
        :class="['min-w-50% <lg:full min-h-100 sm:100', 'h-full w-full flex-1']"
        :model-src="stageModelSelectedUrl"
        :model-id="stageModelSelected"
        :model-file="stageModelSelectedFile"
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
        v-if="stageModelRenderer === 'vrm'"
        ref="vrmViewerRef"
        v-model:state="componentState"
        :model-src="stageModelSelectedUrl"
        :model-identity="stageModelSelected"
        :idle-animation="vrmActiveAnimation"
        :class="['min-w-50% <lg:full min-h-100 sm:100', 'h-full w-full flex-1']"
        :paused="paused"
        :show-axes="stageViewControlsEnabled"
        :current-audio-source="currentAudioSource"
        @error="console.error"
        @finished="handleAnimationFinished"
      />
    </div>
  </div>
</template>

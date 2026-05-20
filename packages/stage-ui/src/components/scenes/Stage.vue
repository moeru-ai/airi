<script setup lang="ts">
import type { Live2DLipSync, Live2DLipSyncOptions } from '@proj-airi/model-driver-lipsync'
import type { Profile } from '@proj-airi/model-driver-lipsync/shared/wlipsync'
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'
import type { UnElevenLabsOptions } from 'unspeech'

import type { EmotionPayload } from '../../constants/emotions'
import type { SpeechTransport, StageTtsSession, StreamingSessionSnapshot } from '../../libs/speech/tts-session'

import { sleep } from '@moeru/std'
import { createLive2DLipSync } from '@proj-airi/model-driver-lipsync'
import { wlipsyncProfile } from '@proj-airi/model-driver-lipsync/shared/wlipsync'
import { createPlaybackManager, createSpeechPipeline, normalizeActPayload } from '@proj-airi/pipelines-audio'
import { Live2DScene, useLive2dParams } from '@proj-airi/stage-ui-live2d'
import { SpineScene } from '@proj-airi/stage-ui-spine'
import { ThreeScene } from '@proj-airi/stage-ui-three'
import { animations } from '@proj-airi/stage-ui-three/assets/vrm'
import { createQueue } from '@proj-airi/stream-kit'
import { Callout } from '@proj-airi/ui'
import { useBroadcastChannel } from '@vueuse/core'
// import { createTransformers } from '@xsai-transformers/embed'
// import embedWorkerURL from '@xsai-transformers/embed/worker?worker&url'
// import { embed } from '@xsai/embed'
import { generateSpeech } from '@xsai/generate-speech'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import { useSettingsLive2d } from '../../../../stage-ui-live2d/src/composables/live2d/live2d'
import { useAuthProviderSync } from '../../composables/use-auth-provider-sync'
import { useDuckDb } from '../../composables/use-duck-db'
import { useIOTraceBridge } from '../../composables/use-io-trace-bridge'
import { initIOTracer } from '../../composables/use-io-tracer'
import { useSpeechPipelineAnalytics } from '../../composables/use-speech-pipeline-analytics'
import { Emotion, EMOTION_EmotionMotionName_value, EMOTION_VRMExpressionName_value, EmotionThinkMotionName } from '../../constants/emotions'
import { getDefinedProvider } from '../../libs/providers/providers'
import { createStageTtsSession } from '../../libs/speech/tts-session'
import { useAudioContext, useSpeakingStore } from '../../stores/audio'
import { useBackgroundStore } from '../../stores/background'
import { useChatOrchestratorStore } from '../../stores/chat'
import { useLlmStreamingControlStore } from '../../stores/llm-streaming-control'
import { useAiriCardStore } from '../../stores/modules'
import { useSpeechStore } from '../../stores/modules/speech'
import { useProvidersStore } from '../../stores/providers'
import { useSettings } from '../../stores/settings'
import { useSpeechRuntimeStore } from '../../stores/speech-runtime'

const props = withDefaults(defineProps<{
  cursorPosition?: { x: number, y: number }
  enableOrbitControls?: boolean
  paused?: boolean
}>(), {
  enableOrbitControls: true,
  paused: false,
})

const componentState = defineModel<'pending' | 'loading' | 'mounted'>('state', { default: 'pending' })

const { getDb } = useDuckDb()
// const transformersProvider = createTransformers({ embedWorkerURL })

const vrmViewerRef = ref<InstanceType<typeof ThreeScene>>()
const live2dSceneRef = ref<InstanceType<typeof Live2DScene>>()
const spineSceneRef = ref<InstanceType<typeof SpineScene>>()

const settingsStore = useSettings()
const {
  stageModelRenderer,
  stageViewControlsEnabled,
  stageModelSelectedUrl,
  stageModelSelected,
  themeColorsHue,
  themeColorsHueDynamic,

} = storeToRefs(settingsStore)
const {
  live2dShadowEnabled,
  live2dMaxFps,
  live2dRenderScale,
} = storeToRefs(useSettingsLive2d())
const {
  spinePremultipliedAlpha,
  spineDefaultMixDuration,
  spineIdleAnimationEnabled,
  spineMaxFps,
  spineRenderScale,
} = storeToRefs(settingsStore)
const { mouthOpenSize, nowSpeaking } = storeToRefs(useSpeakingStore())
const { audioContext } = useAudioContext()
const currentAudioSource = ref<AudioBufferSourceNode>()

const { onBeforeMessageComposed, onBeforeSend, onTokenLiteral, onTokenSpecial, onStreamEnd, onAssistantResponseEnd } = useChatOrchestratorStore()
const chatHookCleanups: Array<() => void> = []
// WORKAROUND: clear previous handlers on unmount to avoid duplicate calls when this component remounts.
//             We keep per-hook disposers instead of wiping the global chat hooks to play nicely with
//             cross-window broadcast wiring.

const providersStore = useProvidersStore()
useAuthProviderSync()
const live2dStore = useLive2dParams()
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

const audioAnalyser = ref<AnalyserNode>()
const lipSyncStarted = ref(false)
const lipSyncLoopId = ref<number>()
const live2dLipSync = ref<Live2DLipSync>()
const live2dLipSyncOptions: Live2DLipSyncOptions = { mouthUpdateIntervalMs: 50, mouthLerpWindowMs: 50 }

const { activeCard } = storeToRefs(useAiriCardStore())
const speechStore = useSpeechStore()
const { ssmlEnabled, activeSpeechProvider, activeSpeechModel, activeSpeechVoice, pitch } = storeToRefs(speechStore)
const activeCardId = computed(() => activeCard.value?.name ?? 'default')
const speechRuntimeStore = useSpeechRuntimeStore()
const backgroundStore = useBackgroundStore()
const { activeBackgroundUrl } = storeToRefs(backgroundStore)

const { currentMotion } = storeToRefs(useLive2dParams())

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
        currentMotion.value = { group: EMOTION_EmotionMotionName_value[ctx.data.name] }
      }
      else if (stageModelRenderer.value === 'spine') {
        spineSceneRef.value?.setEmotion(ctx.data.name, ctx.data.intensity)
      }
    },
  ],
})

const streamingControl = useLlmStreamingControlStore()

function toStageEmotionPayload(payload: { name: string, intensity: number }): EmotionPayload | undefined {
  switch (payload.name) {
    case 'happy':
      return { name: Emotion.Happy, intensity: payload.intensity }
    case 'sad':
      return { name: Emotion.Sad, intensity: payload.intensity }
    case 'angry':
      return { name: Emotion.Angry, intensity: payload.intensity }
    case 'think':
      return { name: Emotion.Think, intensity: payload.intensity }
    case 'surprised':
      return { name: Emotion.Surprise, intensity: payload.intensity }
    case 'awkward':
      return { name: Emotion.Awkward, intensity: payload.intensity }
    case 'question':
      return { name: Emotion.Question, intensity: payload.intensity }
    case 'curious':
      return { name: Emotion.Curious, intensity: payload.intensity }
    case 'neutral':
      return { name: Emotion.Neutral, intensity: payload.intensity }
    default:
      return undefined
  }
}

chatHookCleanups.push(streamingControl.onSignal(async (signal) => {
  if (signal.type === 'act') {
    const act = normalizeActPayload(signal.payload)
    if (act.motion && stageModelRenderer.value === 'live2d') {
      currentMotion.value = { group: act.motion }
      return
    }
    if (act.emotion) {
      const emotion = toStageEmotionPayload(act.emotion)
      if (!emotion)
        return

      // eslint-disable-next-line no-console
      console.debug('emotion detected', emotion)
      emotionsQueue.enqueue(emotion)
    }
    return
  }

  if (signal.type === 'delay') {
    // eslint-disable-next-line no-console
    console.debug('delay detected', signal.seconds)
    await sleep(signal.seconds * 1000)
  }
}))

// Play special token: plugin CALL, delay, or emotion.
async function playSpecialToken(
  special: string,
  options?: {
    turnId?: string
    intentId?: string
    streamId?: string
  },
) {
  await streamingControl.dispatchWith(special, {
    turnId: options?.turnId,
    intentId: options?.intentId,
    streamId: options?.streamId,
  })
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

  if (stageModelRenderer.value === 'live2d' && !lipSyncStarted.value) {
    // NOTICE: Playback can be triggered by non-chat speech intents, so initialize
    // the wLipSync graph here before connecting the AudioBufferSourceNode.
    setupAnalyser()
    await setupLipSync()
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

    if (activeSpeechProvider.value === 'speech-noop')
      return null

    if (!activeSpeechProvider.value)
      return null

    // Streaming provider must NEVER reach this per-segment callback. The
    // streaming code path opens its own ws at `onBeforeMessageComposed`
    // and bypasses speech-pipeline entirely. If we got here while the
    // streaming provider is active, the open path failed (most often:
    // voice catalog hadn't finished loading when the user sent the
    // message). The old fallback would silently re-open a fresh ws per
    // segment — exactly the behavior the refactor is meant to delete.
    // Codex review MEDIUM #3: refuse loudly instead.
    if (resolveSpeechTransport(activeSpeechProvider.value) === 'bidirectional-ws') {
      console.warn('[Speech Pipeline] bidirectional-ws provider reached per-segment fallback', {
        reason: 'streaming session was not opened at intent start (voice unset?)',
        provider: activeSpeechProvider.value,
        segment: request.text?.slice(0, 40),
      })
      return null
    }

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
      // Non-streaming providers only: synth via REST. Streaming provider
      // was already early-returned above; it owns its own ws path opened
      // in `onBeforeMessageComposed`.
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
    catch (err) {
      // Surface the error with context. Pipeline still drops the segment
      // (returning null) so the conversation keeps going, but operators see
      // the failure in devtools instead of silent truncation. Streaming
      // failures (truncated session, network drop, billing rejection) now
      // produce visible diagnostic lines — see codex review item #6.
      if (!signal.aborted) {
        console.error('[Speech Pipeline] tts() failed', {
          provider: activeSpeechProvider.value,
          model,
          voice: voice?.id,
          error: err,
        })
      }
      return null
    }
  },
  playback: playbackManager,
})

initIOTracer()
useIOTraceBridge(speechPipeline)
useSpeechPipelineAnalytics()
void speechRuntimeStore.registerHost(speechPipeline)

speechPipeline.on('onSpecial', (segment) => {
  if (segment.special) {
    void playSpecialToken(segment.special, {
      turnId: segment.turnId,
      intentId: segment.intentId,
      streamId: segment.streamId,
    })
  }
})

speechPipeline.on('onTurnEnd', (turnId) => {
  streamingControl.completeTurn(turnId)
})

speechPipeline.on('onTurnCancel', ({ turnId }) => {
  streamingControl.cancelTurn(turnId)
})

playbackManager.onEnd(() => {
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
    postCaption({ type: 'caption-assistant', text: item.text })
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

function stopLipSyncLoop() {
  if (lipSyncLoopId.value) {
    cancelAnimationFrame(lipSyncLoopId.value)
    lipSyncLoopId.value = undefined
  }

  mouthOpenSize.value = 0
}

function resetLive2dLipSync() {
  stopLipSyncLoop()

  try {
    lipSyncNode.value?.disconnect()
  }
  catch {

  }

  lipSyncNode.value = undefined
  live2dLipSync.value = undefined
  lipSyncStarted.value = false
}

function syncLipSyncLoop() {
  if (stageModelRenderer.value === 'live2d' && !props.paused && lipSyncStarted.value) {
    startLipSyncLoop()
    return
  }

  stopLipSyncLoop()
}

async function setupLipSync() {
  if (stageModelRenderer.value !== 'live2d') {
    resetLive2dLipSync()
    return
  }

  if (lipSyncStarted.value)
    return

  try {
    const lipSync = await createLive2DLipSync(audioContext, wlipsyncProfile as Profile, live2dLipSyncOptions)
    live2dLipSync.value = lipSync
    lipSyncNode.value = lipSync.node
    await audioContext.resume()
    lipSyncStarted.value = true
    syncLipSyncLoop()
  }
  catch (error) {
    resetLive2dLipSync()
    console.error('Failed to setup Live2D lip sync', error)
  }
}

function setupAnalyser() {
  if (!audioAnalyser.value) {
    audioAnalyser.value = audioContext.createAnalyser()
  }
}

// One TTS session per LLM intent. The active provider determines which
// adapter `createStageTtsSession` returns: the segmenter-based adapter for
// every non-streaming provider, or the bidirectional WebSocket adapter
// for the official streaming provider. Stage.vue intentionally does NOT
// branch on provider id anywhere below — the factory is the single
// decision point. See `packages/stage-ui/src/libs/speech/tts-session.ts`.
let currentSession: StageTtsSession | null = null

function buildStreamingSnapshot(): StreamingSessionSnapshot | null {
  // Snapshotted once per session, so a mid-session provider/voice swap
  // does not corrupt an in-flight session — the watcher below detects
  // changes and tears down explicitly. Returns `null` when streaming
  // can't be opened (no voice picked, no audioContext, no model);
  // `createStageTtsSession` falls back to the segmenter adapter in that
  // case, which is the right behaviour for the rest of the providers too.
  const voiceId = activeSpeechVoice.value?.id
  if (!voiceId)
    return null
  const sessionModel = (activeSpeechModel.value as string | undefined) || 'volcengine/seed-tts-2.0'
  const apiResourceId = sessionModel.includes('/') ? sessionModel.split('/', 2)[1] : 'seed-tts-2.0'
  // TTS 2.0 / ICL 2.0 ship subtitles asynchronously relative to audio
  // (per the wire spec), so chunk-on-sentence-end would drop frames.
  // Buffer the entire session and decode at session.finished instead.
  const bufferEntireSession = apiResourceId.startsWith('seed-tts-2.0') || apiResourceId.startsWith('seed-icl-2.0')
  return {
    model: sessionModel,
    voice: voiceId,
    bufferEntireSession,
    extraBody: {
      api_resource_id: apiResourceId,
      audio: { sample_rate: 24000, bit_rate: 64000 },
    },
    ownerId: activeCardId.value,
    onImmediateSpecial: playSpecialToken,
  }
}

function resolveSpeechTransport(providerId: string | null | undefined): SpeechTransport | undefined {
  if (!providerId)
    return undefined
  // Read straight from the unified ProviderDefinition registry — keeps the
  // factory transport-agnostic and lets a new provider opt into streaming
  // by setting `capabilities.speech.transport: 'bidirectional-ws'` in its
  // own `defineProvider` call (no Stage / factory edits needed).
  return getDefinedProvider(providerId)?.capabilities?.speech?.transport
}

function openTtsSession(): StageTtsSession {
  return createStageTtsSession<AudioBuffer>({
    transport: resolveSpeechTransport(activeSpeechProvider.value),
    streaming: buildStreamingSnapshot,
    audioContext,
    playbackManager,
    openIntent: opts => speechRuntimeStore.openIntent(opts),
    intentOptions: () => ({
      ownerId: activeCardId.value,
      priority: 'normal',
      behavior: 'queue',
    }),
    hooks: {
      onError: (err) => {
        console.error('[Speech Pipeline] streaming session error', {
          provider: activeSpeechProvider.value,
          model: activeSpeechModel.value,
          error: err,
        })
        if (currentSession?.intentId.startsWith('stream-'))
          currentSession = null
      },
      onDone: () => {
        if (currentSession?.intentId.startsWith('stream-'))
          currentSession = null
      },
    },
  })
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

  currentSession?.cancel('new-message')
  currentSession = openTtsSession()
}))

chatHookCleanups.push(onBeforeSend(async () => {
  currentMotion.value = { group: EmotionThinkMotionName }
}))

chatHookCleanups.push(onTokenLiteral(async (literal) => {
  currentSession?.appendText(literal)
}))

chatHookCleanups.push(onTokenSpecial(async (special) => {
  currentSession?.appendSpecial(special)
}))

chatHookCleanups.push(onStreamEnd(async () => {
  currentSession?.finishInput()
}))

chatHookCleanups.push(onAssistantResponseEnd(async (_message) => {
  currentSession?.end()
  // Streaming sessions null-out via the onDone hook; segmenter sessions
  // stay around until the next `onBeforeMessageComposed` cancels them
  // (the segmenter pipeline's IntentHandle.end is idempotent and
  // ResourceMessages still arrive after end() — clearing here would
  // race with the pipeline's own cleanup). Keep the ref pointing at
  // the just-ended session; it costs nothing and the next message
  // replaces it.
  // const res = await embed({
  //   ...transformersProvider.embed('Xenova/nomic-embed-text-v1'),
  //   input: message,
  // })

  // await db.value?.execute(`INSERT INTO memory_test (vec) VALUES (${JSON.stringify(res.embedding)});`)
}))

// Mid-session provider / voice / model swaps would otherwise keep feeding
// tokens to the OLD adapter (segmenter for the new provider, or stale ws
// for the streaming provider). Cancel the active session so the next LLM
// token after the swap falls through `currentSession?.` cleanly (silent
// drop is acceptable — we don't try to fork-replay text into a new
// adapter with potentially different voice/model).
watch(
  [activeSpeechProvider, () => activeSpeechVoice.value?.id, activeSpeechModel],
  ([provider, voiceId, model], [prevProvider, prevVoiceId, prevModel]) => {
    if (!currentSession)
      return
    if (provider === prevProvider && voiceId === prevVoiceId && model === prevModel)
      return
    console.warn('[Speech Pipeline] provider/voice/model changed mid-session, tearing down', {
      provider,
      prevProvider,
      voiceId,
      prevVoiceId,
      model,
      prevModel,
    })
    currentSession.cancel('provider-or-voice-changed')
    currentSession = null
  },
)

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
  await getDb() // stub for future update
})

watch([stageModelRenderer, () => props.paused], ([renderer]) => {
  if (renderer === 'godot') {
    componentState.value = 'mounted'
  }

  if (renderer !== 'live2d') {
    resetLive2dLipSync()
    return
  }

  syncLipSyncLoop()
}, { immediate: true })

function canvasElement() {
  if (stageModelRenderer.value === 'live2d')
    return live2dSceneRef.value?.canvasElement()

  else if (stageModelRenderer.value === 'vrm')
    return vrmViewerRef.value?.canvasElement()

  else if (stageModelRenderer.value === 'spine')
    return spineSceneRef.value?.canvasElement()
}

function readRenderTargetRegionAtClientPoint(clientX: number, clientY: number, radius: number) {
  if (stageModelRenderer.value !== 'vrm')
    return null

  return vrmViewerRef.value?.readRenderTargetRegionAtClientPoint?.(clientX, clientY, radius) ?? null
}

async function captureFrame() {
  const charBlob = await (stageModelRenderer.value === 'live2d'
    ? live2dSceneRef.value?.captureFrame()
    : stageModelRenderer.value === 'vrm'
      ? vrmViewerRef.value?.captureFrame()
      : spineSceneRef.value?.captureFrame())

  if (!activeBackgroundUrl.value || !charBlob)
    return charBlob

  try {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx)
      return charBlob

    // Load background image
    const bgImg = new Image()
    bgImg.crossOrigin = 'anonymous'
    bgImg.src = activeBackgroundUrl.value
    await new Promise((resolve, reject) => {
      bgImg.onload = resolve
      bgImg.onerror = reject
    })

    // Load character frame
    const charImg = await createImageBitmap(charBlob)

    // Match canvas size to the captured frame (respects DPI/Render Scale)
    canvas.width = charImg.width
    canvas.height = charImg.height

    // Draw background with "cover" logic
    const scale = Math.max(canvas.width / bgImg.width, canvas.height / bgImg.height)
    const w = bgImg.width * scale
    const h = bgImg.height * scale
    const x = (canvas.width - w) / 2
    const y = (canvas.height - h) / 2

    ctx.drawImage(bgImg, x, y, w, h)

    // Draw character on top
    ctx.drawImage(charImg, 0, 0)

    return new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
  }
  catch (error) {
    console.error('[Stage] Failed to composite photo with background:', error)
    return charBlob // Fallback to character-only
  }
}

onUnmounted(() => {
  resetLive2dLipSync()
  chatHookCleanups.forEach(dispose => dispose?.())
  viewUpdateCleanups.forEach(dispose => dispose?.())
  // Tear down any in-flight TTS session (segmenter or streaming) and
  // drain playback. Without this, a still-open streaming ws keeps
  // feeding sentences into a playbackManager whose listeners still
  // mutate component refs (caption / nowSpeaking). Codex review: HIGH
  // #1 + MEDIUM #5.
  currentSession?.cancel('unmount')
  currentSession = null
  playbackManager.stopAll('unmount')
})

defineExpose({
  canvasElement,
  captureFrame,
  readRenderTargetRegionAtClientPoint,
})
</script>

<template>
  <div relative h-full w-full>
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

    <div relative h-full w-full>
      <Live2DScene
        v-if="stageModelRenderer === 'live2d' && showStage"
        ref="live2dSceneRef"
        v-model:state="componentState"
        min-w="50% <lg:full" min-h="100 sm:100"
        h-full w-full flex-1
        :model-src="stageModelSelectedUrl"
        :model-id="stageModelSelected"
        :cursor-position="cursorPosition"
        :mouth-open-size="mouthOpenSize"
        :now-speaking="nowSpeaking"
        :paused="paused"
        :theme-colors-hue="themeColorsHue"
        :theme-colors-hue-dynamic="themeColorsHueDynamic"
        :live2d-shadow-enabled="live2dShadowEnabled"
        :live2d-max-fps="live2dMaxFps"
        :live2d-render-scale="live2dRenderScale"
      />
      <ThreeScene
        v-if="stageModelRenderer === 'vrm' && showStage"
        ref="vrmViewerRef"
        v-model:state="componentState"
        min-w="50% <lg:full" min-h="100 sm:100" h-full w-full flex-1
        :model-src="stageModelSelectedUrl"
        :cursor-position="cursorPosition"
        :idle-animation="animations.idleLoop.toString()"
        :paused="paused"
        :show-axes="stageViewControlsEnabled"
        :enable-orbit-controls="props.enableOrbitControls"
        :current-audio-source="currentAudioSource"
        @error="console.error"
      />
      <SpineScene
        v-if="stageModelRenderer === 'spine' && showStage"
        ref="spineSceneRef"
        v-model:state="componentState"
        min-w="50% <lg:full" min-h="100 sm:100"
        h-full w-full flex-1
        :model-src="stageModelSelectedUrl"
        :model-id="stageModelSelected"
        :paused="paused"
        :premultiplied-alpha="spinePremultipliedAlpha"
        :default-mix-duration="spineDefaultMixDuration"
        :idle-animation-enabled="spineIdleAnimationEnabled"
        :max-fps="spineMaxFps"
        :render-scale="spineRenderScale"
      />
      <div
        v-if="stageModelRenderer === 'godot'"
        :class="[
          'h-full w-full',
          'flex items-center justify-center',
          'px-4 py-6',
        ]"
      >
        <div
          :class="[
            'w-96 max-w-full',
            'min-h-32',
            'flex items-center justify-center',
          ]"
        >
          <Callout label="Godot Stage (Experimental)">
            <p>Godot Stage (experimental) is running...</p>
          </Callout>
        </div>
      </div>
    </div>
  </div>
</template>

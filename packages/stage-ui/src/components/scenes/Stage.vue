<script setup lang="ts">
import type { Live2DLipSync, Live2DLipSyncOptions } from '@proj-airi/model-driver-lipsync'
import type { Profile } from '@proj-airi/model-driver-lipsync/shared/wlipsync'
import type { IntentHandle } from '@proj-airi/pipelines-audio'
import type { CaptionChannelEvent } from '@proj-airi/stage-shared'
import type { VrmInteractionTarget } from '@proj-airi/stage-ui-three'
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'
import type { UnElevenLabsOptions } from 'unspeech'

import type { EmotionPayload } from '../../constants/emotions'

import { defineInvokeHandler } from '@moeru/eventa'
import { sleep } from '@moeru/std'
import { createLive2DLipSync } from '@proj-airi/model-driver-lipsync'
import { wlipsyncProfile } from '@proj-airi/model-driver-lipsync/shared/wlipsync'
import { createPlaybackManager, createSpeechPipeline, normalizeActPayload } from '@proj-airi/pipelines-audio'
import { defaultLive2DMotionControlDynamics, Live2DScene, useLive2DMotionControl, useLive2dParams, useSettingsLive2d } from '@proj-airi/stage-ui-live2d'
import { MMDScene } from '@proj-airi/stage-ui-mmd'
import { SpineScene } from '@proj-airi/stage-ui-spine'
import { TachieScene } from '@proj-airi/stage-ui-tachie'
import { ThreeScene } from '@proj-airi/stage-ui-three'
import { animations } from '@proj-airi/stage-ui-three/assets/vrm'
import { createQueue } from '@proj-airi/stream-kit'
import { useBroadcastChannel } from '@vueuse/core'
// import { createTransformers } from '@xsai-transformers/embed'
// import embedWorkerURL from '@xsai-transformers/embed/worker?worker&url'
// import { embed } from '@xsai/embed'
import { storeToRefs } from 'pinia'
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'

import StageRenderError from './stage-render-error.vue'

import { useDuckDb } from '../../composables/use-duck-db'
import { useIOTraceBridge } from '../../composables/use-io-trace-bridge'
import { initIOTracer } from '../../composables/use-io-tracer'
import { Emotion, EMOTION_EmotionMotionName_value, EMOTION_VRMExpressionName_value, EmotionThinkMotionName } from '../../constants/emotions'
import { live2dMotionMagicProfiles, useLive2DMotionMagic, useLive2DMotionMagicSettings } from '../../features/motions/live2d'
import { bindSpeakingStateToPlaybackManager } from '../../libs/speech/playback-speaking-state'
import { getSpeechBusContext, speechOutputGetPlaybackState } from '../../services/speech/bus'
import { useLlmStreamingControlStore } from '../../stores/ai/chat-llm/streaming-control'
import { useAudioContext, useSpeakingStore } from '../../stores/audio'
import { useBackgroundStore } from '../../stores/background'
import { useChatStore } from '../../stores/chat'
import { useAiriCardStore } from '../../stores/modules'
import { useSpeechStore } from '../../stores/modules/speech'
import { useProviderConfigStore } from '../../stores/providers/config'
import { useProviderStore } from '../../stores/providers/provider'
import { useSettings } from '../../stores/settings'
import { useSpeechOutputControlStore } from '../../stores/speech-output-control'
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
const tachieSceneRef = ref<InstanceType<typeof TachieScene>>()
const mmdSceneRef = ref<InstanceType<typeof MMDScene>>()

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
  live2dMotionDriver,
  live2dShadowEnabled,
  live2dMaxFps,
  live2dRenderScale,
} = storeToRefs(useSettingsLive2d())
const live2dMotionControl = useLive2DMotionControl()
const { exclusiveOwnerId: live2dMotionControlOwnerId } = storeToRefs(live2dMotionControl)
const {
  forceViewTarget: live2dMagicForceViewTarget,
  profileId: live2dMagicProfileId,
  skipMouthOpen: live2dMagicSkipMouthOpen,
} = storeToRefs(useLive2DMotionMagicSettings())
const live2dMagicMotion = useLive2DMotionMagic({
  dataset: () => live2dMotionMagicProfiles[live2dMagicProfileId.value].dataset,
  forceViewTarget: live2dMagicForceViewTarget,
  skipMouthOpen: live2dMagicSkipMouthOpen,
  disabled: () => live2dMotionControlOwnerId.value !== null,
  publishPose: pose => live2dMotionControl.setPose('stage:live2d-motion-magic', pose, defaultLive2DMotionControlDynamics),
  releasePose: () => live2dMotionControl.release('stage:live2d-motion-magic'),
})
let live2dMagicActivationRequest = 0

watch(
  [stageModelRenderer, live2dMotionDriver, live2dMagicProfileId, () => props.paused, live2dMotionControlOwnerId],
  async ([renderer, driver, , paused, controlOwnerId]) => {
    const request = ++live2dMagicActivationRequest
    if (renderer !== 'live2d' || driver !== 'magic' || paused || controlOwnerId !== null) {
      live2dMagicMotion.stop()
      return
    }

    if (live2dMagicMotion.status.value === 'idle')
      await live2dMagicMotion.initialize()

    if (
      request !== live2dMagicActivationRequest
      || stageModelRenderer.value !== 'live2d'
      || live2dMotionDriver.value !== 'magic'
      || props.paused
      || live2dMotionControlOwnerId.value !== null
    ) {
      return
    }

    live2dMagicMotion.start()
  },
  { immediate: true },
)
const {
  spinePremultipliedAlpha,
  spineDefaultMixDuration,
  spineIdleAnimationEnabled,
  spineMaxFps,
  spineRenderScale,
} = storeToRefs(settingsStore)
const { mouthOpenSize, nowSpeaking } = storeToRefs(useSpeakingStore())
const disposePlaybackStateHandler = defineInvokeHandler(
  getSpeechBusContext(),
  speechOutputGetPlaybackState,
  () => ({ speaking: nowSpeaking.value }),
)
const { audioContext } = useAudioContext()
const currentAudioSource = ref<AudioBufferSourceNode>()
const speechOutputControlStore = useSpeechOutputControlStore()
const { latestStopRequest, speechMuted } = storeToRefs(speechOutputControlStore)
const lastVrmInteractionAt = new Map<VrmInteractionTarget, number>()
const VRM_INTERACTION_COOLDOWN_MS = 450

function getVrmInteractionExpression(target: VrmInteractionTarget) {
  if (target === 'head')
    return 'happy'
  if (target === 'leftFoot' || target === 'rightFoot')
    return 'relaxed'
  return 'surprised'
}

function onVRMInteract(target: VrmInteractionTarget) {
  const now = Date.now()
  const lastTriggeredAt = lastVrmInteractionAt.get(target) ?? 0
  if (now - lastTriggeredAt < VRM_INTERACTION_COOLDOWN_MS)
    return
  lastVrmInteractionAt.set(target, now)
  vrmViewerRef.value?.setExpression(getVrmInteractionExpression(target), 1)
}

const { onBeforeMessageComposed, onBeforeSend, onTokenLiteral, onTokenSpecial, onStreamEnd, onAssistantResponseEnd } = useChatStore()
const chatHookCleanups: Array<() => void> = []
// WORKAROUND: clear previous handlers on unmount to avoid duplicate calls when this component remounts.
//             We keep per-hook disposers instead of wiping the global chat hooks to play nicely with
//             cross-window broadcast wiring.

const providersStore = useProviderStore()

const providerStore = useProviderConfigStore()
const live2dStore = useLive2dParams()
const showStage = ref(true)
const stageRenderError = shallowRef<Error>()
const viewUpdateCleanups: Array<() => void> = []

function handleStageRenderError(error: Error) {
  stageRenderError.value = error
}

async function retryStageRenderer() {
  stageRenderError.value = undefined
  showStage.value = false
  await nextTick()
  showStage.value = true
}

watch([stageModelRenderer, stageModelSelected, stageModelSelectedUrl], () => {
  stageRenderError.value = undefined
})

// Caption + Presentation broadcast channels
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

function resetAssistantSpeechSurface(source: string) {
  nowSpeaking.value = false
  mouthOpenSize.value = 0
  assistantCaption.value = ''

  try {
    postCaption({ type: 'caption-assistant', text: '' })
  }
  catch (error) {
    console.warn(`[Stage] Failed to post caption reset for ${source} (channel may be closed)`, { error })
  }

  try {
    postPresent({ type: 'assistant-reset' })
  }
  catch (error) {
    console.warn(`[Stage] Failed to post present reset for ${source} (channel may be closed)`, { error })
  }
}

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
      else if (stageModelRenderer.value === 'tachie') {
        tachieSceneRef.value?.setEmotion(ctx.data.name, ctx.data.intensity)
      }
      else if (stageModelRenderer.value === 'mmd') {
        mmdSceneRef.value?.setEmotion(ctx.data.name, ctx.data.intensity)
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

    if (speechMuted.value)
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

    const providerConfig = providerStore.getProviderConfig(activeSpeechProvider.value)

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

    try {
      const speechRequest = speechStore.resolveSpeechInput({
        text: request.text,
        voice,
        providerConfig: {
          ...providerConfig,
          pitch: ssmlEnabled.value ? pitch.value : undefined,
        },
        forceSSML: ssmlEnabled.value,
        supportsSSML: speechStore.supportsSSML,
      })

      // Non-streaming providers only: synth via REST. Streaming provider
      // was already early-returned above; it owns its own ws path opened
      // in `onBeforeMessageComposed`.
      const res = await speechStore.speech(
        provider,
        model,
        speechRequest.input,
        voice.id,
        speechRequest.providerConfig,
      )

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

function resetSpeakingState() {
  nowSpeaking.value = false
  mouthOpenSize.value = 0
}

bindSpeakingStateToPlaybackManager(playbackManager, {
  setSpeaking: (speaking) => {
    if (!speaking)
      resetSpeakingState()
    else
      nowSpeaking.value = true
  },
  onStart: ({ item }) => {
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
  },
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

// One TTS intent per LLM turn. The handle belongs to `pipelines-audio`, which
// owns segmentation, special-token queueing, and playback scheduling.
let currentSession: IntentHandle | null = null

function stopSpeechOutput(reason: string) {
  currentSession?.cancel(reason)
  currentSession = null
  speechPipeline.stopAll(reason)
  playbackManager.stopAll(reason)
  resetAssistantSpeechSurface(reason)
}

watch(latestStopRequest, (request) => {
  if (!request)
    return

  stopSpeechOutput(request.reason)
})

watch(speechMuted, (muted) => {
  if (muted)
    stopSpeechOutput('muted')
}, { immediate: true })

chatHookCleanups.push(onBeforeMessageComposed(async (_message, context) => {
  playbackManager.stopAll('new-message')
  resetAssistantSpeechSurface('new-message')

  currentSession?.cancel('new-message')
  currentSession = null

  if (speechMuted.value)
    return

  setupAnalyser()
  await setupLipSync()
  currentSession = speechRuntimeStore.openIntent({
    turnId: context.turnId,
    ownerId: activeCardId.value,
    priority: 'normal',
    behavior: 'queue',
  })
}))

chatHookCleanups.push(onBeforeSend(async () => {
  currentMotion.value = { group: EmotionThinkMotionName }
}))

chatHookCleanups.push(onTokenLiteral(async (literal) => {
  currentSession?.writeLiteral(literal)
}))

chatHookCleanups.push(onTokenSpecial(async (special, context) => {
  // Muting speech must not suppress non-audio signals such as emotion, motion,
  // delay, or plugin calls that normally travel through the TTS session.
  if (speechMuted.value) {
    await playSpecialToken(special, { turnId: context.turnId })
    return
  }

  currentSession?.writeSpecial(special)
}))

chatHookCleanups.push(onStreamEnd(async () => {
  currentSession?.writeFlush()
}))

chatHookCleanups.push(onAssistantResponseEnd(async (_message) => {
  currentSession?.end()
  // The pipeline's `end()` is idempotent and ResourceMessages still arrive
  // after it, so the ref stays set until the next message replaces it.
  // Clearing here would race with the pipeline's own cleanup.
  // const res = await embed({
  //   ...transformersProvider.embed('Xenova/nomic-embed-text-v1'),
  //   input: message,
  // })

  // await db.value?.execute(`INSERT INTO memory_test (vec) VALUES (${JSON.stringify(res.embedding)});`)
}))

// Mid-session provider / voice / model swaps would otherwise keep feeding
// tokens to the OLD provider configuration. Cancel the active session so the
// next LLM token after the swap falls through `currentSession?.` cleanly
// (silent drop is acceptable — we don't try to fork-replay text into a new
// provider with a possibly different voice or model).
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

  else if (stageModelRenderer.value === 'tachie')
    return tachieSceneRef.value?.canvasElement()

  else if (stageModelRenderer.value === 'mmd')
    return mmdSceneRef.value?.canvasElement()
}

function readRenderTargetRegionAtClientPoint(clientX: number, clientY: number, radius: number) {
  if (stageModelRenderer.value !== 'vrm')
    return null

  return vrmViewerRef.value?.readRenderTargetRegionAtClientPoint?.(clientX, clientY, radius) ?? null
}

async function captureCharacterFrame() {
  if (stageModelRenderer.value === 'live2d')
    return live2dSceneRef.value?.captureFrame()
  if (stageModelRenderer.value === 'vrm')
    return vrmViewerRef.value?.captureFrame()
  if (stageModelRenderer.value === 'spine')
    return spineSceneRef.value?.captureFrame()
  if (stageModelRenderer.value === 'tachie')
    return tachieSceneRef.value?.captureFrame()
  if (stageModelRenderer.value === 'mmd')
    return mmdSceneRef.value?.captureFrame()
}

async function captureFrame() {
  const charBlob = await captureCharacterFrame()

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
  disposePlaybackStateHandler()
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
        @error="handleStageRenderError"
      />
      <ThreeScene
        v-if="stageModelRenderer === 'vrm' && showStage"
        ref="vrmViewerRef"
        v-model:state="componentState"
        min-w="50% <lg:full" min-h="100 sm:100" h-full w-full flex-1
        :model-id="stageModelSelected"
        :model-src="stageModelSelectedUrl"
        :cursor-position="cursorPosition"
        :idle-animation="animations.idleLoop.toString()"
        :paused="paused"
        :show-axes="stageViewControlsEnabled"
        :enable-orbit-controls="props.enableOrbitControls"
        :audio-context="audioContext"
        :current-audio-source="currentAudioSource"
        @error="console.error"
        @vrm-interact="onVRMInteract"
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
      <TachieScene
        v-if="stageModelRenderer === 'tachie' && showStage"
        ref="tachieSceneRef"
        v-model:state="componentState"
        min-w="50% <lg:full" min-h="100 sm:100"
        h-full w-full flex-1
        :model-src="stageModelSelectedUrl"
        :model-id="stageModelSelected"
        :paused="paused"
        :theme-colors-hue="themeColorsHue"
        :theme-colors-hue-dynamic="themeColorsHueDynamic"
        @error="console.error"
      />
      <MMDScene
        v-if="stageModelRenderer === 'mmd' && showStage"
        ref="mmdSceneRef"
        v-model:state="componentState"
        min-w="50% <lg:full" min-h="100 sm:100"
        h-full w-full flex-1
        :model-src="stageModelSelectedUrl"
        :model-id="stageModelSelected"
        :paused="paused"
        :cursor-position="cursorPosition"
        :enable-orbit-controls="props.enableOrbitControls"
        :audio-context="audioContext"
        :current-audio-source="currentAudioSource"
        @error="console.error"
      />
      <StageRenderError
        v-if="stageRenderError"
        :error="stageRenderError"
        renderer="Live2D"
        :model-id="stageModelSelected"
        @retry="retryStageRenderer"
      />
    </div>
  </div>
</template>

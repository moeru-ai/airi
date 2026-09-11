<script setup lang="ts">
import type { Live2DLipSync, Live2DLipSyncOptions } from '@proj-airi/model-driver-lipsync'
import type { Profile } from '@proj-airi/model-driver-lipsync/shared/wlipsync'
import type { CaptionChannelEvent } from '@proj-airi/stage-shared'
import type { VrmInteractionTarget } from '@proj-airi/stage-ui-three'
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'
import type { UnElevenLabsOptions } from 'unspeech'

import type { EmotionPayload } from '../../constants/emotions'
import type { BilingualPair, BilingualTurn } from '../../libs/bilingual/turn'
import type { VoiceInfo } from '../../libs/providers/types'
import type { SpeechTransport, StageTtsSession, StreamingSessionSnapshot } from '../../libs/speech/tts-session'

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
import { Callout } from '@proj-airi/ui'
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
import { useSparkTranslationChannel } from '../../composables/use-spark-translation-channel'
import { Emotion, EMOTION_EmotionMotionName_value, EMOTION_VRMExpressionName_value, EmotionThinkMotionName } from '../../constants/emotions'
import { live2dMotionMagicProfiles, useLive2DMotionMagic, useLive2DMotionMagicSettings } from '../../features/motions/live2d'
import { createBilingualTurn } from '../../libs/bilingual/turn'
import { getDefinedProvider } from '../../libs/providers/providers'
import { OFFICIAL_SPEECH_PROVIDER_ID, OFFICIAL_SPEECH_STREAMING_PROVIDER_ID } from '../../libs/providers/providers/official'
import { bindSpeakingStateToPlaybackManager } from '../../libs/speech/playback-speaking-state'
import { createStageTtsSession } from '../../libs/speech/tts-session'
import { getSpeechBusContext, speechOutputGetPlaybackState } from '../../services/speech/bus'
import { useLlmStreamingControlStore } from '../../stores/ai/chat-llm/streaming-control'
import { useAudioContext, useSpeakingStore } from '../../stores/audio'
import { useBackgroundStore } from '../../stores/background'
import { SPARK_TURN_ID_PREFIX } from '../../stores/character'
import { useChatStore } from '../../stores/chat'
import { useAiriCardStore } from '../../stores/modules'
import { useSpeechStore } from '../../stores/modules/speech'
import { useProviderConfigStore } from '../../stores/providers/config'
import { useProviderStore } from '../../stores/providers/provider'
import { useSettings } from '../../stores/settings'
import { useSettingsBilingual } from '../../stores/settings/bilingual'
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

const { getBilingualRequestSettings, onBeforeMessageComposed, onBeforeSend, onTokenLiteral, onTokenSpecial, onStreamEnd, onAssistantResponseEnd } = useChatStore()
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

/**
 * Classifies chat auto-TTS voice usage before forwarding analytics to the server.
 */
function resolveStageVoiceType(): 'official_selected' | 'custom_configured' {
  return activeSpeechProvider.value === OFFICIAL_SPEECH_PROVIDER_ID || activeSpeechProvider.value === OFFICIAL_SPEECH_STREAMING_PROVIDER_ID ? 'official_selected' : 'custom_configured'
}

// Declared ahead of the speech pipeline: its `tts` and `onStart` callbacks read
// the bilingual settings, and the pipeline is created immediately below.
const bilingualStore = useSettingsBilingual()

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
    // Multilingual engines (OpenAI-compatible) read the TTS language natively,
    // so only the per-language voice swap applies to the locale-picked providers.
    else {
      const bilingualVoice = bilingualVoiceForTurn(request.turnId)
      if (bilingualVoice)
        voice = bilingualVoice
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
        {
          trigger: 'auto',
          source: 'chat_auto_tts',
          voice_type: resolveStageVoiceType(),
        },
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

/**
 * Speech turns the pipeline has actually opened.
 *
 * A reaction that produced nothing to play never opens one, so it never gets an
 * `onTurnEnd` either. Its spark `turn-end` is then the only event left that can
 * release the voice the `turn` event reserved for it.
 */
const startedSpeechTurns = new Set<string>()

speechPipeline.on('onTurnStart', (turnId) => {
  if (turnId.startsWith(SPARK_TURN_ID_PREFIX))
    startedSpeechTurns.add(turnId)
})

speechPipeline.on('onTurnEnd', (turnId) => {
  streamingControl.completeTurn(turnId)

  // A reaction's voice outlives its stream: the text it handed over keeps being
  // spoken after the reaction stops producing output. The playback of this turn
  // is over now, so nothing can read that voice or its leftover queue again.
  if (turnId.startsWith(SPARK_TURN_ID_PREFIX)) {
    startedSpeechTurns.delete(turnId)
    clearBilingualTurn(turnId)
  }
})

speechPipeline.on('onTurnCancel', ({ turnId }) => {
  streamingControl.cancelTurn(turnId)

  // Same release as `onTurnEnd`: an abandoned reaction still holds the voice it
  // was composed with, and nothing reads it once its turn is gone.
  if (turnId.startsWith(SPARK_TURN_ID_PREFIX)) {
    startedSpeechTurns.delete(turnId)
    clearBilingualTurn(turnId)
  }
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
    // Show the translation that belongs to this very sentence, so the two
    // lines advance together instead of dumping the translation at once.
    if (bilingualStore.enabled) {
      const turnId = bilingualTurnOfItem(item)
      if (turnId)
        publishBilingualTranslation(turnId, item.text)
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

// One TTS session per LLM intent. The active provider determines which
// adapter `createStageTtsSession` returns: the segmenter-based adapter for
// every non-streaming provider, or the bidirectional WebSocket adapter
// for the official streaming provider. Stage.vue intentionally does NOT
// branch on provider id anywhere below — the factory is the single
// decision point. See `packages/stage-ui/src/libs/speech/tts-session.ts`.
let currentSession: StageTtsSession | null = null

// Bilingual subtitles. The parser owns one turn of model output and routes each
// language to a different consumer. The spoken language keeps the normal path
// through the TTS session; its translation is held back until playback reaches
// the sentence it belongs to, so the overlay shows both lines in step.
let bilingualTurn: BilingualTurn | null = null
/** Turn the chat hooks are currently feeding, so its items can be recognised. */
let bilingualTurnId = ''

/**
 * Everything the caption layer keeps for one turn.
 *
 * One record per turn because its parts share a lifetime: the sentences queued
 * for it, the voice it speaks with, and whether it is waiting for a translation
 * or buffers the whole reply into a single playback item all go together.
 */
interface BilingualTurnState {
  /**
   * Sentences the model has finished, in order, each paired with the translation
   * that followed it. Playback consumes one entry per spoken sentence.
   */
  pairs: BilingualPair[]
  /** Voice the turn synthesises with, `undefined` for the configured one. */
  voice?: VoiceInfo
  /** Set once the voice was chosen: a turn keeps the language it started with. */
  voiceChosen?: boolean
  /**
   * Provider the voice was picked from.
   *
   * A voice id only means something to the provider that listed it. The active
   * provider can change between the request and the synthesis, and replaying the
   * old id against the new one makes that provider drop the segment.
   */
  voiceProvider?: string
  /**
   * Streaming provider that buffers the whole reply into one playback item
   * (`bufferEntireSession`). Its `onStart` fires once for everything, so every
   * queued translation belongs to that item and has to be shown together.
   */
  buffered?: boolean
  /**
   * Playback started before this turn's translation was queued. The spoken text
   * reaches TTS before the pair closes, so the translation is published as soon
   * as it arrives instead of being dropped.
   */
  waiting?: boolean
  /**
   * Spoken text of the pair whose translation is on screen.
   *
   * The speech engine segments by punctuation while the parser pairs by language
   * switch, so one pair often covers several playback items. A fragment that no
   * longer matches a queued pair is a continuation of this sentence, not one
   * still waiting for its translation.
   */
  spokenOnScreen?: string
}

const bilingualTurns = new Map<string, BilingualTurnState>()
/**
 * Turn whose translation is on screen. Playback of another turn takes the line
 * over and clears it first, instead of leaving the previous turn's line up until
 * the new translation arrives.
 */
let bilingualTurnOnScreen = ''

/** State of one turn, created on first use. */
function bilingualTurnState(turnId: string): BilingualTurnState {
  const state = bilingualTurns.get(turnId) ?? { pairs: [] }
  bilingualTurns.set(turnId, state)
  return state
}

/** Drops everything recorded for one turn. */
function clearBilingualTurn(turnId: string) {
  bilingualTurns.delete(turnId)
}

/** Queues a finished sentence pair and publishes it if playback is waiting. */
function queueBilingualPair(turnId: string, pair: BilingualPair) {
  // The feature can be switched off mid-reply. Speech keeps running so the
  // language tags are still stripped, but nothing more is captioned.
  if (!bilingualStore.enabled)
    return

  const state = bilingualTurnState(turnId)
  state.pairs.push(pair)

  // Playback may already have started while this pair was still open.
  if (state.waiting)
    publishBilingualTranslation(turnId)
}

/** Publishes one caption event, tolerating a channel that is already closed. */
function postCaptionSafely(event: CaptionChannelEvent) {
  try {
    postCaption(event)
  }
  catch {
    // BroadcastChannel may be closed - don't break playback
  }
}

function clearBilingualTranslation() {
  postCaptionSafely({ type: 'caption-assistant-translation', text: '' })
}

function resetBilingualTurn(turnId: string) {
  bilingualTurn = null
  // A new turn arrives with its own id, so the turn that just ended is keyed by
  // the previous one: clearing only the new id leaves every finished turn in
  // the map for the life of the session.
  clearBilingualTurn(bilingualTurnId)
  clearBilingualTurn(turnId)
  bilingualTurnId = turnId
  clearBilingualTranslation()
}

/**
 * Turn a playback item reads its translation from, or '' when it has none.
 *
 * A spark reaction plays as its own turn, so it belongs to the pairs its window
 * broadcast. Anything else is a chat item and only belongs to the turn the chat
 * hooks are feeding — an interrupting intent must not consume a translation
 * queued for a sentence still being spoken.
 *
 * A turn that never queued anything has nothing to consume either, which is why
 * an unrecognised item reports no turn.
 */
function bilingualTurnOfItem(item: { turnId?: string }): string {
  if (item.turnId?.startsWith(SPARK_TURN_ID_PREFIX))
    return item.turnId

  if (!bilingualTurnId)
    return ''

  if (!item.turnId)
    return bilingualTurnId

  return item.turnId === bilingualTurnId ? item.turnId : ''
}

/**
 * Index of the pair whose spoken text a playback item is reading.
 *
 * The parser pairs by language switch while the speech engine segments by
 * punctuation, so the two rarely line up one to one: one pair can cover several
 * playback items, and one item can be a fragment of a pair. Matching on the
 * text keeps the translation on the sentence actually being spoken instead of
 * trusting the queue to be in the same order.
 */
function findBilingualPairIndex(pairs: BilingualPair[], itemText: string): number {
  const spoken = itemText.trim()
  if (!spoken)
    return -1

  return pairs.findIndex((pair) => {
    const candidate = pair.spoken.trim()
    if (!candidate)
      return false

    return candidate === spoken || candidate.includes(spoken) || spoken.includes(candidate)
  })
}

/**
 * Whether a playback item is a piece of the sentence already on screen.
 *
 * The speech engine splits one sentence into several items, so the item after the
 * first matches nothing left in the queue. Matching it against the sentence on
 * screen keeps it from being mistaken for one still waiting to be paired.
 */
function isFragmentOfSpokenOnScreen(sentence: string | undefined, itemText: string): boolean {
  const spoken = (sentence ?? '').trim()
  const fragment = itemText.trim()
  if (!spoken || !fragment)
    return false

  return spoken === fragment || spoken.includes(fragment) || fragment.includes(spoken)
}

/**
 * Shows the translation of the sentence playback just started. It replaces the
 * previous line so the two lines stay paired sentence by sentence instead of
 * dumping the whole translation at once.
 */
function publishBilingualTranslation(turnId: string, itemText?: string) {
  // Playback moved to another turn: the line on screen belongs to the turn it
  // left, so it goes now. A reaction speaks before its translation arrives, and
  // the previous line would otherwise stay up through the new speech.
  if (turnId !== bilingualTurnOnScreen) {
    // Nothing queued for the turn playback just left can be shown any more, and
    // the next transfer only clears whichever turn it finds on screen — this
    // one — so a record left behind is never reachable again. A spark turn that
    // stayed in the map while a chat turn played would otherwise survive every
    // later transfer, one more entry per alternation.
    if (bilingualTurnOnScreen)
      clearBilingualTurn(bilingualTurnOnScreen)
    bilingualTurnOnScreen = turnId
    clearBilingualTranslation()
  }

  const state = bilingualTurns.get(turnId)

  if (!state?.pairs.length) {
    // The spoken text reaches TTS before its translation closes, so playback
    // can start with an empty queue. Wait for the pair instead of dropping it.
    bilingualTurnState(turnId).waiting = true
    return
  }

  if (itemText) {
    const index = findBilingualPairIndex(state.pairs, itemText)

    if (index < 0) {
      // A fragment of the sentence already on screen: its translation is up
      // there and this item is only the rest of it being spoken. Waiting here
      // would publish the *next* sentence's translation as soon as that pair
      // closes, while the fragments of this one are still playing.
      if (isFragmentOfSpokenOnScreen(state.spokenOnScreen, itemText))
        return

      // The pair it belongs to has not closed yet. Wait for that pair instead of
      // pairing this sentence with a translation of another one.
      state.waiting = true
      return
    }

    // Pairs the playback already passed are dropped rather than shown late.
    if (index > 0)
      state.pairs.splice(0, index)
  }

  state.waiting = false

  // A buffered session emits a single playback item for the whole reply, so
  // every queued translation belongs to this one item. Taking only the first
  // would drop the rest when the next turn clears the queue.
  const consumed = state.pairs.splice(0, state.buffered ? state.pairs.length : 1)
  // Kept so the fragments this pair gets split into can be told apart from a
  // sentence whose translation has not arrived yet.
  state.spokenOnScreen = consumed.map(pair => pair.spoken).filter(Boolean).join(' ')
  const text = consumed.map(pair => pair.translation).filter(Boolean).join(' ')
  if (!text)
    return

  // Both lines are published together and from the same pairs. The spoken line
  // replaces itself as well: `onStart` appends it, so leaving it alone stacks
  // every sentence spoken inside the caption's window under the single
  // translation that replaced itself.
  //
  // Publishing it here rather than replacing it in `onStart` keeps a reply the
  // model never tagged on the normal append path — with no pair to consume,
  // there is nothing to pair the line with.
  const spoken = consumed.map(pair => pair.spoken).filter(Boolean).join(' ')
  if (spoken)
    postCaptionSafely({ operation: 'replace', type: 'caption-assistant', text: spoken })

  postCaptionSafely({
    operation: 'replace',
    type: 'caption-assistant-translation',
    label: consumed.at(-1)?.label ?? '',
    text,
  })
}

/**
 * Splits one chat turn's output into spoken text and sentence pairs.
 *
 * The spoken language keeps the normal path into the TTS session; each pair is
 * queued for playback to publish. The turn they belong to is the one the chat
 * hooks were reset with, which is also what playback items are matched against.
 */
function openBilingualTurn(turnId: string): BilingualTurn | null {
  // The languages come from the request that asked for the reply, not from the
  // settings in effect now: this runs after the prompt was composed and after an
  // await, so a change made in between would split — and below, speak — a
  // language the model was never asked for.
  const request = getBilingualRequestSettings()
  if (!request?.instructed)
    return null

  return createBilingualTurn({
    languages: request.languages,
    ttsLanguage: request.ttsLanguage,
    onSpoken: text => currentSession?.appendText(text),
    onPair: pair => queueBilingualPair(turnId, pair),
  })
}

const { data: sparkPair } = useSparkTranslationChannel()

// A reaction is split in the window that ran the model and spoken by the one
// hosting the speech pipeline. What that window produces arrives here in order:
// the language the reaction speaks, then its sentence pairs, which join the same
// queue a chat turn's pairs go into.
watch(sparkPair, (event) => {
  if (!event)
    return

  if (event.kind === 'turn') {
    seedBilingualVoice(event.turnId, event.ttsLanguage)
    return
  }

  // The reaction stopped producing output, not speech: the text it already
  // handed over is still being spoken, and an empty queue says nothing about
  // that — pairs are dropped the moment the feature is switched off while the
  // speech keeps running. So a turn that opened a speech turn keeps its record
  // until `onTurnEnd` releases it.
  //
  // One that never opened a speech turn produced nothing to play, so no
  // `onTurnEnd` will ever arrive for it and this is the last event that can
  // release the voice its `turn` reserved.
  if (event.kind === 'turn-end') {
    if (!startedSpeechTurns.has(event.turnId) && !bilingualTurns.get(event.turnId)?.pairs.length)
      clearBilingualTurn(event.turnId)
    return
  }

  // A reaction interrupts whatever is on screen, so the previous reaction's line
  // and its leftover queue go instead of lingering until they expire.
  if (event.turnId !== bilingualTurnOnScreen) {
    clearBilingualTurn(bilingualTurnOnScreen)
    bilingualTurnOnScreen = event.turnId
    clearBilingualTranslation()
  }

  queueBilingualPair(event.turnId, event)
})

// Switching the feature off mid-reply has to remove the translated line at
// once, rather than leaving it until the next message or its expiry.
//
// The in-flight parser is deliberately kept. The model is still replying with
// language tags, and dropping the parser here would feed those tags straight
// into the speech engine.
watch(() => bilingualStore.enabled, (enabled) => {
  if (enabled)
    return

  clearBilingualTranslation()
})

/**
 * Voice that speaks `ttsLanguage`, or `undefined` when none does.
 *
 * The speech settings hold one fixed voice, auto-picked from the UI locale. That
 * voice would read a non-UI language with the wrong phonology — a Chinese voice
 * reads Japanese kanji as Chinese, for example, which is exactly the "reads
 * Japanese with Chinese mixed in" symptom — so the active provider's catalogue is
 * searched for one that speaks the language, matched by code prefix (`ja` →
 * `ja-JP`).
 *
 * A configured voice that already speaks it is returned untouched: replacing it
 * with the first catalogue match would change the character's voice even though
 * the configuration is valid. No match is a provider limitation, not a
 * regression, and `undefined` means the caller keeps the configured voice.
 */
function resolveBilingualVoiceFor(ttsLanguage: string): VoiceInfo | undefined {
  const speaksTtsLanguage = (voice: VoiceInfo) => (voice.languages || []).some(l => l.code.toLowerCase().startsWith(ttsLanguage))

  if (activeSpeechVoice.value && speaksTtsLanguage(activeSpeechVoice.value))
    return activeSpeechVoice.value

  const providerVoices = speechStore.availableVoices[activeSpeechProvider.value] || []
  return providerVoices.find(voice => speaksTtsLanguage(voice))
}

/**
 * Voice one turn synthesises with, or `undefined` for the configured one.
 *
 * A turn speaks the language its split started with, so its voice has to stay
 * put: resolving again per segment would give the rest of a reply a different
 * voice — or a different language — as soon as the settings change. A reaction
 * is seeded when its request is composed, a chat turn when its session opens,
 * and a request without a turn asks the settings themselves.
 */
/**
 * Voice a turn kept from the request that composed it, or `undefined` when it has
 * none — or when the provider that voice was picked from is no longer the active
 * one, which leaves its id meaningless to the provider that would synthesise it.
 * A turn whose provider moved on re-resolves instead: keeping the language is
 * worth nothing if the request is dropped.
 */
function keptBilingualVoice(turnId: string): VoiceInfo | undefined {
  const state = bilingualTurns.get(turnId)
  if (!state?.voiceChosen || state.voiceProvider !== activeSpeechProvider.value)
    return undefined

  return state.voice
}

function bilingualVoiceForTurn(turnId: string | undefined): VoiceInfo | undefined {
  if (!turnId)
    return bilingualStore.enabled ? resolveBilingualVoiceFor(bilingualStore.ttsLanguage) : undefined

  const state = bilingualTurnState(turnId)

  // A decision that still stands is honoured as it was made, including the one
  // to keep the configured voice: a provider may simply list no voice for the
  // language. Re-resolving here would read that `undefined` as missing and
  // follow a later settings change for every remaining segment.
  if (state.voiceChosen && state.voiceProvider === activeSpeechProvider.value)
    return state.voice

  return seedBilingualVoice(turnId, bilingualStore.enabled ? bilingualStore.ttsLanguage : undefined)
}

/**
 * Records the voice a turn plays with, from the language its request asked for:
 * `undefined` keeps the configured voice.
 *
 * The window that composes a reaction is the only one that knows that language,
 * so it hands it over. Resolving from the settings there instead would follow a
 * change made while the model was still thinking, and read the reply in another
 * language.
 */
function seedBilingualVoice(turnId: string, ttsLanguage?: string): VoiceInfo | undefined {
  const state = bilingualTurnState(turnId)
  state.voice = ttsLanguage ? resolveBilingualVoiceFor(ttsLanguage) : undefined
  state.voiceChosen = true
  state.voiceProvider = activeSpeechProvider.value
  return state.voice
}

function stopSpeechOutput(reason: string) {
  currentSession?.cancel(reason)
  currentSession = null
  speechPipeline.stopAll(reason)
  playbackManager.stopAll(reason)
  resetAssistantSpeechSurface(reason)
}

/**
 * Resolves the official streaming TTS model for the current Stage session.
 */
function resolveStreamingSessionModel(): string | null {
  const activeModel = activeSpeechModel.value as string | undefined
  const sessionModel = activeModel?.includes('/')
    ? activeModel
    : providersStore.getDefaultModelForProvider(OFFICIAL_SPEECH_STREAMING_PROVIDER_ID)
  if (!sessionModel?.includes('/'))
    return null
  return sessionModel
}

function buildStreamingSnapshot(turnId: string): StreamingSessionSnapshot | null {
  if (speechMuted.value)
    return null

  // Snapshotted once per session, so a mid-session provider/voice swap
  // does not corrupt an in-flight session — the watcher below detects
  // changes and tears down explicitly. Returns `null` when streaming
  // can't be opened (no voice picked, no audioContext, no model);
  // `createStageTtsSession` falls back to the segmenter adapter in that
  // case, which is the right behaviour for the rest of the providers too.
  // When bilingual output is on, prefer a voice that actually speaks the TTS
  // language so Japanese (etc.) is not read with the locale-picked voice's
  // phonology — see `resolveBilingualVoiceFor`. The session reads the voice its
  // turn was opened with, so a later settings change cannot swap it mid-turn.
  const voiceId = keptBilingualVoice(turnId)?.id || activeSpeechVoice.value?.id
  if (!voiceId)
    return null
  // Resolve the concrete streaming model id. The active speech model is only
  // valid here when it carries the `<backend>/<api_resource_id>` shape the ws
  // upstream expects — the HTTP TTS `auto` alias (and an empty selection after
  // a provider switch) must NOT reach the bridge, so fall back to the
  // server-curated default instead of a hardcoded id. Returns null (segmenter
  // fallback) when neither resolves, rather than guessing a resource id.
  const sessionModel = resolveStreamingSessionModel()
  if (!sessionModel)
    return null
  const apiResourceId = sessionModel.split('/', 2)[1]
  // TTS 2.0 / ICL 2.0 ship subtitles asynchronously relative to audio
  // (per the wire spec), so chunk-on-sentence-end would drop frames.
  // Buffer the entire session and decode at session.finished instead.
  const bufferEntireSession = apiResourceId.startsWith('seed-tts-2.0') || apiResourceId.startsWith('seed-icl-2.0')
  if (bufferEntireSession)
    bilingualTurnState(turnId).buffered = true
  return {
    model: sessionModel,
    voice: voiceId,
    voiceType: resolveStageVoiceType(),
    bufferEntireSession,
    extraBody: {
      api_resource_id: apiResourceId,
      audio: { sample_rate: 24000, bit_rate: 64000 },
    },
    ownerId: activeCardId.value,
    onImmediateSpecial: special => playSpecialToken(special, { turnId }),
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

function openTtsSession(turnId: string): StageTtsSession {
  // A turn speaks one language from here to its end — the one its request asked
  // for — so its voice is fixed at the same moment, before any audio is asked
  // for. Resolving it per segment instead would follow a settings change made
  // mid-reply and give the rest of the turn a voice for another language, and
  // resolving it from the settings while the turn is being set up would do the
  // same to the language the split speaks.
  const request = getBilingualRequestSettings()
  seedBilingualVoice(turnId, request?.instructed ? request.ttsLanguage : undefined)

  // A session must only clear the module-level `currentSession` if it IS that session. The previous
  // code cleared it whenever any `stream-` session completed, which is unsafe once sessions exist that
  // are not assigned to `currentSession` (e.g. one-off read-aloud sessions): one of those finishing
  // would null a still-active chat session and drop the rest of the reply. Capture the session and
  // compare identity; the `stream-` guard is preserved so segmenter sessions still don't self-clear.
  let session: StageTtsSession | null = null
  const clearIfActive = () => {
    if (session && currentSession === session && session.intentId.startsWith('stream-'))
      currentSession = null
  }
  session = createStageTtsSession<AudioBuffer>({
    transport: resolveSpeechTransport(activeSpeechProvider.value),
    streaming: () => buildStreamingSnapshot(turnId),
    audioContext,
    playbackManager,
    openIntent: opts => speechRuntimeStore.openIntent(opts),
    intentOptions: () => ({
      turnId,
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
        // Drop the failed session so no further audio is queued, but let the
        // playback manager keep draining already-queued audio and emit its own
        // terminal events. Calling resetSpeakingState() here would force the
        // mouth shut while audio is still playing.
        clearIfActive()
      },
      onDone: () => {
        clearIfActive()
      },
    },
  })
  return session
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
  resetBilingualTurn(context.turnId)

  currentSession?.cancel('new-message')
  currentSession = null

  if (speechMuted.value)
    return

  setupAnalyser()
  await setupLipSync()
  currentSession = openTtsSession(context.turnId)
  bilingualTurn = openBilingualTurn(context.turnId)
}))

chatHookCleanups.push(onBeforeSend(async () => {
  currentMotion.value = { group: EmotionThinkMotionName }
}))

chatHookCleanups.push(onTokenLiteral(async (literal) => {
  // While bilingual output is on, the turn decides what reaches the speech
  // engine: only the spoken language, with the language tags stripped.
  if (bilingualTurn) {
    bilingualTurn.push(literal)
    return
  }

  currentSession?.appendText(literal)
}))

chatHookCleanups.push(onTokenSpecial(async (special, context) => {
  // Muting speech must not suppress non-audio signals such as emotion, motion,
  // delay, or plugin calls that normally travel through the TTS session.
  if (speechMuted.value) {
    await playSpecialToken(special, { turnId: context.turnId })
    return
  }

  currentSession?.appendSpecial(special)
}))

chatHookCleanups.push(onStreamEnd(async () => {
  // Closes the trailing sentence, so its pair is queued too.
  bilingualTurn?.end()
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

<script setup lang="ts">
import type { Live2DLipSync, Live2DLipSyncOptions } from '@proj-airi/model-driver-lipsync'
import type { Profile } from '@proj-airi/model-driver-lipsync/shared/wlipsync'
import type { CaptionChannelEvent, PresenceBubbleState } from '@proj-airi/stage-shared'
import type { VrmInteractionTarget } from '@proj-airi/stage-ui-three'

import type { EmotionPayload } from '../../constants/emotions'

import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom, sleep } from '@moeru/std'
import { BrowserPlayback } from '@proj-airi/audio/browser'
import { createLive2DLipSync } from '@proj-airi/model-driver-lipsync'
import { wlipsyncProfile } from '@proj-airi/model-driver-lipsync/shared/wlipsync'
import { normalizeActPayload, Playback } from '@proj-airi/pipelines-audio'
import { presenceBubbleIdle, presenceBubbleThinking } from '@proj-airi/stage-shared'
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
import { Emotion, EMOTION_EmotionMotionName_value, EMOTION_VRMExpressionName_value, EmotionThinkMotionName } from '../../constants/emotions'
import { live2dMotionMagicProfiles, useLive2DMotionMagic, useLive2DMotionMagicSettings } from '../../features/motions/live2d'
import { getSpeechBusContext, speechOutputGetPlaybackState } from '../../services/speech/bus'
import { useLlmStreamingControlStore } from '../../stores/ai/chat-llm/streaming-control'
import { useAudioContext, useSpeakingStore } from '../../stores/audio'
import { useBackgroundStore } from '../../stores/background'
import { useChatStore } from '../../stores/chat'
import { useChatSessionStore } from '../../stores/chat/session-store'
import { useAiriCardStore } from '../../stores/modules/airi-card'
import { useSpeechStore } from '../../stores/modules/speech'
import { useSettingsPresenceBubble } from '../../stores/presence-bubble'
import { useSettings } from '../../stores/settings'
import { useSpeechOutputControlStore } from '../../stores/speech-output-control'
import { useVoiceStore } from '../../stores/voice'

const props = withDefaults(defineProps<{
  cursorPosition?: { x: number, y: number }
  enableOrbitControls?: boolean
  paused?: boolean
}>(), {
  enableOrbitControls: true,
  paused: false,
})

const emit = defineEmits<{ error: [error: Error] }>()
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
const { speechMuted } = storeToRefs(speechOutputControlStore)
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

const live2dStore = useLive2dParams()
const showStage = ref(true)
const stageRenderError = shallowRef<Error>()
const viewUpdateCleanups: Array<() => void> = []

function handleStageRenderError(error: Error) {
  stageRenderError.value = error
  emit('error', error)
}

function reportStageRenderError(error: unknown) {
  console.error(error)
  handleStageRenderError(new Error(errorMessageFrom(error) ?? 'Failed to render stage'))
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

const { sending: chatSending } = storeToRefs(useChatStore())
const { presenceOverride } = storeToRefs(useSettingsPresenceBubble())

// `sending` is raised before the request leaves and cleared once the send
// settles, which is the span the character has nothing to say yet.
//
// Unread stays at zero: nothing reports whether the chat window is showing, so
// there is no read cursor to count against.
const chatPresence = computed<PresenceBubbleState>(() => chatSending.value ? presenceBubbleThinking : presenceBubbleIdle)
const presenceBubble = computed<PresenceBubbleState>(() => presenceOverride.value ?? chatPresence.value)
const speechStore = useSpeechStore()
const chatSession = useChatSessionStore()
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

const voice = useVoiceStore()
const speechDestination = audioContext.createGain()
speechDestination.connect(audioContext.destination)
const playback = new Playback(new BrowserPlayback(audioContext, {
  destination: speechDestination,
  onSource: (source) => { currentAudioSource.value = source },
}))
let playingCount = 0

function resetSpeakingState() {
  nowSpeaking.value = false
  mouthOpenSize.value = 0
}

const cards = useAiriCardStore()
const disconnectVoiceOutput = voice.connectOutput((turn) => {
  const output = {
    playback,
    onSpecial: (special: string) => void playSpecialToken(special, { turnId: turn.turnId }),
    onPlaybackStart: ({ text }: { text: string }) => {
      playingCount += 1
      nowSpeaking.value = true
      assistantCaption.value += ` ${text}`
      try {
        postCaption({ type: 'caption-assistant', text })
        postPresent({ type: 'assistant-append', text })
      }
      catch (error) {
        console.error('Speech presentation channel failed', error)
      }
    },
    onPlaybackEnd: () => {
      playingCount -= 1
      if (playingCount === 0)
        resetSpeakingState()
    },
  }
  if (speechMuted.value)
    return { ...output, synthesize: async () => null }
  try {
    const characterId = chatSession.sessionMetas[turn.sessionId]?.characterId
    if (!characterId)
      throw new Error('The response session has no character')
    return speechStore.createOutput(turn, cards.getModules(characterId).speech, output, audioContext)
  }
  catch (error) {
    // Text replies remain available when optional speech output is not configured.
    console.error('Speech output is unavailable', error)
    return { ...output, synthesize: async () => null }
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
    speechDestination.connect(lipSync.node)
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
    speechDestination.connect(audioAnalyser.value)
  }
}

watch(speechMuted, (muted) => {
  if (muted) {
    for (const turn of voice.activeTurns)
      voice.getSpeech(turn)?.cancel('Speech muted')
  }
})

chatHookCleanups.push(onBeforeMessageComposed(async (_message, context) => {
  voice.startResponse(context)
  if (context.sessionId === chatSession.activeSessionId)
    resetAssistantSpeechSurface('new-message')
  setupAnalyser()
  await setupLipSync()
}))

chatHookCleanups.push(onBeforeSend(async () => {
  currentMotion.value = { group: EmotionThinkMotionName }
}))

chatHookCleanups.push(onTokenLiteral(async (literal, context) => {
  if (!speechMuted.value)
    await voice.getSpeech(context)?.write(literal)
}))

chatHookCleanups.push(onTokenSpecial(async (special, context) => {
  if (speechMuted.value)
    await playSpecialToken(special, { turnId: context.turnId })
  else
    voice.getSpeech(context)?.special(special)
}))

chatHookCleanups.push(onStreamEnd(async (context) => {
  void voice.finishResponse(context).catch(error => console.error('Speech response completion failed', error))
}))

chatHookCleanups.push(onAssistantResponseEnd(async (_message, context) => {
  void voice.finishResponse(context).catch(error => console.error('Speech response completion failed', error))
}))

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

onUnmounted(() => {
  disposePlaybackStateHandler()
  resetLive2dLipSync()
  chatHookCleanups.forEach(dispose => dispose?.())
  viewUpdateCleanups.forEach(dispose => dispose?.())
  disconnectVoiceOutput()
  speechDestination.disconnect()
})

defineExpose({
  canvasElement,
  /**
   * The frame already carries the scene: every renderer paints it into the canvas it
   * draws to, so what comes back is the whole picture.
   */
  captureFrame: captureCharacterFrame,
  readRenderTargetRegionAtClientPoint,
  setExpression: async (expression: string, intensity = 1) => {
    if (stageModelRenderer.value === 'vrm') {
      await vrmViewerRef.value?.setExpression(expression, intensity)
    }
  },
})
</script>

<template>
  <div relative h-full w-full>
    <div relative h-full w-full>
      <Live2DScene
        v-if="stageModelRenderer === 'live2d' && showStage"
        ref="live2dSceneRef"
        v-model:state="componentState"
        :presence="presenceBubble"
        min-w="50% <lg:full"
        h-full w-full flex-1
        :model-src="stageModelSelectedUrl"
        :model-id="stageModelSelected"
        :background-url="activeBackgroundUrl"
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
        :presence="presenceBubble"
        :background-url="activeBackgroundUrl"
        min-w="50% <lg:full" h-full w-full flex-1
        :model-id="stageModelSelected"
        :model-src="stageModelSelectedUrl"
        :cursor-position="cursorPosition"
        :idle-animation="animations.idleLoop.toString()"
        :paused="paused"
        :show-axes="stageViewControlsEnabled"
        :enable-orbit-controls="props.enableOrbitControls"
        :audio-context="audioContext"
        :current-audio-source="currentAudioSource"
        @error="reportStageRenderError"
        @vrm-interact="onVRMInteract"
      />
      <SpineScene
        v-if="stageModelRenderer === 'spine' && showStage"
        ref="spineSceneRef"
        v-model:state="componentState"
        :background-url="activeBackgroundUrl"
        min-w="50% <lg:full"
        h-full w-full flex-1
        :model-src="stageModelSelectedUrl"
        :model-id="stageModelSelected"
        :paused="paused"
        :premultiplied-alpha="spinePremultipliedAlpha"
        :default-mix-duration="spineDefaultMixDuration"
        :idle-animation-enabled="spineIdleAnimationEnabled"
        :max-fps="spineMaxFps"
        :render-scale="spineRenderScale"
        @error="reportStageRenderError"
      />
      <TachieScene
        v-if="stageModelRenderer === 'tachie' && showStage"
        ref="tachieSceneRef"
        v-model:state="componentState"
        :background-url="activeBackgroundUrl"
        min-w="50% <lg:full"
        h-full w-full flex-1
        :model-src="stageModelSelectedUrl"
        :model-id="stageModelSelected"
        :paused="paused"
        :theme-colors-hue="themeColorsHue"
        :theme-colors-hue-dynamic="themeColorsHueDynamic"
        @error="reportStageRenderError"
      />
      <MMDScene
        v-if="stageModelRenderer === 'mmd' && showStage"
        ref="mmdSceneRef"
        v-model:state="componentState"
        :background-url="activeBackgroundUrl"
        min-w="50% <lg:full"
        h-full w-full flex-1
        :model-src="stageModelSelectedUrl"
        :model-id="stageModelSelected"
        :paused="paused"
        :cursor-position="cursorPosition"
        :enable-orbit-controls="props.enableOrbitControls"
        :audio-context="audioContext"
        :current-audio-source="currentAudioSource"
        @error="reportStageRenderError"
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
        :renderer="stageModelRenderer === 'live2d' ? 'Live2D' : stageModelRenderer ?? 'Model'"
        :model-id="stageModelSelected"
        @retry="retryStageRenderer"
      />
    </div>
  </div>
</template>

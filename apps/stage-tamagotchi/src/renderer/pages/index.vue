<script setup lang="ts">
import type { CaptionChannelEvent, HearingInputChannelEvent } from '@proj-airi/stage-shared'
import type { ModelSettingsRuntimeSnapshot } from '@proj-airi/stage-ui/components/scenarios/settings/model-settings/runtime'

import workletUrl from '@proj-airi/stage-ui/workers/vad/process.worklet?worker&url'

import { errorMessageFrom, tryCatch } from '@moeru/std'
import { electron } from '@proj-airi/electron-eventa'
import {
  useElectronEventaInvoke,
  useElectronMouseAroundWindowBorder,
  useElectronMouseInElement,
  useElectronMouseInWindow,
  useElectronRelativeMouse,
} from '@proj-airi/electron-vueuse'
import { createTranscriptBuffer } from '@proj-airi/pipelines-audio'
import { hearingInputChannelName } from '@proj-airi/stage-shared'
import { useExpressionStore } from '@proj-airi/stage-ui-live2d/stores/expression-store'
import { useModelStore, useThreeSceneIsTransparentAtPoint } from '@proj-airi/stage-ui-three'
import { HearingStatus, HoloCoupon } from '@proj-airi/stage-ui/components'
import {
  createEmptyModelSettingsRuntimeSnapshot,
  resolveComponentStateToRuntimePhase,
} from '@proj-airi/stage-ui/components/scenarios/settings/model-settings/runtime'
import { WidgetStage } from '@proj-airi/stage-ui/components/scenes'
import { useVoiceInputSession } from '@proj-airi/stage-ui/composables'
import { useCanvasPixelIsTransparentAtPoint } from '@proj-airi/stage-ui/composables/canvas-alpha'
import { KeywordListener } from '@proj-airi/stage-ui/libs/keyword-listener'
import { getKwsVocabulary, loadKwsModel } from '@proj-airi/stage-ui/libs/kws-model'
import { resolveWakeWordKeywords, supportedWakeWordKeywords } from '@proj-airi/stage-ui/services/wake-words'
import { useSpeakingStore } from '@proj-airi/stage-ui/stores/audio'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useHearingSpeechInputPipeline, useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useOnboardingStore } from '@proj-airi/stage-ui/stores/onboarding'
import { useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { useSpeechOutputControlStore } from '@proj-airi/stage-ui/stores/speech-output-control'
import { refDebounced, useBroadcastChannel } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, shallowRef, toRef, watch } from 'vue'
import { toast } from 'vue-sonner'

import AuthStatusIsland from '../components/stage-islands/auth-status-island.vue'
import ControlsIslandRoot from '../components/stage-islands/controls-island/controls-island-root.vue'
import ControlsIsland from '../components/stage-islands/controls-island/index.vue'
import ResourceStatusIsland from '../components/stage-islands/resource-status-island/index.vue'

import { electronOpenOnboarding } from '../../shared/eventa'
import { useModelSettingsRuntimeOwner } from '../composables/model-settings-runtime-owner'
import { useDesktopPushToTalk } from '../composables/use-desktop-push-to-talk'
import { useScreenAmbientLight } from '../composables/use-screen-ambient-light'
import { stageOpaqueAttribute } from '../composables/use-stage-painted-mask'
import { useVoiceInlay } from '../composables/use-voice-inlay'
import { useControlsIslandStore } from '../stores/controls-island'
import { useStageWindowLifecycleStore } from '../stores/stage-window-lifecycle'
import { useVoiceInlayStore } from '../stores/voice-inlay'
import { resolveFadeOnHoverInteraction } from '../utils/fade-on-hover'
import { shouldSampleStageTransparency } from '../utils/stage-three-transparency'
import { createVoiceInputInteractionLifecycle } from '../utils/voice-input-lifecycle'
import {
  assistantSpeechCooldownDeadline,
  DEFAULT_ASSISTANT_SPEECH_INPUT_COOLDOWN_MS,
  shouldSuppressVoiceInput,
} from '../utils/voice-input-suppression'

const hearingStatusElement = ref<HTMLElement>()
const authStatusElement = ref<HTMLElement>()
const { isOutside: outsideHearingStatus } = useElectronMouseInElement(hearingStatusElement)
const { isOutside: outsideAuthStatus } = useElectronMouseInElement(authStatusElement)
const controlsIslandRef = ref<InstanceType<typeof ControlsIsland>>()
const controlsIslandInteractionActive = shallowRef(false)
const widgetStageRef = ref<InstanceType<typeof WidgetStage>>()
// The stage canvas alpha tells the sampler which pixels of the window AIRI
// paints, so it can read the desktop showing through behind the character.
useScreenAmbientLight({ stageCanvas: () => widgetStageRef.value?.canvasElement() })
const stageCanvas = toRef(() => widgetStageRef.value?.canvasElement())
const componentStateStage = ref<'pending' | 'loading' | 'mounted'>('pending')
const stageMounted = computed(() => componentStateStage.value === 'mounted')
const isLoading = computed(() => !stageMounted.value)

const isIgnoringMouseEvents = ref(false)
const shouldFadeOnCursorWithin = ref(false)

const onboardingStore = useOnboardingStore()
const openOnboarding = useElectronEventaInvoke(electronOpenOnboarding)

const { isOutside: isOutsideWindow } = useElectronMouseInWindow()
// The island already pairs its cursor signal with a DOM one and owns that decision, so
// read its answer rather than mounting a second set of listeners over the same element.
const isOutside = computed(() => controlsIslandRef.value?.isOutside ?? true)
const isOutsideFor250Ms = refDebounced(isOutside, 250)
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
const isTransparentByPixelsExact = useCanvasPixelIsTransparentAtPoint(
  stageCanvas,
  relativeMouseX,
  relativeMouseY,
)
const isTransparentByThreeExact = useThreeSceneIsTransparentAtPoint(
  widgetStageRef,
  relativeMouseX,
  relativeMouseY,
)

const settingsStore = useSettings()
const { alwaysOnTop, stageModelRenderer, stageModelSelectedUrl } = storeToRefs(settingsStore)
const modelStore = useModelStore()
const expressionStore = useExpressionStore()
const { sceneMutationLocked, scenePhase } = storeToRefs(modelStore)
const { stagePaused } = storeToRefs(useStageWindowLifecycleStore())
const { fadeOnHoverEnabled } = storeToRefs(useControlsIslandStore())
const modelSettingsRuntimeOwnerInstanceId = `tamagotchi-main-stage:${Math.random().toString(36).slice(2, 10)}`
const shouldUseThreeTransparencyHitTest = computed(() => shouldSampleStageTransparency({
  componentState: componentStateStage.value,
  stageModelRenderer: stageModelRenderer.value,
  stagePaused: stagePaused.value,
}))
/**
 * Drives the Auto Hide fade. `true` means "do not fade", so any case without a usable
 * region sampler reports `true` and the stage stays visible.
 */
const isTransparent = computed(() => {
  if (stagePaused.value || componentStateStage.value !== 'mounted' || !fadeOnHoverEnabled.value)
    return true

  // TresCanvas leaves preserveDrawingBuffer off, so VRM's canvas reads back empty and
  // has to sample an offscreen render target. Every other renderer keeps its last frame
  // readable, and a renderer with no canvas samples nothing and stays visible.
  if (stageModelRenderer.value === 'vrm')
    return shouldUseThreeTransparencyHitTest.value ? isTransparentByThree.value : true

  return isTransparentByPixels.value
})
/**
 * Whether the cursor sits on the stage canvas rather than on interface drawn over it.
 *
 * The pixel test can only answer for the canvas, and the canvas draws nothing beneath a
 * DOM overlay, so a button, a toast or a portaled panel floating over blank canvas
 * would read as empty space and lose its clicks. Ask the document what is really under
 * the cursor instead. This is a hit test, not an event, so it still answers while the
 * window is click-through.
 */
const isPointerOverStageCanvas = computed(() =>
  document.elementFromPoint(relativeMouseX.value, relativeMouseY.value) === stageCanvas.value,
)
/**
 * Drives native click-through, and runs whether or not Auto Hide is on.
 *
 * `true` surrenders the pixel to the app below, the opposite sense of
 * {@link isTransparent}. The samplers report a missing canvas as transparent, so the
 * guards below are what keep the window interactive when nothing can answer. Godot
 * lands there: it draws a DOM panel and exposes no canvas to read.
 */
const isTransparentForMouseEvents = computed(() => {
  if (stagePaused.value || componentStateStage.value !== 'mounted')
    return false

  // Load-bearing, not a convenience. A scene swap unmounts the canvas while the state
  // still reads mounted, and both samplers answer "transparent" without one, which would
  // hand the whole window away, character included, until the next scene reports itself.
  if (!stageCanvas.value)
    return false

  if (!isPointerOverStageCanvas.value)
    return false

  if (stageModelRenderer.value === 'vrm')
    return shouldUseThreeTransparencyHitTest.value ? isTransparentByThreeExact.value : false

  return isTransparentByPixelsExact.value
})

const { isNearAnyBorder: isAroundWindowBorder } = useElectronMouseAroundWindowBorder({ threshold: 10 })
const isAroundWindowBorderFor250Ms = refDebounced(isAroundWindowBorder, 250)

const setIgnoreMouseEvents = useElectronEventaInvoke(electron.window.setIgnoreMouseEvents)

const controlsOverlayActive = computed(() => controlsIslandRef.value?.overlayActive ?? false)

const modelSettingsRuntimeSnapshot = computed<ModelSettingsRuntimeSnapshot>(() => {
  const hasModel = !!stageModelSelectedUrl.value

  if (stageModelRenderer.value === 'live2d') {
    const phase = resolveComponentStateToRuntimePhase(componentStateStage.value, { hasModel })

    return createEmptyModelSettingsRuntimeSnapshot({
      ownerInstanceId: modelSettingsRuntimeOwnerInstanceId,
      modelId: expressionStore.modelId,
      renderer: 'live2d',
      phase,
      controlsLocked: hasModel ? phase !== 'mounted' : false,
      previewAvailable: hasModel,
      canCapturePreview: false,
      live2dExpressions: expressionStore.settingsSnapshot,
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

  if (stageModelRenderer.value === 'spine') {
    const phase = resolveComponentStateToRuntimePhase(componentStateStage.value, { hasModel })

    return createEmptyModelSettingsRuntimeSnapshot({
      ownerInstanceId: modelSettingsRuntimeOwnerInstanceId,
      renderer: 'spine',
      phase,
      controlsLocked: hasModel ? phase !== 'mounted' : false,
      previewAvailable: hasModel,
      canCapturePreview: false,
      updatedAt: Date.now(),
    })
  }

  if (stageModelRenderer.value === 'tachie') {
    const phase = resolveComponentStateToRuntimePhase(componentStateStage.value, { hasModel })

    return createEmptyModelSettingsRuntimeSnapshot({
      ownerInstanceId: modelSettingsRuntimeOwnerInstanceId,
      renderer: 'tachie',
      phase,
      controlsLocked: hasModel ? phase !== 'mounted' : false,
      previewAvailable: hasModel,
      canCapturePreview: false,
      updatedAt: Date.now(),
    })
  }

  if (stageModelRenderer.value === 'mmd') {
    const phase = resolveComponentStateToRuntimePhase(componentStateStage.value, { hasModel })

    return createEmptyModelSettingsRuntimeSnapshot({
      ownerInstanceId: modelSettingsRuntimeOwnerInstanceId,
      renderer: 'mmd',
      phase,
      controlsLocked: hasModel ? phase !== 'mounted' : false,
      previewAvailable: hasModel,
      canCapturePreview: false,
      updatedAt: Date.now(),
    })
  }

  if (stageModelRenderer.value === 'godot') {
    return createEmptyModelSettingsRuntimeSnapshot({
      ownerInstanceId: modelSettingsRuntimeOwnerInstanceId,
      renderer: 'godot',
      phase: hasModel ? 'mounted' : 'no-model',
      controlsLocked: false,
      previewAvailable: false,
      canCapturePreview: false,
      updatedAt: Date.now(),
    })
  }

  return createEmptyModelSettingsRuntimeSnapshot({
    ownerInstanceId: modelSettingsRuntimeOwnerInstanceId,
    updatedAt: Date.now(),
  })
})

/**
 * Keeps the rendered fade state and Electron click-through state synchronized.
 *
 * Triggering workflow:
 *
 * {@link watch}
 *   -> `fade-on-hover reactive state change`
 *     -> {@link handleFadeOnHoverInteractionChange}
 *
 * Upstream:
 * - {@link isOutsideFor250Ms} and {@link isAroundWindowBorderFor250Ms}
 * - {@link isOutsideWindow}, {@link isTransparent}, and {@link isTransparentForMouseEvents}
 * - {@link controlsOverlayActive}, {@link fadeOnHoverEnabled}, {@link alwaysOnTop}, and {@link stagePaused}
 *
 * Downstream:
 * - {@link resolveFadeOnHoverInteraction}
 * - {@link setIgnoreMouseEvents}
 */
function handleFadeOnHoverInteractionChange() {
  if (stagePaused.value) {
    isIgnoringMouseEvents.value = false
    shouldFadeOnCursorWithin.value = false
    setIgnoreMouseEvents([false, { forward: true }])
    return
  }

  if (controlsOverlayActive.value || !outsideHearingStatus.value || !outsideAuthStatus.value) {
    // Portaled controls must receive clicks even outside the Island's bounds.
    isIgnoringMouseEvents.value = false
    shouldFadeOnCursorWithin.value = false
    setIgnoreMouseEvents([false, { forward: true }])
    return
  }

  // Entering counts at once and leaving keeps the region for the debounce window.
  // Waiting for the debounce on the way in would leave the button click-through for
  // 250ms, which the pixel hit test reads as blank canvas and passes to the app below.
  const insideControls = !isOutside.value || !isOutsideFor250Ms.value
  const nearBorder = isAroundWindowBorder.value || isAroundWindowBorderFor250Ms.value

  if (insideControls || nearBorder) {
    // Inside interactive controls or near resize border: do NOT ignore events
    isIgnoringMouseEvents.value = false
    shouldFadeOnCursorWithin.value = false
    setIgnoreMouseEvents([false, { forward: true }])
  }
  else {
    const interaction = resolveFadeOnHoverInteraction({
      alwaysOnTop: alwaysOnTop.value,
      cursorInsideWindow: !isOutsideWindow.value,
      enabled: fadeOnHoverEnabled.value,
      transparentForFade: isTransparent.value,
      transparentForPointer: isTransparentForMouseEvents.value,
    })

    isIgnoringMouseEvents.value = interaction.ignoreMouseEvents
    shouldFadeOnCursorWithin.value = interaction.fadeStage
    setIgnoreMouseEvents([interaction.ignoreMouseEvents, { forward: true }])
  }
}

watch(
  [outsideHearingStatus, outsideAuthStatus, isOutside, isOutsideFor250Ms, isPointerOverStageCanvas, isAroundWindowBorder, isAroundWindowBorderFor250Ms, isOutsideWindow, isTransparent, isTransparentForMouseEvents, controlsOverlayActive, fadeOnHoverEnabled, alwaysOnTop, stagePaused],
  handleFadeOnHoverInteractionChange,
  { immediate: true },
)

useModelSettingsRuntimeOwner({
  ownerInstanceId: modelSettingsRuntimeOwnerInstanceId,
  renderer: () => stageModelRenderer.value,
  runtimeSnapshot: modelSettingsRuntimeSnapshot,
  applyLive2DExpressionCommand: (command) => {
    expressionStore.applySettingsCommand(command)
  },
})

const settingsAudioDeviceStore = useSettingsAudioDevice()
const { stream, enabled, mode } = storeToRefs(settingsAudioDeviceStore)
const { askPermission, startStream, stopStream } = settingsAudioDeviceStore
const { nowSpeaking } = storeToRefs(useSpeakingStore())
const hearingStore = useHearingStore()
const { activeTranscriptionModel, activeTranscriptionProvider, autoSendEnabled, autoSendDelay } = storeToRefs(hearingStore)
const hearingPipeline = useHearingSpeechInputPipeline()
const { removeStreamingTranscriptionConsumer, transcribeForMediaStream, stopStreamingTranscription } = hearingPipeline
const { error: transcriptionError, supportsStreamInput } = storeToRefs(hearingPipeline)
const transcriptionConsumerId = 'stage-tamagotchi:voice-input'
const chatStore = useChatStore()
const chatSession = useChatSessionStore()
const cardStore = useAiriCardStore()
const { cards, wakeWordOwnership } = storeToRefs(cardStore)
const speechOutput = useSpeechOutputControlStore()
const voiceInlay = useVoiceInlay()
const voiceInlayState = useVoiceInlayStore()
let partialVoiceDraft: { sessionId: string, baseText: string, latestText: string } | undefined
const pushToTalkEnabled = computed(() => mode.value === 'push-to-talk')
let keywordListener: KeywordListener | undefined
let keywordGeneration = 0
let wakeGeneration = 0
let wakeSessionId: string | undefined
let wakeSegmentComplete = false
let wakeWindowTimer: ReturnType<typeof setTimeout> | undefined
let manualSessionId: string | undefined
let manualCardId: string | undefined
let streamingSessionId: string | undefined
const segmentOwners: Array<{ sessionId: string, cardId: string, inputMode: 'always' | 'push-to-talk' | 'wake-word' }> = []
const streamingTranscriptionUnavailable = ref(false)
const shouldUseStreamInput = computed(() => {
  const supportsCurrentMode = mode.value === 'always'
    || (mode.value === 'wake-word' && activeTranscriptionProvider.value === 'apple-speech-transcription')
  return supportsCurrentMode && supportsStreamInput.value && !!stream.value && !streamingTranscriptionUnavailable.value
})
const voiceTranscriptBuffers = new Map<string, ReturnType<typeof createTranscriptBuffer>>()

function bufferVoiceTranscript(text: string, sessionId: string | undefined) {
  if (!sessionId)
    return
  let buffer = voiceTranscriptBuffers.get(sessionId)
  if (!buffer) {
    const cardId = chatSession.sessionMetas[sessionId]?.characterId ?? cardStore.activeCardId
    buffer = createTranscriptBuffer({
      flushDelayMs: 1200,
      maxBufferedTextLength: 90,
      async flush(bufferedText) {
        await sendVoiceInputTextToChat(bufferedText, sessionId, cardId)
      },
    })
    voiceTranscriptBuffers.set(sessionId, buffer)
  }
  buffer.push(text)
}

const assistantSpeechSuppressedUntil = shallowRef(0)
const assistantSpeechResumeTimer = shallowRef<ReturnType<typeof setTimeout>>()
let voiceInputGeneration = 0

/** Controls transcript cleanup while voice input stops. */
interface StopAudioInteractionOptions {
  /** Flushes pending transcript text to chat before stop completes. */
  flushTranscript?: boolean
}

const voiceInputInteractionLifecycle = createVoiceInputInteractionLifecycle<StopAudioInteractionOptions>({
  start: startAudioInteractionConsumers,
  stop: stopAudioInteractionConsumers,
})

// Caption overlay broadcast channel
const { post: postCaption } = useBroadcastChannel<CaptionChannelEvent, CaptionChannelEvent>({ name: 'airi-caption-overlay' })
const { post: postHearingInput } = useBroadcastChannel<HearingInputChannelEvent, HearingInputChannelEvent>({ name: hearingInputChannelName })
const hearingInputClearTimers = new Map<ReturnType<typeof setTimeout>, string>()
let hearingInputSequence = 0
let activeHearingInputSourceId: string | undefined

function currentHearingInputSourceId() {
  activeHearingInputSourceId ??= `stage-tamagotchi:${++hearingInputSequence}`
  return activeHearingInputSourceId
}

function postHearingInputEvent(event: HearingInputChannelEvent) {
  const { error } = tryCatch(() => postHearingInput(event))
  if (error)
    console.warn('[Main Page] Failed to post Hearing input text:', error)
}

function replaceHearingInput(text: string) {
  postHearingInputEvent({
    operation: 'replace',
    sourceId: currentHearingInputSourceId(),
    text,
  })
}

function clearHearingInput(sourceId = activeHearingInputSourceId) {
  if (!sourceId)
    return

  postHearingInputEvent({ operation: 'clear', sourceId })
  if (sourceId === activeHearingInputSourceId)
    activeHearingInputSourceId = undefined
}

function scheduleHearingInputClear(sourceId: string) {
  const timer = setTimeout(() => {
    hearingInputClearTimers.delete(timer)
    clearHearingInput(sourceId)
  }, 250)
  hearingInputClearTimers.set(timer, sourceId)
}

/**
 * Reports a voice input pipeline failure to both the console and visible app UI.
 */
function reportVoiceInputFailure(action: string, error: unknown) {
  const reason = errorMessageFrom(error)
  const message = reason
    ? `Voice input failed to ${action}: ${reason}`
    : `Voice input failed to ${action}.`
  console.error(`[Main Page] ${message}`, error)
  toast.error(message)
}

/**
 * Checks whether current voice input should be ignored to avoid assistant self-transcription.
 */
function isVoiceInputSuppressed(now = Date.now()) {
  return shouldSuppressVoiceInput({
    assistantSpeaking: nowSpeaking.value,
    suppressedUntil: assistantSpeechSuppressedUntil.value,
  }, now)
}

/**
 * Captures whether a recorded segment can still leave the app for ASR.
 */
function inspectVoiceInputProviderRequestGate(generation: unknown) {
  const current = generation === voiceInputGeneration
  const audioEnabled = mode.value === 'push-to-talk' || (enabled.value && (mode.value === 'always' || mode.value === 'wake-word'))
  const suppressed = mode.value === 'always' && isVoiceInputSuppressed()
  let reason: string | undefined
  if (!current)
    reason = 'Skipped stale voice input segment'
  else if (!audioEnabled)
    reason = 'Skipped voice input segment because audio input is disabled'
  else if (suppressed)
    reason = 'Skipped voice input segment while assistant speech is active or cooling down'

  return {
    generation,
    activeGeneration: voiceInputGeneration,
    current,
    enabled: audioEnabled,
    suppressed,
    reason,
    skip: !current || !audioEnabled || suppressed,
  }
}

/**
 * Captures whether live microphone audio can still leave the app for streaming ASR.
 */
function inspectVoiceInputStreamingRequestGate() {
  const audioEnabled = enabled.value && (mode.value === 'always' || (mode.value === 'wake-word' && !!wakeSessionId))
  const suppressed = mode.value === 'always' && isVoiceInputSuppressed()

  return {
    enabled: audioEnabled,
    suppressed,
    skip: !audioEnabled || suppressed,
  }
}

/**
 * Clears the pending assistant-speech resume timer.
 */
function clearAssistantSpeechResumeTimer() {
  if (!assistantSpeechResumeTimer.value)
    return

  clearTimeout(assistantSpeechResumeTimer.value)
  assistantSpeechResumeTimer.value = undefined
}

/**
 * Restarts voice input after assistant playback tail audio should be gone.
 */
function scheduleAssistantSpeechResume() {
  clearAssistantSpeechResumeTimer()

  if (!enabled.value)
    return

  const remainingCooldownMs = Math.max(
    0,
    assistantSpeechSuppressedUntil.value
      ? assistantSpeechSuppressedUntil.value - Date.now()
      : DEFAULT_ASSISTANT_SPEECH_INPUT_COOLDOWN_MS,
  )
  const cooldownMs = nowSpeaking.value
    ? DEFAULT_ASSISTANT_SPEECH_INPUT_COOLDOWN_MS
    : remainingCooldownMs

  assistantSpeechResumeTimer.value = setTimeout(() => {
    assistantSpeechResumeTimer.value = undefined
    if (!enabled.value || isVoiceInputSuppressed())
      return

    void voiceInputInteractionLifecycle.start().catch(error => reportVoiceInputFailure('resume listening', error))
  }, cooldownMs)
}

/**
 * Ensures the microphone stream has a live audio track before binding recorder or VAD.
 */
async function ensureLiveAudioInputStream() {
  const canCapture = () => mode.value === 'push-to-talk' || (enabled.value && (mode.value === 'always' || mode.value === 'wake-word'))
  if (!canCapture())
    return false

  if (stream.value?.getAudioTracks().some(track => track.readyState === 'live'))
    return true

  stopStream()

  if (!canCapture())
    return false

  await askPermission()

  if (!canCapture())
    return false

  await startStream()

  if (!canCapture()) {
    stopStream()
    return false
  }

  if (stream.value?.getAudioTracks().some(track => track.readyState === 'live'))
    return true

  throw new Error('Microphone stream did not provide a live audio track')
}

function releasePushToTalkStream() {
  if (enabled.value && (mode.value === 'always' || mode.value === 'wake-word'))
    return
  stopStream()
}

/**
 * Sends voice captions as best-effort overlay updates without interrupting chat ingestion.
 */
function postSpeakerCaption(text: string, operation: NonNullable<CaptionChannelEvent['operation']> = 'append') {
  const { error } = tryCatch(() => postCaption({ operation, type: 'caption-speaker', text }))
  if (error)
    console.warn('[Main Page] Failed to post voice input caption:', error)
}

/**
 * Routes a transcription to its recorded character session.
 */
async function sendVoiceInputTextToChat(text: string, sessionId: string | undefined, cardId = sessionId ? chatSession.sessionMetas[sessionId]?.characterId : undefined) {
  if (!text.trim() || !sessionId)
    return
  try {
    if (autoSendEnabled.value) {
      const generation = voiceInputGeneration
      const inputMode = mode.value
      if (autoSendDelay.value > 0)
        await new Promise(resolve => setTimeout(resolve, autoSendDelay.value))
      if (generation !== voiceInputGeneration || mode.value !== inputMode || chatSession.activeSessionId !== sessionId)
        return
      await chatStore.send({ sessionId, text })
    }
    else {
      await voiceInlay.queueVoiceDraft({ cardId: cardId ?? cardStore.activeCardId, sessionId, text })
    }
  }
  catch (err) {
    reportVoiceInputFailure('send to chat', err)
  }
}

async function showPartialVoiceDraft(text: string, sessionId: string, cardId: string) {
  if (!text.trim() || autoSendEnabled.value)
    return

  if (partialVoiceDraft?.sessionId === sessionId) {
    partialVoiceDraft.latestText = text
    const { baseText } = partialVoiceDraft
    voiceInlayState.editVoiceDraft(sessionId, baseText ? `${baseText}\n${text}` : text)
    return
  }

  partialVoiceDraft = { sessionId, baseText: voiceInlayState.drafts[sessionId]?.text ?? '', latestText: text }
  voiceInlayState.beginDraftTranscription(sessionId)
  try {
    await voiceInlay.queueVoiceDraft({ cardId, sessionId, text })
  }
  catch (error) {
    reportVoiceInputFailure('show voice draft', error)
  }
}

function finishPartialVoiceDraft(text: string, sessionId: string) {
  if (partialVoiceDraft?.sessionId !== sessionId)
    return false

  const { baseText } = partialVoiceDraft
  voiceInlayState.editVoiceDraft(sessionId, baseText ? `${baseText}\n${text}` : text)
  voiceInlayState.finishDraftTranscription(sessionId)
  partialVoiceDraft = undefined
  return true
}

/** Sends each completed browser-recognition phrase. Other providers emit deltas here. */
function handleStreamingSentenceEnd(delta: string) {
  if (isVoiceInputSuppressed())
    return
  if (hearingStore.activeTranscriptionProvider !== 'browser-web-speech-api' || !delta.trim())
    return
  const finalText = delta.trim()
  const sourceId = currentHearingInputSourceId()
  replaceHearingInput(finalText)
  scheduleHearingInputClear(sourceId)
  activeHearingInputSourceId = undefined
  postSpeakerCaption(finalText, 'replace')
  void sendVoiceInputTextToChat(finalText, streamingSessionId)
}

/** Replaces the caption with the provider's current volatile transcript. */
function handleStreamingTranscriptionUpdate(text: string) {
  if (mode.value === 'always' && isVoiceInputSuppressed())
    return

  replaceHearingInput(text)
  postSpeakerCaption(text, 'replace')
  if (mode.value === 'wake-word' && wakeSessionId) {
    const cardId = chatSession.sessionMetas[wakeSessionId]?.characterId ?? cardStore.activeCardId
    void showPartialVoiceDraft(text, wakeSessionId, cardId)
  }
}

/** Submits one complete non-browser streaming-ASR utterance. */
function handleStreamingSpeechEnd(text: string) {
  if (mode.value === 'always' && isVoiceInputSuppressed())
    return
  if (hearingStore.activeTranscriptionProvider === 'browser-web-speech-api')
    return
  const sessionId = streamingSessionId
  let finalText = text
  if (!finalText.trim() && partialVoiceDraft && partialVoiceDraft.sessionId === sessionId)
    finalText = partialVoiceDraft.latestText
  if (!finalText.trim()) {
    streamingSessionId = undefined
    if (mode.value === 'wake-word')
      void finishWakeInput()
    return
  }
  const sourceId = currentHearingInputSourceId()
  replaceHearingInput(finalText)
  scheduleHearingInputClear(sourceId)
  activeHearingInputSourceId = undefined
  postSpeakerCaption(finalText, 'replace')
  const draftShown = sessionId ? finishPartialVoiceDraft(finalText, sessionId) : false
  streamingSessionId = undefined
  void (async () => {
    if (!draftShown)
      await sendVoiceInputTextToChat(finalText, sessionId)
    if (mode.value === 'wake-word')
      await finishWakeInput()
  })().catch(error => reportVoiceInputFailure('finish streaming speech', error))
}

/** Reads the listening generation attached to recorder-backed transcription metadata. */
function getVoiceInputGeneration(metadata?: Record<string, unknown>) {
  return typeof metadata?.generation === 'number' ? metadata.generation : undefined
}

const voiceInputSession = useVoiceInputSession(stream, {
  shouldUseStreamInput,
  onLog(level, event, message, details) {
    const output = `[Voice Input] ${event}: ${message}`
    if (level === 'error') {
      console.error(output, details ?? {})
      return
    }
    if (level === 'warn') {
      console.warn(output, details ?? {})
      return
    }
    console.info(output, details ?? {})
  },
  canStartSegment: ({ trigger }) => {
    if (mode.value === 'always')
      return enabled.value && !isVoiceInputSuppressed()
    if (mode.value === 'push-to-talk')
      return trigger === 'manual' && !!manualSessionId
    return mode.value === 'wake-word' && trigger !== 'manual' && !!wakeSessionId && !wakeSegmentComplete
  },
  inspectBeforeTranscription: ({ metadata }) => inspectVoiceInputProviderRequestGate(getVoiceInputGeneration(metadata)),
  inspectAfterTranscription: ({ metadata }) => inspectVoiceInputProviderRequestGate(getVoiceInputGeneration(metadata)),
  onSegmentStarted: ({ trigger }) => {
    let sessionId: string | undefined
    let inputMode: 'always' | 'push-to-talk' | 'wake-word'
    if (trigger === 'manual') {
      sessionId = manualSessionId
      inputMode = 'push-to-talk'
    }
    else if (mode.value === 'always') {
      sessionId = chatSession.activeSessionId
      inputMode = 'always'
    }
    else {
      sessionId = wakeSessionId
      inputMode = 'wake-word'
    }
    if (sessionId && trigger !== 'manual' && wakeWindowTimer) {
      clearTimeout(wakeWindowTimer)
      wakeWindowTimer = undefined
    }
    if (sessionId) {
      const cardId = inputMode === 'push-to-talk'
        ? manualCardId ?? cardStore.activeCardId
        : chatSession.sessionMetas[sessionId]?.characterId ?? cardStore.activeCardId
      segmentOwners.push({ sessionId, cardId, inputMode })
    }
  },
  onRecordingReady: () => ({ generation: voiceInputGeneration, ...segmentOwners.shift() }),
  onRecordingSkipped: ({ metadata }) => {
    if (!metadata)
      segmentOwners.shift()
    if (mode.value === 'wake-word')
      void finishWakeInput()
  },
  onSegmentStopped: ({ trigger }) => {
    if (mode.value === 'wake-word' && trigger !== 'manual')
      wakeSegmentComplete = true
  },
  onTranscriptionStart: () => {
    partialVoiceDraft = undefined
  },
  onTranscriptionPartial: async ({ text, metadata }) => {
    const sessionId = typeof metadata?.sessionId === 'string' ? metadata.sessionId : undefined
    if (!sessionId || metadata?.inputMode === 'always')
      return
    const cardId = typeof metadata?.cardId === 'string' ? metadata.cardId : cardStore.activeCardId
    await showPartialVoiceDraft(text, sessionId, cardId)
  },
  onTranscriptionResult: async ({ text, metadata }) => {
    postSpeakerCaption(text)
    toast(`Voice input transcribed: ${text}`)
    if (metadata?.inputMode === 'always') {
      bufferVoiceTranscript(text, typeof metadata.sessionId === 'string' ? metadata.sessionId : undefined)
    }
    else {
      const sessionId = typeof metadata?.sessionId === 'string' ? metadata.sessionId : undefined
      const cardId = typeof metadata?.cardId === 'string' ? metadata.cardId : cardStore.activeCardId
      if (sessionId && !finishPartialVoiceDraft(text, sessionId)) {
        await sendVoiceInputTextToChat(text, sessionId, cardId)
      }
      if (metadata?.inputMode === 'wake-word')
        await finishWakeInput()
    }
  },
  onTranscriptionEmpty: () => {
    if (partialVoiceDraft)
      voiceInlayState.finishDraftTranscription(partialVoiceDraft.sessionId)
    partialVoiceDraft = undefined
    if (mode.value === 'wake-word')
      void finishWakeInput()
    if (transcriptionError.value) {
      reportVoiceInputFailure('transcribe speech', transcriptionError.value)
      return
    }

    toast('Voice input transcribed no text.')
  },
  onTranscriptionError: ({ error }) => {
    if (partialVoiceDraft)
      voiceInlayState.finishDraftTranscription(partialVoiceDraft.sessionId)
    partialVoiceDraft = undefined
    if (mode.value === 'wake-word')
      void finishWakeInput()
    reportVoiceInputFailure('transcribe speech', error)
  },
})

/** Starts the active streaming or recorder-backed voice-input consumers. */
async function startAudioInteractionConsumers() {
  if (mode.value !== 'always' && (mode.value !== 'wake-word' || !wakeSessionId))
    return
  if (mode.value === 'always' && isVoiceInputSuppressed()) {
    scheduleAssistantSpeechResume()
    return
  }

  if (!await ensureLiveAudioInputStream())
    return

  if (shouldUseStreamInput.value) {
    const currentStream = stream.value
    if (!currentStream)
      throw new Error('Microphone stream is unavailable for streaming transcription')

    const requestGate = inspectVoiceInputStreamingRequestGate()
    if (requestGate.skip)
      return

    await transcribeForMediaStream(currentStream, {
      consumerId: transcriptionConsumerId,
      onSpeechStart: () => {
        streamingSessionId = mode.value === 'wake-word' ? wakeSessionId : chatSession.activeSessionId
        if (mode.value === 'wake-word' && wakeWindowTimer) {
          clearTimeout(wakeWindowTimer)
          wakeWindowTimer = undefined
        }
      },
      onSentenceEnd: handleStreamingSentenceEnd,
      onSpeechEnd: handleStreamingSpeechEnd,
      onTranscriptionUpdate: handleStreamingTranscriptionUpdate,
    })

    if (inspectVoiceInputStreamingRequestGate().skip) {
      await stopStreamingTranscription(true)
      return
    }

    if (transcriptionError.value) {
      streamingTranscriptionUnavailable.value = true
      await stopStreamingTranscription(true)
      console.warn('[Main Page] Streaming transcription unavailable; using recorder-backed fallback:', transcriptionError.value)
    }
  }

  if (!shouldUseStreamInput.value)
    await voiceInputSession.startAutoSegmentation()
}

/**
 * Stops active microphone consumers before the stage binds to another audio stream.
 */
async function stopAudioInteractionConsumers(options: StopAudioInteractionOptions = {}) {
  const flushTranscript = options.flushTranscript ?? true

  clearAssistantSpeechResumeTimer()
  clearHearingInput()
  voiceInputGeneration += 1

  await Promise.all([
    stopStreamingTranscription(true),
    voiceInputSession.stop({ flushActiveRecording: false }),
  ])

  if (flushTranscript) {
    await Promise.all([...voiceTranscriptBuffers.values()].map(buffer => buffer.dispose()))
  }
  else {
    for (const buffer of voiceTranscriptBuffers.values())
      buffer.clear()
  }
  voiceTranscriptBuffers.clear()
}

async function finishWakeInput() {
  if (!wakeSessionId)
    return
  if (partialVoiceDraft?.sessionId === wakeSessionId) {
    voiceInlayState.finishDraftTranscription(wakeSessionId)
    partialVoiceDraft = undefined
  }
  if (wakeWindowTimer)
    clearTimeout(wakeWindowTimer)
  wakeWindowTimer = undefined
  wakeSessionId = undefined
  streamingSessionId = undefined
  wakeSegmentComplete = false
  try {
    await voiceInputInteractionLifecycle.stop({ flushTranscript: false })
  }
  finally {
    await voiceInlay.hideRecording()
    if (mode.value === 'wake-word')
      await keywordListener?.resume()
  }
}

async function handleWakeWord(label: string, targets: Map<string, { cardId: string }>) {
  const target = targets.get(label)
  if (!target || mode.value !== 'wake-word')
    return

  const generation = ++wakeGeneration
  if (nowSpeaking.value) {
    speechOutput.requestStopSpeaking('wake-word')
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  if (generation !== wakeGeneration || mode.value !== 'wake-word')
    return

  try {
    await cardStore.activateCard(target.cardId)
    if (generation !== wakeGeneration || mode.value !== 'wake-word') {
      await keywordListener?.resume()
      return
    }
    wakeSessionId = await chatSession.ensureCurrentSession()
    if (generation !== wakeGeneration || mode.value !== 'wake-word') {
      await finishWakeInput()
      return
    }
    await voiceInlay.showRecording(target.cardId)
    if (generation !== wakeGeneration || mode.value !== 'wake-word') {
      await finishWakeInput()
      return
    }
    wakeSegmentComplete = false
    await voiceInputInteractionLifecycle.start()
    if (generation !== wakeGeneration || mode.value !== 'wake-word') {
      await finishWakeInput()
      return
    }
    wakeWindowTimer = setTimeout(() => {
      void finishWakeInput().catch(error => reportVoiceInputFailure('close Wake Word window', error))
    }, 15_000)
  }
  catch (error) {
    reportVoiceInputFailure('start after Wake Word', error)
    if (wakeSessionId)
      await finishWakeInput()
    else
      await keywordListener?.resume()
  }
}

async function askForWakeWordSetup() {
  if (!settingsAudioDeviceStore.claimWakeWordSetupPrompt())
    return
  const sessionId = await chatSession.ensureCurrentSession()
  await chatStore.promptCharacter({
    sessionId,
    instruction: 'Ask the user how they want to call you to start a voice conversation. Invite one or more names and pronunciations. After they answer, use the configure_wake_words tool to save the token sequences.',
  })
}

async function prepareKeywordListener(currentStream: MediaStream | undefined, generation: number) {
  const configured = resolveWakeWordKeywords(cards.value, wakeWordOwnership.value)
  if (configured.keywords.length === 0)
    void askForWakeWordSetup().catch(error => reportVoiceInputFailure('ask for Wake Word setup', error))

  settingsAudioDeviceStore.setWakeWordPreparation('preparing')
  const model = await loadKwsModel()
  if (generation !== keywordGeneration || mode.value !== 'wake-word')
    return

  const vocabulary = getKwsVocabulary(model)
  const active = resolveWakeWordKeywords(cards.value, wakeWordOwnership.value)
  const keywords = supportedWakeWordKeywords(active.keywords, vocabulary)
  keywordListener?.stop()
  const listener = new KeywordListener(model, workletUrl, label => void handleWakeWord(label, active.targets), error => reportVoiceInputFailure('detect Wake Word', error))
  keywordListener = listener
  if (currentStream)
    await listener.start(currentStream, keywords)
  if (generation !== keywordGeneration)
    return listener.stop()

  settingsAudioDeviceStore.setWakeWordPreparation(keywords.length > 0 ? 'ready' : 'unconfigured')
  if (keywords.length === 0)
    void askForWakeWordSetup().catch(error => reportVoiceInputFailure('ask for Wake Word setup', error))
}

useDesktopPushToTalk({
  enabled: pushToTalkEnabled,
  begin: async (isHeld) => {
    try {
      manualSessionId = await chatSession.ensureCurrentSession()
      if (!isHeld())
        return
      manualCardId = chatSession.sessionMetas[manualSessionId]?.characterId ?? cardStore.activeCardId
      await voiceInlay.showRecording(manualCardId)
      if (nowSpeaking.value) {
        speechOutput.requestStopSpeaking('push-to-talk')
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      if (!isHeld() || mode.value !== 'push-to-talk' || !await ensureLiveAudioInputStream())
        return
      if (!isHeld() || mode.value !== 'push-to-talk') {
        releasePushToTalkStream()
        return
      }
      if (!await voiceInputSession.startSegment('manual')) {
        releasePushToTalkStream()
        await voiceInlay.hideRecording()
      }
    }
    catch (error) {
      reportVoiceInputFailure('start Push to Talk', error)
      releasePushToTalkStream()
      await voiceInlay.hideRecording()
    }
  },
  end: async () => {
    try {
      await voiceInputSession.stopSegment('manual')
    }
    finally {
      releasePushToTalkStream()
      manualSessionId = undefined
      manualCardId = undefined
      await voiceInlay.hideRecording()
    }
  },
})

watch([mode, enabled, stream, cards, wakeWordOwnership], async ([currentMode, isEnabled, currentStream]) => {
  const generation = ++keywordGeneration
  ++wakeGeneration
  keywordListener?.stop()
  if (!isEnabled || currentMode !== 'wake-word') {
    if (wakeSessionId)
      await finishWakeInput()
    return
  }
  try {
    await prepareKeywordListener(currentStream, generation)
  }
  catch (error) {
    settingsAudioDeviceStore.setWakeWordPreparation('error', errorMessageFrom(error) ?? 'The model could not load.')
    reportVoiceInputFailure('prepare Wake Word', error)
  }
}, { immediate: true, deep: true })

watch([mode, enabled], async ([currentMode, val]) => {
  try {
    if (val && currentMode === 'always') {
      await askPermission()
      await voiceInputInteractionLifecycle.start()
    }
    else {
      await voiceInputInteractionLifecycle.stop()
    }
  }
  catch (error) {
    reportVoiceInputFailure(val ? 'start listening' : 'stop listening', error)
    if (val)
      enabled.value = false
  }
}, { immediate: true })

watch([activeTranscriptionProvider, activeTranscriptionModel, supportsStreamInput], async () => {
  streamingTranscriptionUnavailable.value = false
  if (!enabled.value || mode.value !== 'always')
    return

  try {
    await voiceInputInteractionLifecycle.stop({ flushTranscript: false })
    await voiceInputInteractionLifecycle.start()
  }
  catch (error) {
    reportVoiceInputFailure('restart after transcription settings changed', error)
    enabled.value = false
  }
})

watch(nowSpeaking, async (speaking) => {
  if (mode.value !== 'always')
    return
  if (speaking) {
    clearAssistantSpeechResumeTimer()
    try {
      await voiceInputInteractionLifecycle.stop({ flushTranscript: false })
    }
    catch (error) {
      reportVoiceInputFailure('pause while assistant is speaking', error)
    }
    return
  }

  assistantSpeechSuppressedUntil.value = assistantSpeechCooldownDeadline()
  scheduleAssistantSpeechResume()
})

onMounted(() => {
  if (onboardingStore.needsOnboarding) {
    openOnboarding()
  }
})

onUnmounted(() => {
  ++keywordGeneration
  ++wakeGeneration
  keywordListener?.stop()
  removeStreamingTranscriptionConsumer(transcriptionConsumerId)
  for (const [timer, sourceId] of hearingInputClearTimers) {
    clearTimeout(timer)
    clearHearingInput(sourceId)
  }
  hearingInputClearTimers.clear()
  clearHearingInput()
  clearAssistantSpeechResumeTimer()
  void voiceInputInteractionLifecycle.stop().catch(error => reportVoiceInputFailure('stop listening', error))
})

watch(stream, async (currentStream) => {
  if (mode.value !== 'always' || !enabled.value || !currentStream || voiceInputInteractionLifecycle.isStarting() || voiceInputInteractionLifecycle.isStopping() || isVoiceInputSuppressed())
    return

  // NOTICE: The controls-island mic toggle and device changes can replace the underlying MediaStream
  // without reloading the page. When that happens, VAD may successfully restart against the new stream,
  // but any existing transcription transport is still bound to the old one. Always allow the page to
  // restart voice input for a newly available stream unless another lifecycle operation is underway.
  try {
    await voiceInputInteractionLifecycle.stop()
    await voiceInputInteractionLifecycle.start()
  }
  catch (error) {
    reportVoiceInputFailure('restart after microphone changed', error)
    enabled.value = false
  }
})

// Assistant caption is broadcast from Stage.vue via the same channel

const cursorPosition = computed(() => ({
  x: relativeMouseX.value,
  y: relativeMouseY.value,
}))
</script>

<template>
  <div
    max-h="[100vh]"
    max-w="[100vw]"
    flex="~ col"
    relative z-2 h-full overflow-hidden rounded-xl
    transition="opacity duration-500 ease-in-out"
  >
    <div v-show="!settingsStore.streamerMode" ref="hearingStatusElement" :class="['absolute bottom-3 left-1/2 z-30 w-fit -translate-x-1/2']">
      <HearingStatus align="center" />
    </div>
    <div v-show="!settingsStore.streamerMode" ref="authStatusElement" :class="['absolute left-1/2 top-3 z-40 w-fit -translate-x-1/2']">
      <AuthStatusIsland />
    </div>
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
        <!--
          Every element that paints over the stage carries the opaque marker,
          so that the screen sampler does not read AIRI's own colors as desktop
          light. ResourceStatusIsland marks its pill itself, because its root
          spans the whole stage width. Tooltips and dialogs need none: reka-ui
          portals them to the body and the mask finds them there. HoloCoupon
          never renders (v-if="false").
        -->
        <ResourceStatusIsland />
        <WidgetStage
          ref="widgetStageRef"
          v-model:state="componentStateStage"
          h-full w-full
          flex-1
          :cursor-position="cursorPosition"
          :paused="stagePaused"
        />
        <HoloCoupon />
        <ControlsIslandRoot :frozen="controlsIslandInteractionActive">
          <ControlsIsland
            ref="controlsIslandRef"
            :[stageOpaqueAttribute]="true"
            @interaction-change="controlsIslandInteractionActive = $event"
          />
        </ControlsIslandRoot>
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
        <div
          :class="[
            'absolute left-0 top-0 h-full w-full',
            'flex items-center justify-center',
            'animate-flash animate-duration-5s animate-count-infinite',
            'select-none text-1.5rem text-primary-400 font-normal drag-region',
          ]"
        >
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
    <div v-if="(isAroundWindowBorder || isAroundWindowBorderFor250Ms) && !isLoading" class="pointer-events-none absolute left-0 top-0 z-999 h-full w-full">
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

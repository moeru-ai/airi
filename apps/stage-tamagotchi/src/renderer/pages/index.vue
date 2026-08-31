<script setup lang="ts">
import type { CaptionChannelEvent, HearingInputChannelEvent } from '@proj-airi/stage-shared'
import type { ModelSettingsRuntimeSnapshot } from '@proj-airi/stage-ui/components/scenarios/settings/model-settings/runtime'

import type { ModelSettingsRuntimeChannelEvent } from '../../shared/model-settings-runtime'

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
import { useModelStore, useThreeSceneIsTransparentAtPoint } from '@proj-airi/stage-ui-three'
import { HoloCoupon } from '@proj-airi/stage-ui/components'
import {
  createEmptyModelSettingsRuntimeSnapshot,
  resolveComponentStateToRuntimePhase,
} from '@proj-airi/stage-ui/components/scenarios/settings/model-settings/runtime'
import { WidgetStage } from '@proj-airi/stage-ui/components/scenes'
import { useVoiceInputSession } from '@proj-airi/stage-ui/composables'
import { useCanvasPixelIsTransparentAtPoint } from '@proj-airi/stage-ui/composables/canvas-alpha'
import { useSpeakingStore } from '@proj-airi/stage-ui/stores/audio'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useHearingSpeechInputPipeline, useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useOnboardingStore } from '@proj-airi/stage-ui/stores/onboarding'
import { useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { refDebounced, useBroadcastChannel } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, shallowRef, toRef, watch } from 'vue'
import { toast } from 'vue-sonner'

import ControlsIslandRoot from '../components/stage-islands/controls-island/controls-island-root.vue'
import ControlsIsland from '../components/stage-islands/controls-island/index.vue'
import ResourceStatusIsland from '../components/stage-islands/resource-status-island/index.vue'

import { electronOpenOnboarding } from '../../shared/eventa'
import { modelSettingsRuntimeSnapshotChannelName } from '../../shared/model-settings-runtime'
import { useControlsIslandStore } from '../stores/controls-island'
import { useStageWindowLifecycleStore } from '../stores/stage-window-lifecycle'
import { resolveFadeOnHoverInteraction } from '../utils/fade-on-hover'
import { shouldSampleStageTransparency } from '../utils/stage-three-transparency'
import { createVoiceInputInteractionLifecycle } from '../utils/voice-input-lifecycle'
import {
  assistantSpeechCooldownDeadline,
  DEFAULT_ASSISTANT_SPEECH_INPUT_COOLDOWN_MS,
  shouldSuppressVoiceInput,
} from '../utils/voice-input-suppression'

const controlsIslandRef = ref<InstanceType<typeof ControlsIsland>>()
const controlsIslandInteractionActive = shallowRef(false)
const controlsIslandElement = toRef(() => controlsIslandRef.value?.element)
const widgetStageRef = ref<InstanceType<typeof WidgetStage>>()
const stageCanvas = toRef(() => widgetStageRef.value?.canvasElement())
const componentStateStage = ref<'pending' | 'loading' | 'mounted'>('pending')
const stageMounted = computed(() => componentStateStage.value === 'mounted')
const isLoading = computed(() => !stageMounted.value)

const isIgnoringMouseEvents = ref(false)
const shouldFadeOnCursorWithin = ref(false)

const onboardingStore = useOnboardingStore()
const openOnboarding = useElectronEventaInvoke(electronOpenOnboarding)

const { isOutside: isOutsideWindow } = useElectronMouseInWindow()
const { isOutside } = useElectronMouseInElement(controlsIslandElement)
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
const { stageModelRenderer, stageModelSelectedUrl } = storeToRefs(settingsStore)
const modelStore = useModelStore()
const { sceneMutationLocked, scenePhase } = storeToRefs(modelStore)
const { stagePaused } = storeToRefs(useStageWindowLifecycleStore())
const { fadeOnHoverEnabled } = storeToRefs(useControlsIslandStore())
const modelSettingsRuntimeOwnerInstanceId = `tamagotchi-main-stage:${Math.random().toString(36).slice(2, 10)}`
const { data: modelSettingsRuntimeChannelEvent, post: postModelSettingsRuntimeChannelEvent } = useBroadcastChannel<ModelSettingsRuntimeChannelEvent, ModelSettingsRuntimeChannelEvent>({ name: modelSettingsRuntimeSnapshotChannelName })
const shouldUseThreeTransparencyHitTest = computed(() => shouldSampleStageTransparency({
  componentState: componentStateStage.value,
  fadeOnHoverEnabled: fadeOnHoverEnabled.value,
  stageModelRenderer: stageModelRenderer.value,
  stagePaused: stagePaused.value,
}))
const isTransparent = computed(() => {
  if (stagePaused.value || componentStateStage.value !== 'mounted' || !fadeOnHoverEnabled.value)
    return true

  if (stageModelRenderer.value === 'vrm')
    return shouldUseThreeTransparencyHitTest.value ? isTransparentByThree.value : true

  if (stageModelRenderer.value === 'live2d' || stageModelRenderer.value === 'tachie')
    return isTransparentByPixels.value

  return true
})
const isTransparentForMouseEvents = computed(() => {
  if (stagePaused.value || componentStateStage.value !== 'mounted' || !fadeOnHoverEnabled.value)
    return true

  if (stageModelRenderer.value === 'vrm')
    return shouldUseThreeTransparencyHitTest.value ? isTransparentByThreeExact.value : true

  if (stageModelRenderer.value === 'live2d' || stageModelRenderer.value === 'tachie')
    return isTransparentByPixelsExact.value

  return true
})

const { isNearAnyBorder: isAroundWindowBorder } = useElectronMouseAroundWindowBorder({ threshold: 10 })
const isAroundWindowBorderFor250Ms = refDebounced(isAroundWindowBorder, 250)

const setIgnoreMouseEvents = useElectronEventaInvoke(electron.window.setIgnoreMouseEvents)

const hearingDialogOpen = computed(() => controlsIslandRef.value?.hearingDialogOpen ?? false)

const modelSettingsRuntimeSnapshot = computed<ModelSettingsRuntimeSnapshot>(() => {
  const hasModel = !!stageModelSelectedUrl.value

  if (stageModelRenderer.value === 'live2d') {
    const phase = resolveComponentStateToRuntimePhase(componentStateStage.value, { hasModel })

    return createEmptyModelSettingsRuntimeSnapshot({
      ownerInstanceId: modelSettingsRuntimeOwnerInstanceId,
      renderer: 'live2d',
      phase,
      controlsLocked: hasModel ? phase !== 'mounted' : false,
      previewAvailable: hasModel,
      canCapturePreview: false,
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
 * - {@link hearingDialogOpen}, {@link fadeOnHoverEnabled}, and {@link stagePaused}
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

  if (hearingDialogOpen.value) {
    // Hearing dialog/drawer is open; keep window interactive
    isIgnoringMouseEvents.value = false
    shouldFadeOnCursorWithin.value = false
    setIgnoreMouseEvents([false, { forward: true }])
    return
  }

  const insideControls = !isOutsideFor250Ms.value
  const nearBorder = isAroundWindowBorderFor250Ms.value

  if (insideControls || nearBorder) {
    // Inside interactive controls or near resize border: do NOT ignore events
    isIgnoringMouseEvents.value = false
    shouldFadeOnCursorWithin.value = false
    setIgnoreMouseEvents([false, { forward: true }])
  }
  else {
    const interaction = resolveFadeOnHoverInteraction({
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
  [isOutsideFor250Ms, isAroundWindowBorderFor250Ms, isOutsideWindow, isTransparent, isTransparentForMouseEvents, hearingDialogOpen, fadeOnHoverEnabled, stagePaused],
  handleFadeOnHoverInteractionChange,
  { immediate: true },
)

// Emit runtime snapshot on change and on request from settings panel
/**
 * Sends model-settings runtime events without letting closed HMR channels break the stage.
 */
function postModelSettingsRuntimeEvent(event: ModelSettingsRuntimeChannelEvent) {
  const { error } = tryCatch(() => postModelSettingsRuntimeChannelEvent(event))
  if (error)
    console.warn('[Main Page] Failed to post model settings runtime event:', error)
}

watch(modelSettingsRuntimeSnapshot, (snapshot) => {
  postModelSettingsRuntimeEvent({ type: 'snapshot', snapshot })
}, { immediate: true })

watch(modelSettingsRuntimeChannelEvent, (event) => {
  if (event?.type !== 'request-current')
    return

  postModelSettingsRuntimeEvent({ type: 'snapshot', snapshot: modelSettingsRuntimeSnapshot.value })
})

const settingsAudioDeviceStore = useSettingsAudioDevice()
const { stream, enabled } = storeToRefs(settingsAudioDeviceStore)
const { askPermission, startStream, stopStream } = settingsAudioDeviceStore
const { nowSpeaking } = storeToRefs(useSpeakingStore())
const hearingStore = useHearingStore()
const { activeTranscriptionModel, activeTranscriptionProvider } = storeToRefs(hearingStore)
const hearingPipeline = useHearingSpeechInputPipeline()
const { removeStreamingTranscriptionConsumer, transcribeForMediaStream, stopStreamingTranscription } = hearingPipeline
const { error: transcriptionError, supportsStreamInput } = storeToRefs(hearingPipeline)
const transcriptionConsumerId = 'stage-tamagotchi:voice-input'
const chatStore = useChatStore()
const chatSession = useChatSessionStore()
const streamingTranscriptionUnavailable = ref(false)
const shouldUseStreamInput = computed(() => supportsStreamInput.value && !!stream.value && !streamingTranscriptionUnavailable.value)
const voiceTranscriptBuffer = createTranscriptBuffer({
  flushDelayMs: 1200,
  maxBufferedTextLength: 90,
  async flush(text) {
    await sendVoiceInputTextToChat(text)
  },
})

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
 * Captures whether a queued VAD segment can still leave the app for ASR.
 */
function inspectVoiceInputProviderRequestGate(generation: unknown) {
  const current = generation === voiceInputGeneration
  const audioEnabled = enabled.value
  const suppressed = isVoiceInputSuppressed()
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
  const audioEnabled = enabled.value
  const suppressed = isVoiceInputSuppressed()

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
  if (!enabled.value)
    return false

  if (stream.value?.getAudioTracks().some(track => track.readyState === 'live'))
    return true

  stopStream()

  if (!enabled.value)
    return false

  await askPermission()

  if (!enabled.value)
    return false

  await startStream()

  if (!enabled.value) {
    stopStream()
    return false
  }

  if (stream.value?.getAudioTracks().some(track => track.readyState === 'live'))
    return true

  throw new Error('Microphone stream did not provide a live audio track')
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
 * Sends buffered voice input text to the active chat session.
 */
async function sendVoiceInputTextToChat(text: string) {
  try {
    await chatStore.send({
      sessionId: chatSession.activeSessionId,
      text,
    })
  }
  catch (err) {
    reportVoiceInputFailure('send to chat', err)
  }
}

/** Sends completed streaming-ASR sentences to captions and chat. */
function handleStreamingSentenceEnd(delta: string) {
  if (isVoiceInputSuppressed())
    return

  const finalText = delta
  if (!finalText || !finalText.trim())
    return

  const sourceId = currentHearingInputSourceId()
  replaceHearingInput(finalText)
  scheduleHearingInputClear(sourceId)
  activeHearingInputSourceId = undefined
  postSpeakerCaption(finalText, 'replace')
  void sendVoiceInputTextToChat(finalText)
}

/** Replaces the caption with the provider's current volatile transcript. */
function handleStreamingTranscriptionUpdate(text: string) {
  if (isVoiceInputSuppressed())
    return

  replaceHearingInput(text)
  postSpeakerCaption(text, 'replace')
}

/** Publishes the provider's final streaming-ASR text to the caption overlay. */
function handleStreamingSpeechEnd(text: string) {
  if (isVoiceInputSuppressed())
    return

  postSpeakerCaption(text, 'replace')
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
  canStartSegment: () => enabled.value && !isVoiceInputSuppressed(),
  inspectBeforeTranscription: ({ metadata }) => inspectVoiceInputProviderRequestGate(getVoiceInputGeneration(metadata)),
  inspectAfterTranscription: ({ metadata }) => inspectVoiceInputProviderRequestGate(getVoiceInputGeneration(metadata)),
  onRecordingReady: () => ({ generation: voiceInputGeneration }),
  onTranscriptionResult: ({ text }) => {
    postSpeakerCaption(text)
    toast(`Voice input transcribed: ${text}`)
    voiceTranscriptBuffer.push(text)
  },
  onTranscriptionEmpty: () => {
    if (transcriptionError.value) {
      reportVoiceInputFailure('transcribe speech', transcriptionError.value)
      return
    }

    toast('Voice input transcribed no text.')
  },
  onTranscriptionError: ({ error }) => {
    reportVoiceInputFailure('transcribe speech', error)
  },
})

/** Starts the active streaming or recorder-backed voice-input consumers. */
async function startAudioInteractionConsumers() {
  if (isVoiceInputSuppressed()) {
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

  if (flushTranscript)
    await voiceTranscriptBuffer.dispose()
  else
    voiceTranscriptBuffer.clear()
}

watch(enabled, async (val) => {
  try {
    if (val) {
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
  if (!enabled.value)
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
  removeStreamingTranscriptionConsumer(transcriptionConsumerId)
  for (const [timer, sourceId] of hearingInputClearTimers) {
    clearTimeout(timer)
    clearHearingInput(sourceId)
  }
  hearingInputClearTimers.clear()
  clearHearingInput()
  postModelSettingsRuntimeEvent({
    type: 'owner-gone',
    ownerInstanceId: modelSettingsRuntimeOwnerInstanceId,
  })
  clearAssistantSpeechResumeTimer()
  void voiceInputInteractionLifecycle.stop().catch(error => reportVoiceInputFailure('stop listening', error))
})

watch(stream, async (currentStream) => {
  if (!enabled.value || !currentStream || voiceInputInteractionLifecycle.isStarting() || voiceInputInteractionLifecycle.isStopping() || isVoiceInputSuppressed())
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
    <div v-if="isAroundWindowBorderFor250Ms && !isLoading" class="pointer-events-none absolute left-0 top-0 z-999 h-full w-full">
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

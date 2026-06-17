<script setup lang="ts">
import type { ModelSettingsRuntimeSnapshot } from '@proj-airi/stage-ui/components/scenarios/settings/model-settings/runtime'

import type { ModelSettingsRuntimeChannelEvent } from '../../shared/model-settings-runtime'
import type { VoiceInputTranscriptionTicket } from '../utils/voice-input-transcription-queue'

import workletUrl from '@proj-airi/stage-ui/workers/vad/process.worklet?worker&url'

import { electron } from '@proj-airi/electron-eventa'
import {
  useElectronEventaInvoke,
  useElectronMouseAroundWindowBorder,
  useElectronMouseInElement,
  useElectronMouseInWindow,
  useElectronRelativeMouse,
} from '@proj-airi/electron-vueuse'
import { IS_DEV } from '@proj-airi/stage-shared'
import { useModelStore, useThreeSceneIsTransparentAtPoint } from '@proj-airi/stage-ui-three'
import { HoloCoupon } from '@proj-airi/stage-ui/components'
import {
  createEmptyModelSettingsRuntimeSnapshot,
  resolveComponentStateToRuntimePhase,
} from '@proj-airi/stage-ui/components/scenarios/settings/model-settings/runtime'
import { WidgetStage } from '@proj-airi/stage-ui/components/scenes'
import { useCanvasPixelIsTransparentAtPoint } from '@proj-airi/stage-ui/composables/canvas-alpha'
import { useVAD } from '@proj-airi/stage-ui/stores/ai/models/vad'
import { useSpeakingStore } from '@proj-airi/stage-ui/stores/audio'
import { useHearingSpeechInputPipeline } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useOnboardingStore } from '@proj-airi/stage-ui/stores/onboarding'
import { useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { refDebounced, useBroadcastChannel } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, shallowRef, toRef, watch } from 'vue'
import { toast } from 'vue-sonner'

import ControlsIsland from '../components/stage-islands/controls-island/index.vue'
import ResourceStatusIsland from '../components/stage-islands/resource-status-island/index.vue'
import StatusIsland from '../components/stage-islands/status-island/index.vue'

import { electronOpenOnboarding } from '../../shared/eventa'
import { modelSettingsRuntimeSnapshotChannelName } from '../../shared/model-settings-runtime'
import { useChatSyncStore } from '../stores/chat-sync'
import { useControlsIslandStore } from '../stores/controls-island'
import { useStageWindowLifecycleStore } from '../stores/stage-window-lifecycle'
import { postBroadcastChannelEvent } from '../utils/broadcast-channel'
import { shouldSampleStageTransparency } from '../utils/stage-three-transparency'
import { createVoiceInputWavFromPcmSegment, shouldSkipVoiceInputSegment } from '../utils/voice-input-audio-segment'
import { createVoiceInputDebugRecorder, installVoiceInputDebugConsole } from '../utils/voice-input-debug'
import { formatVoiceInputFailure, postVoiceInputCaption } from '../utils/voice-input-feedback'
import { hasLiveAudioInputTrack } from '../utils/voice-input-recording'
import {
  assistantSpeechCooldownDeadline,
  DEFAULT_ASSISTANT_SPEECH_INPUT_COOLDOWN_MS,
  shouldSuppressVoiceInput,
} from '../utils/voice-input-suppression'
import { createVoiceInputTranscriptBuffer } from '../utils/voice-input-transcript-buffer'
import { createVoiceInputTranscriptionQueue } from '../utils/voice-input-transcription-queue'
import { getVoiceInputVadProfile, readVoiceInputVadProfileName } from '../utils/voice-input-vad-profile'

const controlsIslandRef = ref<InstanceType<typeof ControlsIsland>>()
const statusIslandRef = ref<InstanceType<typeof StatusIsland>>()
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
const { isOutside } = useElectronMouseInElement(controlsIslandRef)
const { isOutside: isOutsideStatusIsland } = useElectronMouseInElement(statusIslandRef)
const isOutsideFor250Ms = refDebounced(isOutside, 250)
const isOutsideStatusIslandFor250Ms = refDebounced(isOutsideStatusIsland, 250)
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

  if (stageModelRenderer.value === 'live2d')
    return isTransparentByPixels.value

  return true
})

const { isNearAnyBorder: isAroundWindowBorder } = useElectronMouseAroundWindowBorder({ threshold: 10 })
const isAroundWindowBorderFor250Ms = refDebounced(isAroundWindowBorder, 250)

const setIgnoreMouseEvents = useElectronEventaInvoke(electron.window.setIgnoreMouseEvents)

const { pause, resume } = watch(isTransparent, (transparent) => {
  shouldFadeOnCursorWithin.value = fadeOnHoverEnabled.value && !transparent
}, { immediate: true })

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

watch([isOutsideFor250Ms, isOutsideStatusIslandFor250Ms, isAroundWindowBorderFor250Ms, isOutsideWindow, isTransparent, hearingDialogOpen, fadeOnHoverEnabled, stagePaused], () => {
  if (stagePaused.value) {
    isIgnoringMouseEvents.value = false
    shouldFadeOnCursorWithin.value = false
    setIgnoreMouseEvents([false, { forward: true }])
    pause()
    return
  }

  if (hearingDialogOpen.value) {
    // Hearing dialog/drawer is open; keep window interactive
    isIgnoringMouseEvents.value = false
    shouldFadeOnCursorWithin.value = false
    setIgnoreMouseEvents([false, { forward: true }])
    pause()
    return
  }

  const insideControls = !isOutsideFor250Ms.value || !isOutsideStatusIslandFor250Ms.value
  const nearBorder = isAroundWindowBorderFor250Ms.value

  if (insideControls || nearBorder) {
    // Inside interactive controls or near resize border: do NOT ignore events
    isIgnoringMouseEvents.value = false
    shouldFadeOnCursorWithin.value = false
    setIgnoreMouseEvents([false, { forward: true }])
    pause()
  }
  else {
    const fadeEnabled = fadeOnHoverEnabled.value
    // Otherwise allow click-through while we fade UI based on transparency (when enabled)
    isIgnoringMouseEvents.value = fadeEnabled
    shouldFadeOnCursorWithin.value = fadeEnabled && !isOutsideWindow.value && !isTransparent.value
    setIgnoreMouseEvents([fadeEnabled, { forward: true }])
    if (fadeEnabled)
      resume()
    else
      pause()
  }
})

// Emit runtime snapshot on change and on request from settings panel
/**
 * Sends model-settings runtime events without letting closed HMR channels break the stage.
 */
function postModelSettingsRuntimeEvent(event: ModelSettingsRuntimeChannelEvent) {
  postBroadcastChannelEvent(postModelSettingsRuntimeChannelEvent, event, (error) => {
    console.warn('[Main Page] Failed to post model settings runtime event:', error)
  })
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
const hearingPipeline = useHearingSpeechInputPipeline()
const { transcribeForRecording, transcribeForMediaStream, stopStreamingTranscription } = hearingPipeline
const { error: transcriptionError, supportsStreamInput } = storeToRefs(hearingPipeline)
const chatSyncStore = useChatSyncStore()
const shouldUseStreamInput = computed(() => supportsStreamInput.value && !!stream.value)
const voiceInputVadProfile = getVoiceInputVadProfile(readVoiceInputVadProfileName())
const voiceInputDebugEnabled = IS_DEV || globalThis.localStorage?.getItem('airi:debug') === '1'
const voiceInputDebugRecorder = createVoiceInputDebugRecorder({
  enabled: voiceInputDebugEnabled,
})
const voiceInputTranscriptionQueue = createVoiceInputTranscriptionQueue()
const uninstallVoiceInputDebugConsole = voiceInputDebugEnabled
  ? installVoiceInputDebugConsole(globalThis, voiceInputDebugRecorder)
  : undefined
const voiceTranscriptBuffer = createVoiceInputTranscriptBuffer({
  flushDelayMs: 1200,
  maxBufferedTextLength: 90,
  async flush(text) {
    await sendVoiceInputTextToChat(text)
  },
})

const { init: initVAD, dispose: disposeVAD, start: startVAD, loaded: vadLoaded } = useVAD(workletUrl, {
  threshold: ref(voiceInputVadProfile.vad.threshold),
  minSilenceDurationMs: ref(voiceInputVadProfile.vad.minSilenceDurationMs),
  speechPadMs: ref(voiceInputVadProfile.vad.speechPadMs),
  minSpeechDurationMs: ref(voiceInputVadProfile.vad.minSpeechDurationMs),
  onSpeechStart: () => {
    void handleSpeechStart()
  },
  onSpeechEnd: () => {
    void handleSpeechEnd()
  },
  onSpeechReady: (event) => {
    void voiceInputTranscriptionQueue.enqueue(ticket => handleSpeechReady(event, ticket))
  },
})

const audioInteractionStarting = ref(false)
const assistantSpeechSuppressedUntil = shallowRef(0)
const assistantSpeechResumeTimer = shallowRef<ReturnType<typeof setTimeout>>()

// Caption overlay broadcast channel
type CaptionChannelEvent
  = | { type: 'caption-speaker', text: string }
    | { type: 'caption-assistant', text: string }
const { post: postCaption } = useBroadcastChannel<CaptionChannelEvent, CaptionChannelEvent>({ name: 'airi-caption-overlay' })

console.info('[Main Page] Voice input VAD profile resolved', voiceInputVadProfile)

/**
 * Reports a voice input pipeline failure to both developer logs and the visible app UI.
 */
function reportVoiceInputFailure(action: string, error: unknown) {
  const message = formatVoiceInputFailure(action, error)
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
function inspectVoiceInputProviderRequestGate(ticket: VoiceInputTranscriptionTicket) {
  const current = ticket.isCurrent()
  const audioEnabled = enabled.value
  const suppressed = isVoiceInputSuppressed()

  return {
    current,
    enabled: audioEnabled,
    suppressed,
    skip: !current || !audioEnabled || suppressed,
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

  assistantSpeechResumeTimer.value = setTimeout(() => {
    assistantSpeechResumeTimer.value = undefined
    if (!enabled.value || isVoiceInputSuppressed())
      return

    void startAudioInteraction()
  }, DEFAULT_ASSISTANT_SPEECH_INPUT_COOLDOWN_MS)
}

/**
 * Ensures the microphone stream has a live audio track before binding recorder or VAD.
 */
async function ensureLiveAudioInputStream() {
  if (hasLiveAudioInputTrack(stream.value))
    return true

  console.warn('[Main Page] Microphone stream is missing or ended; refreshing audio input stream')
  stopStream()
  await askPermission()
  await startStream()

  if (hasLiveAudioInputTrack(stream.value))
    return true

  console.warn('[Main Page] Audio input stream refresh did not produce a live audio track')
  return false
}

/**
 * Sends voice captions as best-effort overlay updates without interrupting chat ingestion.
 */
function postSpeakerCaption(text: string) {
  postVoiceInputCaption(postCaption, { type: 'caption-speaker', text }, (error) => {
    console.warn('[Main Page] Failed to post voice input caption:', error)
  })
}

/**
 * Sends buffered voice input text to the active chat session.
 */
async function sendVoiceInputTextToChat(text: string) {
  try {
    console.info('[Main Page] Sending voice input to chat:', text)
    await chatSyncStore.requestIngest({ text })
  }
  catch (err) {
    reportVoiceInputFailure('send to chat', err)
  }
}

function handleStreamingSentenceEnd(delta: string) {
  if (isVoiceInputSuppressed()) {
    console.info('[Main Page] Ignoring transcription delta while assistant speech is active or cooling down')
    return
  }

  console.info('[Main Page] Received transcription delta:', delta)
  const finalText = delta
  if (!finalText || !finalText.trim()) {
    return
  }

  postSpeakerCaption(finalText)
  void sendVoiceInputTextToChat(finalText)
}

function handleStreamingSpeechEnd(text: string) {
  if (isVoiceInputSuppressed()) {
    console.info('[Main Page] Ignoring speech end while assistant speech is active or cooling down')
    return
  }

  console.info('[Main Page] Speech ended, final text:', text)
  postSpeakerCaption(text)
}

async function handleSpeechStart() {
  if (isVoiceInputSuppressed()) {
    console.info('[Main Page] Ignoring speech start while assistant speech is active or cooling down')
    return
  }

  if (shouldUseStreamInput.value) {
    console.info('Speech detected - transcription session should already be active')
    return
  }

  console.info('[Main Page] Speech detected, waiting for VAD speech-ready segment')
}

async function handleSpeechEnd() {
  if (isVoiceInputSuppressed()) {
    console.info('[Main Page] Ignoring speech end while assistant speech is active or cooling down')
    return
  }

  if (shouldUseStreamInput.value) {
    // Keep streaming session alive; idle timer in pipeline will handle teardown.
    return
  }

  console.info('[Main Page] Speech ended, VAD segment should be ready shortly')
}

/**
 * Sends the exact VAD speech segment to the record-then-transcribe provider.
 */
async function handleSpeechReady(event: { buffer: Float32Array, duration: number }, ticket: VoiceInputTranscriptionTicket) {
  if (shouldUseStreamInput.value)
    return

  if (isVoiceInputSuppressed()) {
    console.info('[Main Page] Dropping VAD speech segment while assistant speech is active or cooling down', {
      durationMs: event.duration,
      sampleCount: event.buffer.length,
    })
    return
  }

  const { blob, diagnostics } = createVoiceInputWavFromPcmSegment({
    buffer: event.buffer,
    durationMs: event.duration,
  })
  const gate = shouldSkipVoiceInputSegment(diagnostics, voiceInputVadProfile.segmentQualityGate)
  const debugEntry = voiceInputDebugRecorder.recordAttempt({ blob, diagnostics })
  console.info('[Main Page] VAD speech segment ready', {
    ...diagnostics,
    recordingSize: blob.size,
    skipReason: gate.skip ? gate.reason : undefined,
    debugAudioUrl: debugEntry?.audioUrl,
  })

  if (debugEntry) {
    console.info('[Main Page] Voice input debug clip recorded', {
      id: debugEntry.id,
      audioUrl: debugEntry.audioUrl,
      diagnostics,
    })
  }

  if (gate.skip) {
    voiceInputDebugRecorder.markResult(debugEntry?.id, {
      status: 'skipped',
      error: `Skipped local segment: ${gate.reason}`,
      skipReason: gate.reason,
    })
    return
  }

  const requestGate = inspectVoiceInputProviderRequestGate(ticket)
  if (requestGate.skip) {
    voiceInputDebugRecorder.markResult(debugEntry?.id, {
      status: 'skipped',
      error: 'Skipped stale voice input segment before transcription request',
    })
    console.info('[Main Page] Dropping stale speech segment before transcription request', {
      ...requestGate,
      ...diagnostics,
      recordingSize: blob.size,
    })
    return
  }

  let text = ''
  try {
    text = await transcribeForRecording(blob) ?? ''
  }
  catch (error) {
    voiceInputDebugRecorder.markResult(debugEntry?.id, {
      status: 'failed',
      error: formatVoiceInputFailure('transcribe speech', error),
    })
    reportVoiceInputFailure('transcribe speech', error)
    return
  }

  const resultGate = inspectVoiceInputProviderRequestGate(ticket)
  if (resultGate.skip) {
    voiceInputDebugRecorder.markResult(debugEntry?.id, {
      status: 'skipped',
      error: 'Skipped stale transcription result after voice input stopped or assistant speech started',
    })
    console.info('[Main Page] Dropping stale transcription result', {
      ...resultGate,
      text,
    })
    return
  }

  if (!text || !text.trim()) {
    const message = transcriptionError.value
      ? formatVoiceInputFailure('transcribe speech', transcriptionError.value)
      : 'Voice input transcribed no text.'
    voiceInputDebugRecorder.markResult(debugEntry?.id, {
      status: 'empty',
      error: message,
    })
    console.warn('[Main Page]', message, {
      transcriptionError: transcriptionError.value,
      ...diagnostics,
      recordingSize: blob.size,
      recordingType: blob.type,
    })
    toast(message)
    return
  }

  voiceInputDebugRecorder.markResult(debugEntry?.id, {
    status: 'transcribed',
    text,
  })
  postSpeakerCaption(text)
  toast(`Voice input transcribed: ${text}`)
  voiceTranscriptBuffer.push(text)
}

async function startAudioInteraction() {
  if (isVoiceInputSuppressed()) {
    console.info('[Main Page] Voice input start skipped while assistant speech is active or cooling down')
    return
  }

  if (audioInteractionStarting.value)
    return

  audioInteractionStarting.value = true
  try {
    console.info('[Main Page] Starting audio interaction...')

    if (!await ensureLiveAudioInputStream())
      return

    initVAD().then(() => {
      if (enabled.value && stream.value && !isVoiceInputSuppressed()) {
        console.info('[Main Page] VAD initialized successfully, starting with stream input')
        return startVAD(stream.value)
      }
    }).catch((err) => {
      console.warn('[Main Page] VAD initialization failed (non-critical for Web Speech API):', err)
      toast.error(formatVoiceInputFailure('initialize speech detection', err))
    })

    if (shouldUseStreamInput.value) {
      console.info('[Main Page] Starting streaming transcription...', {
        supportsStreamInput: supportsStreamInput.value,
        hasStream: !!stream.value,
      })

      if (!stream.value) {
        console.warn('[Main Page] Stream not available despite shouldUseStreamInput being true')
        return
      }

      // Use sentence deltas for live captions and speech end for final text.
      await transcribeForMediaStream(stream.value, {
        onSentenceEnd: handleStreamingSentenceEnd,
        onSpeechEnd: handleStreamingSpeechEnd,
      })

      console.info('[Main Page] Streaming transcription started successfully')
    }
    else {
      console.warn('[Main Page] Not starting streaming transcription:', {
        shouldUseStreamInput: shouldUseStreamInput.value,
        hasStream: !!stream.value,
        supportsStreamInput: supportsStreamInput.value,
      })
    }

    console.info('[Main Page] Record-then-transcribe providers will use VAD speech-ready segments')
  }
  catch (e) {
    reportVoiceInputFailure('start listening', e)
  }
  finally {
    audioInteractionStarting.value = false
  }
}

/**
 * Stops active microphone consumers before the stage binds to another audio stream.
 */
async function stopAudioInteraction(options: {
  flushTranscript?: boolean
  clearQueuedTranscription?: boolean
} = {}) {
  try {
    const flushTranscript = options.flushTranscript ?? true
    const clearQueuedTranscription = options.clearQueuedTranscription ?? true

    clearAssistantSpeechResumeTimer()
    audioInteractionStarting.value = false
    if (clearQueuedTranscription)
      voiceInputTranscriptionQueue.clearPending()

    if (flushTranscript)
      await voiceTranscriptBuffer.dispose()
    else
      voiceTranscriptBuffer.clear()

    const stoppedStreaming = stopStreamingTranscription(true)
    disposeVAD()
    await Promise.allSettled([stoppedStreaming])
  }
  catch (error) {
    reportVoiceInputFailure('stop listening', error)
  }
}

watch(enabled, async (val) => {
  console.info('[Main Page] Audio enabled changed:', val, 'stream available:', !!stream.value)
  if (val) {
    await askPermission()
    await startAudioInteraction()
  }
  else {
    await stopAudioInteraction()
  }
}, { immediate: true })

watch(nowSpeaking, async (speaking) => {
  if (speaking) {
    clearAssistantSpeechResumeTimer()
    console.info('[Main Page] Assistant speech started, suspending voice input')
    await stopAudioInteraction({ flushTranscript: false })
    return
  }

  assistantSpeechSuppressedUntil.value = assistantSpeechCooldownDeadline()
  console.info('[Main Page] Assistant speech ended, scheduling voice input resume', {
    cooldownMs: DEFAULT_ASSISTANT_SPEECH_INPUT_COOLDOWN_MS,
  })
  scheduleAssistantSpeechResume()
})

onMounted(() => {
  if (onboardingStore.needsOnboarding) {
    openOnboarding()
  }
})

onUnmounted(() => {
  postModelSettingsRuntimeEvent({
    type: 'owner-gone',
    ownerInstanceId: modelSettingsRuntimeOwnerInstanceId,
  })
  clearAssistantSpeechResumeTimer()
  uninstallVoiceInputDebugConsole?.()
  voiceInputDebugRecorder.dispose()
  void stopAudioInteraction()
})

watch(stream, async (currentStream) => {
  if (!enabled.value || !currentStream || audioInteractionStarting.value || isVoiceInputSuppressed())
    return

  // NOTICE: The controls-island mic toggle and device changes can replace the underlying MediaStream
  // without reloading the page. When that happens, VAD may successfully restart against the new stream,
  // but any existing transcription transport is still bound to the old one. Always allow the page to
  // re-run `startAudioInteraction()` for a newly available stream unless startup is already underway.
  console.info('[Main Page] Stream changed, restarting audio interaction')
  await stopAudioInteraction()
  await startAudioInteraction()
})

watch([stream, () => vadLoaded.value], async ([s, loaded]) => {
  if (enabled.value && loaded && s && !isVoiceInputSuppressed()) {
    try {
      await startVAD(s)
    }
    catch (e) {
      console.error('Failed to start VAD with stream:', e)
    }
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
        <StatusIsland v-if="IS_DEV" ref="statusIslandRef" />
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
        <ControlsIsland
          ref="controlsIslandRef"
        />
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
        <div class="absolute left-0 top-0 h-full w-full flex animate-flash animate-duration-5s animate-count-infinite select-none items-center justify-center text-1.5rem text-primary-400 font-normal drag-region">
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

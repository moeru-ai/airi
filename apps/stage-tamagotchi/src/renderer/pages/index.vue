<script setup lang="ts">
import type { ModelSettingsRuntimeSnapshot } from '@proj-airi/stage-ui/components/scenarios/settings/model-settings/runtime'

import type { ModelSettingsRuntimeChannelEvent } from '../../shared/model-settings-runtime'

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
import { useVoiceInputSession } from '@proj-airi/stage-ui/composables'
import { useCanvasPixelIsTransparentAtPoint } from '@proj-airi/stage-ui/composables/canvas-alpha'
import { useSpeakingStore } from '@proj-airi/stage-ui/stores/audio'
import { useHearingSpeechInputPipeline, useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
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
import { createVoiceInputDebugRecorder, installVoiceInputDebugConsole } from '../utils/voice-input-debug'
import { formatVoiceInputFailure, postVoiceInputCaption } from '../utils/voice-input-feedback'
import { hasLiveAudioInputTrack } from '../utils/voice-input-recording'
import {
  assistantSpeechCooldownDeadline,
  DEFAULT_ASSISTANT_SPEECH_INPUT_COOLDOWN_MS,
  shouldSuppressVoiceInput,
} from '../utils/voice-input-suppression'
import { createVoiceInputTranscriptBuffer } from '../utils/voice-input-transcript-buffer'
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
const voiceInputLogsOpen = ref(false)

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

watch([isOutsideFor250Ms, isOutsideStatusIslandFor250Ms, isAroundWindowBorderFor250Ms, isOutsideWindow, isTransparent, hearingDialogOpen, voiceInputLogsOpen, fadeOnHoverEnabled, stagePaused], () => {
  if (stagePaused.value) {
    isIgnoringMouseEvents.value = false
    shouldFadeOnCursorWithin.value = false
    setIgnoreMouseEvents([false, { forward: true }])
    pause()
    return
  }

  if (hearingDialogOpen.value || voiceInputLogsOpen.value) {
    // Hearing dialog/drawer or diagnostics panel is open; keep window interactive
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
const hearingStore = useHearingStore()
const { activeTranscriptionModel, activeTranscriptionProvider } = storeToRefs(hearingStore)
const hearingPipeline = useHearingSpeechInputPipeline()
const { transcribeForMediaStream, stopStreamingTranscription } = hearingPipeline
const { error: transcriptionError, supportsStreamInput } = storeToRefs(hearingPipeline)
const chatSyncStore = useChatSyncStore()
const streamingTranscriptionUnavailable = ref(false)
const shouldUseStreamInput = computed(() => supportsStreamInput.value && !!stream.value && !streamingTranscriptionUnavailable.value)
const voiceInputVadProfile = getVoiceInputVadProfile(readVoiceInputVadProfileName())
const voiceInputDebugEnabled = IS_DEV || globalThis.localStorage?.getItem('airi:debug') === '1'
const voiceInputDebugRecorder = createVoiceInputDebugRecorder({
  enabled: voiceInputDebugEnabled,
})
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

const audioInteractionStarting = ref(false)
const audioInteractionStopping = ref(false)
const assistantSpeechSuppressedUntil = shallowRef(0)
const assistantSpeechResumeTimer = shallowRef<ReturnType<typeof setTimeout>>()
let voiceInputGeneration = 0

type VoiceInputLogLevel = 'info' | 'warn' | 'error'

interface VoiceInputLogEntry {
  id: number
  at: string
  level: VoiceInputLogLevel
  event: string
  message: string
  details?: Record<string, unknown>
}

const voiceInputLogs = ref<VoiceInputLogEntry[]>([])
let nextVoiceInputLogId = 1

function normalizeVoiceInputLogDetails(details?: Record<string, unknown>) {
  if (!details)
    return undefined

  return Object.fromEntries(
    Object.entries(details).map(([key, value]) => {
      if (value instanceof Blob) {
        return [key, {
          size: value.size,
          type: value.type,
        }]
      }

      if (value instanceof MediaStream) {
        return [key, {
          id: value.id,
          active: value.active,
          audioTracks: value.getAudioTracks().map(track => ({
            enabled: track.enabled,
            id: track.id,
            label: track.label,
            muted: track.muted,
            readyState: track.readyState,
          })),
        }]
      }

      if (value instanceof Error) {
        return [key, {
          message: value.message,
          name: value.name,
        }]
      }

      return [key, value]
    }),
  )
}

function writeVoiceInputLog(level: VoiceInputLogLevel, event: string, message: string, details?: Record<string, unknown>) {
  const entry: VoiceInputLogEntry = {
    id: nextVoiceInputLogId++,
    at: new Date().toLocaleTimeString(),
    level,
    event,
    message,
    details: normalizeVoiceInputLogDetails(details),
  }

  voiceInputLogs.value = [...voiceInputLogs.value.slice(-199), entry]
}

const formattedVoiceInputLogs = computed(() => {
  return voiceInputLogs.value.map((entry) => {
    const details = entry.details ? `\n${JSON.stringify(entry.details, null, 2)}` : ''
    return `[${entry.at}] ${entry.level.toUpperCase()} ${entry.event}: ${entry.message}${details}`
  }).join('\n\n')
})

function clearVoiceInputLogs() {
  voiceInputLogs.value = []
}

function openVoiceInputLogs() {
  voiceInputLogsOpen.value = true
}

async function copyVoiceInputLogs() {
  await navigator.clipboard.writeText(formattedVoiceInputLogs.value)
  toast('Voice input logs copied.')
}

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
  writeVoiceInputLog('error', `failure:${action}`, message, { error })
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

  if (!enabled.value) {
    writeVoiceInputLog('info', 'assistant-resume-skip', 'Voice input is disabled after assistant speech.')
    return
  }

  writeVoiceInputLog('info', 'assistant-resume-scheduled', 'Voice input will resume after assistant speech cooldown.', {
    cooldownMs: DEFAULT_ASSISTANT_SPEECH_INPUT_COOLDOWN_MS,
  })
  assistantSpeechResumeTimer.value = setTimeout(() => {
    assistantSpeechResumeTimer.value = undefined
    if (!enabled.value || isVoiceInputSuppressed()) {
      writeVoiceInputLog('info', 'assistant-resume-skipped-after-cooldown', 'Voice input is still disabled or suppressed.')
      return
    }

    void startAudioInteraction()
  }, DEFAULT_ASSISTANT_SPEECH_INPUT_COOLDOWN_MS)
}

/**
 * Ensures the microphone stream has a live audio track before binding recorder or VAD.
 */
async function ensureLiveAudioInputStream() {
  if (!enabled.value) {
    writeVoiceInputLog('info', 'stream-skip', 'Audio input is disabled.')
    return false
  }

  if (hasLiveAudioInputTrack(stream.value)) {
    writeVoiceInputLog('info', 'stream-ready', 'Existing microphone stream has a live audio track.', { stream: stream.value })
    return true
  }

  writeVoiceInputLog('warn', 'stream-refresh', 'Microphone stream is missing or ended; refreshing.')
  console.warn('[Main Page] Microphone stream is missing or ended; refreshing audio input stream')
  stopStream()

  if (!enabled.value) {
    writeVoiceInputLog('info', 'stream-refresh-aborted', 'Audio input was disabled before permission refresh.')
    return false
  }

  writeVoiceInputLog('info', 'permission-request', 'Requesting microphone permission.')
  await askPermission()

  if (!enabled.value) {
    writeVoiceInputLog('info', 'stream-refresh-aborted', 'Audio input was disabled during permission refresh.')
    console.info('[Main Page] Skipping audio input stream restart because voice input was disabled during permission refresh')
    return false
  }

  writeVoiceInputLog('info', 'stream-start', 'Starting microphone stream.')
  await startStream()

  if (!enabled.value) {
    writeVoiceInputLog('info', 'stream-start-aborted', 'Audio input was disabled during stream restart.')
    console.info('[Main Page] Stopping refreshed audio input stream because voice input was disabled during stream restart')
    stopStream()
    return false
  }

  if (hasLiveAudioInputTrack(stream.value)) {
    writeVoiceInputLog('info', 'stream-ready', 'Refreshed microphone stream has a live audio track.', { stream: stream.value })
    return true
  }

  writeVoiceInputLog('warn', 'stream-missing-track', 'Audio input stream refresh did not produce a live audio track.', { stream: stream.value })
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
    writeVoiceInputLog('info', 'chat-send-start', 'Sending transcribed voice input to chat.', { text })
    console.info('[Main Page] Sending voice input to chat:', text)
    await chatSyncStore.requestIngest({ text })
    writeVoiceInputLog('info', 'chat-send-success', 'Transcribed voice input was sent to chat.', { text })
  }
  catch (err) {
    reportVoiceInputFailure('send to chat', err)
  }
}

function handleStreamingSentenceEnd(delta: string) {
  if (isVoiceInputSuppressed()) {
    writeVoiceInputLog('info', 'streaming-delta-ignored', 'Ignored streaming transcription delta while voice input is suppressed.', { delta })
    console.info('[Main Page] Ignoring transcription delta while assistant speech is active or cooling down')
    return
  }

  console.info('[Main Page] Received transcription delta:', delta)
  const finalText = delta
  if (!finalText || !finalText.trim()) {
    writeVoiceInputLog('warn', 'streaming-empty-delta', 'Streaming transcription emitted an empty delta.')
    return
  }

  writeVoiceInputLog('info', 'streaming-delta', 'Streaming transcription emitted text.', { text: finalText })
  postSpeakerCaption(finalText)
  void sendVoiceInputTextToChat(finalText)
}

function handleStreamingSpeechEnd(text: string) {
  if (isVoiceInputSuppressed()) {
    writeVoiceInputLog('info', 'streaming-speech-end-ignored', 'Ignored streaming speech end while voice input is suppressed.', { text })
    console.info('[Main Page] Ignoring speech end while assistant speech is active or cooling down')
    return
  }

  writeVoiceInputLog(text.trim() ? 'info' : 'warn', 'streaming-speech-end', text.trim() ? 'Streaming transcription ended with text.' : 'Streaming transcription ended with empty text.', { text })
  console.info('[Main Page] Speech ended, final text:', text)
  postSpeakerCaption(text)
}

function getVoiceInputDebugEntryId(metadata?: Record<string, unknown>) {
  return typeof metadata?.debugEntryId === 'string' ? metadata.debugEntryId : undefined
}

function getVoiceInputGeneration(metadata?: Record<string, unknown>) {
  return typeof metadata?.generation === 'number' ? metadata.generation : undefined
}

const voiceInputSession = useVoiceInputSession(stream, {
  shouldUseStreamInput,
  vad: {
    threshold: ref(voiceInputVadProfile.vad.threshold),
    minSilenceDurationMs: ref(voiceInputVadProfile.vad.minSilenceDurationMs),
    speechPadMs: ref(voiceInputVadProfile.vad.speechPadMs),
    minSpeechDurationMs: ref(voiceInputVadProfile.vad.minSpeechDurationMs),
  },
  canStartSegment: ({ trigger }) => {
    if (!enabled.value || isVoiceInputSuppressed()) {
      writeVoiceInputLog('info', 'speech-start-ignored', 'Ignored speech start while voice input is disabled or suppressed.', {
        trigger,
        enabled: enabled.value,
        suppressed: isVoiceInputSuppressed(),
      })
      return false
    }

    return true
  },
  inspectBeforeTranscription: ({ metadata }) => inspectVoiceInputProviderRequestGate(getVoiceInputGeneration(metadata)),
  inspectAfterTranscription: ({ metadata }) => inspectVoiceInputProviderRequestGate(getVoiceInputGeneration(metadata)),
  onLog: writeVoiceInputLog,
  onSegmentStart: ({ trigger }) => {
    writeVoiceInputLog('info', 'recording-start', 'Speech detected; starting recorder-backed transcription segment.', { trigger })
  },
  onSegmentStarted: ({ trigger }) => {
    writeVoiceInputLog('info', 'recording-started', 'Recorder-backed speech segment started.', { trigger })
  },
  onSegmentStop: ({ trigger }) => {
    writeVoiceInputLog('info', 'recording-stop', 'Speech ended; finalizing recorder-backed transcription segment.', { trigger })
  },
  onSegmentStopped: ({ trigger }) => {
    writeVoiceInputLog('info', 'recording-stopped', 'Recorder-backed speech segment finalized.', { trigger })
  },
  onRecordingReady: ({ recording }) => {
    const debugEntry = recording ? voiceInputDebugRecorder.recordAttempt({ blob: recording }) : undefined
    writeVoiceInputLog('info', 'recording-ready', 'Recorder-backed speech segment is ready for transcription.', {
      recording,
      debugAudioUrl: debugEntry?.audioUrl,
    })
    console.info('[Main Page] Recorder-backed speech segment ready', {
      recordingSize: recording?.size,
      recordingType: recording?.type,
      debugAudioUrl: debugEntry?.audioUrl,
    })

    return {
      debugEntryId: debugEntry?.id,
      debugAudioUrl: debugEntry?.audioUrl,
      generation: voiceInputGeneration,
    }
  },
  onRecordingSkipped: ({ gate, metadata, recording }) => {
    const debugEntryId = getVoiceInputDebugEntryId(metadata)
    const message = gate?.reason ?? 'Skipped stale voice input segment before transcription request'
    voiceInputDebugRecorder.markResult(debugEntryId, {
      status: 'skipped',
      error: message,
    })
    writeVoiceInputLog('info', 'recording-drop-stale', message, {
      gate,
      recording,
    })
  },
  onTranscriptionStart: ({ recording }) => {
    writeVoiceInputLog('info', 'asr-recording-start', 'Sending recorder-backed segment to transcription provider.', {
      recording,
      provider: activeTranscriptionProvider.value,
      model: activeTranscriptionModel.value,
    })
  },
  onTranscriptionResult: ({ text, metadata }) => {
    voiceInputDebugRecorder.markResult(getVoiceInputDebugEntryId(metadata), {
      status: 'transcribed',
      text,
    })
    writeVoiceInputLog('info', 'asr-transcribed', 'Recorder-backed speech segment transcribed successfully.', { text })
    postSpeakerCaption(text)
    toast(`Voice input transcribed: ${text}`)
    voiceTranscriptBuffer.push(text)
  },
  onTranscriptionEmpty: ({ text, recording, metadata }) => {
    const message = transcriptionError.value
      ? formatVoiceInputFailure('transcribe speech', transcriptionError.value)
      : 'Voice input transcribed no text.'
    writeVoiceInputLog('warn', 'asr-empty-text', message, {
      text,
      pipelineError: transcriptionError.value,
      recording,
    })
    voiceInputDebugRecorder.markResult(getVoiceInputDebugEntryId(metadata), {
      status: 'empty',
      error: message,
    })
    toast(message)
  },
  onTranscriptionError: ({ error, metadata }) => {
    voiceInputDebugRecorder.markResult(getVoiceInputDebugEntryId(metadata), {
      status: 'failed',
      error: formatVoiceInputFailure('transcribe speech', error),
    })
    reportVoiceInputFailure('transcribe speech', error)
  },
})
const { isRecording } = voiceInputSession

async function startAudioInteraction() {
  if (isVoiceInputSuppressed()) {
    writeVoiceInputLog('info', 'audio-start-skipped-suppressed', 'Voice input start skipped while assistant speech is active or cooling down.')
    console.info('[Main Page] Voice input start skipped while assistant speech is active or cooling down')
    return
  }

  if (audioInteractionStarting.value) {
    writeVoiceInputLog('info', 'audio-start-skipped-in-flight', 'Voice input start skipped because startup is already in progress.')
    return
  }

  audioInteractionStarting.value = true
  try {
    writeVoiceInputLog('info', 'audio-start', 'Starting voice input interaction.', {
      enabled: enabled.value,
      hasStream: !!stream.value,
      supportsStreamInput: supportsStreamInput.value,
      provider: activeTranscriptionProvider.value,
      model: activeTranscriptionModel.value,
    })
    console.info('[Main Page] Starting audio interaction...')

    if (!await ensureLiveAudioInputStream()) {
      writeVoiceInputLog('warn', 'audio-start-aborted-no-stream', 'Voice input startup stopped because no live microphone stream was available.')
      return
    }

    if (shouldUseStreamInput.value) {
      console.info('[Main Page] Starting streaming transcription...', {
        supportsStreamInput: supportsStreamInput.value,
        hasStream: !!stream.value,
      })

      if (!stream.value) {
        writeVoiceInputLog('warn', 'streaming-start-skipped-no-stream', 'Streaming transcription was requested but no microphone stream was available.')
        console.warn('[Main Page] Stream not available despite shouldUseStreamInput being true')
        return
      }

      const requestGate = inspectVoiceInputStreamingRequestGate()
      if (requestGate.skip) {
        writeVoiceInputLog('info', 'streaming-start-skipped-gate', 'Skipping streaming transcription before ASR request.', {
          ...requestGate,
          hasStream: !!stream.value,
        })
        console.info('[Main Page] Skipping streaming transcription before ASR request', {
          ...requestGate,
          hasStream: !!stream.value,
        })
        return
      }

      // Use sentence deltas for live captions and speech end for final text.
      writeVoiceInputLog('info', 'streaming-start', 'Starting streaming transcription session.', {
        provider: activeTranscriptionProvider.value,
        model: activeTranscriptionModel.value,
      })
      await transcribeForMediaStream(stream.value, {
        onSentenceEnd: handleStreamingSentenceEnd,
        onSpeechEnd: handleStreamingSpeechEnd,
      })

      const postSetupGate = inspectVoiceInputStreamingRequestGate()
      if (postSetupGate.skip) {
        await stopStreamingTranscription(true)
        writeVoiceInputLog('info', 'streaming-stop-after-setup-gate', 'Stopped streaming transcription after setup because voice input is no longer allowed.', {
          ...postSetupGate,
          hasStream: !!stream.value,
        })
        console.info('[Main Page] Stopped streaming transcription after setup because voice input is no longer allowed', {
          ...postSetupGate,
          hasStream: !!stream.value,
        })
        return
      }

      if (transcriptionError.value) {
        streamingTranscriptionUnavailable.value = true
        await stopStreamingTranscription(true)
        writeVoiceInputLog('warn', 'streaming-unavailable-fallback-recorder', 'Streaming transcription failed; falling back to VAD-triggered recorder segments.', {
          error: transcriptionError.value,
        })
        console.warn('[Main Page] Streaming transcription failed; falling back to VAD-triggered recorder segments', {
          error: transcriptionError.value,
        })
      }
      else {
        writeVoiceInputLog('info', 'streaming-started', 'Streaming transcription started successfully.')
        console.info('[Main Page] Streaming transcription started successfully')
      }
    }

    if (!shouldUseStreamInput.value) {
      writeVoiceInputLog('info', 'recording-mode-active', 'Record-then-transcribe provider will use VAD-triggered recorder segments.', {
        supportsStreamInput: supportsStreamInput.value,
        hasStream: !!stream.value,
        streamingTranscriptionUnavailable: streamingTranscriptionUnavailable.value,
      })
      console.info('[Main Page] Record-then-transcribe providers will use VAD-triggered recorder segments')
      await voiceInputSession.startAutoSegmentation()
    }
  }
  catch (e) {
    reportVoiceInputFailure('start listening', e)
  }
  finally {
    audioInteractionStarting.value = false
    writeVoiceInputLog('info', 'audio-start-finished', 'Voice input startup finished.', {
      enabled: enabled.value,
      hasStream: !!stream.value,
    })
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

    audioInteractionStopping.value = true
    writeVoiceInputLog('info', 'audio-stop', 'Stopping voice input interaction.', {
      flushTranscript,
      clearQueuedTranscription,
      isRecording: isRecording.value,
    })
    clearAssistantSpeechResumeTimer()
    audioInteractionStarting.value = false
    if (clearQueuedTranscription)
      voiceInputGeneration += 1

    if (flushTranscript)
      await voiceTranscriptBuffer.dispose()
    else
      voiceTranscriptBuffer.clear()

    const stoppedStreaming = stopStreamingTranscription(true)
    const stoppedRecordingSession = voiceInputSession.stop({ flushActiveRecording: false })
    await Promise.allSettled([stoppedStreaming, stoppedRecordingSession])
    writeVoiceInputLog('info', 'audio-stopped', 'Voice input interaction stopped.')
  }
  catch (error) {
    reportVoiceInputFailure('stop listening', error)
  }
  finally {
    audioInteractionStopping.value = false
  }
}

watch(enabled, async (val) => {
  writeVoiceInputLog('info', 'audio-enabled-changed', `Voice input was ${val ? 'enabled' : 'disabled'}.`, {
    hasStream: !!stream.value,
  })
  console.info('[Main Page] Audio enabled changed:', val, 'stream available:', !!stream.value)
  try {
    if (val) {
      await askPermission()
      await startAudioInteraction()
    }
    else {
      await stopAudioInteraction()
    }
  }
  catch (error) {
    reportVoiceInputFailure(val ? 'start listening' : 'stop listening', error)
    if (val) {
      writeVoiceInputLog('warn', 'audio-enabled-rollback', 'Rolling voice input toggle back to disabled after startup failure.')
      enabled.value = false
    }
  }
}, { immediate: true })

watch([activeTranscriptionProvider, activeTranscriptionModel, supportsStreamInput], () => {
  streamingTranscriptionUnavailable.value = false
  writeVoiceInputLog('info', 'transcription-provider-changed', 'Transcription provider/model changed; streaming fallback state reset.', {
    provider: activeTranscriptionProvider.value,
    model: activeTranscriptionModel.value,
    supportsStreamInput: supportsStreamInput.value,
  })
})

watch(nowSpeaking, async (speaking) => {
  if (speaking) {
    clearAssistantSpeechResumeTimer()
    writeVoiceInputLog('info', 'assistant-speaking-started', 'Assistant speech started; suspending voice input.')
    console.info('[Main Page] Assistant speech started, suspending voice input')
    await stopAudioInteraction({ flushTranscript: false })
    return
  }

  assistantSpeechSuppressedUntil.value = assistantSpeechCooldownDeadline()
  writeVoiceInputLog('info', 'assistant-speaking-ended', 'Assistant speech ended; scheduling voice input resume.', {
    cooldownMs: DEFAULT_ASSISTANT_SPEECH_INPUT_COOLDOWN_MS,
  })
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
  if (!enabled.value || !currentStream || audioInteractionStarting.value || isVoiceInputSuppressed()) {
    writeVoiceInputLog('info', 'stream-change-ignored', 'Microphone stream changed but restart was skipped.', {
      enabled: enabled.value,
      hasStream: !!currentStream,
      audioInteractionStarting: audioInteractionStarting.value,
      suppressed: isVoiceInputSuppressed(),
    })
    return
  }

  // NOTICE: The controls-island mic toggle and device changes can replace the underlying MediaStream
  // without reloading the page. When that happens, VAD may successfully restart against the new stream,
  // but any existing transcription transport is still bound to the old one. Always allow the page to
  // re-run `startAudioInteraction()` for a newly available stream unless startup is already underway.
  writeVoiceInputLog('info', 'stream-changed-restart', 'Microphone stream changed; restarting voice input interaction.', { stream: currentStream })
  console.info('[Main Page] Stream changed, restarting audio interaction')
  await stopAudioInteraction()
  await startAudioInteraction()
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
          @open-voice-input-logs="openVoiceInputLogs"
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
            'animate-flash stage-animation-loop-5s',
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
        <div class="stage-animation-loop-5s absolute left-0 top-0 h-full w-full flex animate-flash select-none items-center justify-center text-1.5rem text-primary-400 font-normal drag-region">
          DRAG HERE TO MOVE
        </div>
        <div class="wall absolute bottom-0 h-8 drag-region" />
      </div>
    </div>
  </Transition>
  <Transition
    enter-active-class="transition-opacity duration-150"
    enter-from-class="opacity-0"
    enter-to-class="opacity-100"
    leave-active-class="transition-opacity duration-150"
    leave-from-class="opacity-100"
    leave-to-class="opacity-0"
  >
    <div
      v-if="voiceInputLogsOpen"
      class="absolute inset-0 z-[1000] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
    >
      <div class="max-h-[86vh] max-w-4xl w-full flex flex-col overflow-hidden rounded-lg bg-white shadow-2xl dark:bg-neutral-950">
        <div class="flex items-center gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <div i-solar:document-text-outline class="size-5 text-primary-500" />
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm text-neutral-900 font-semibold dark:text-neutral-100">
              Voice Input Logs
            </div>
            <div class="truncate text-xs text-neutral-500 dark:text-neutral-400">
              {{ voiceInputLogs.length }} entries
            </div>
          </div>
          <button
            class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
            type="button"
            @click="copyVoiceInputLogs"
          >
            <div i-solar:copy-outline class="size-4" />
            Copy
          </button>
          <button
            class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
            type="button"
            @click="clearVoiceInputLogs"
          >
            <div i-solar:trash-bin-trash-outline class="size-4" />
            Clear
          </button>
          <button
            class="inline-flex rounded-md p-1 text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
            type="button"
            @click="voiceInputLogsOpen = false"
          >
            <div i-solar:close-circle-outline class="size-5" />
          </button>
        </div>
        <div class="min-h-0 flex-1 overflow-auto bg-neutral-50 p-4 text-xs text-neutral-800 leading-5 font-mono dark:bg-neutral-950 dark:text-neutral-200">
          <pre v-if="formattedVoiceInputLogs" class="whitespace-pre-wrap break-words">{{ formattedVoiceInputLogs }}</pre>
          <div v-else class="text-neutral-500">
            No voice input logs yet.
          </div>
        </div>
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
          'h-full w-full animate-flash stage-animation-loop-3s b-4 rounded-2xl',
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

.stage-animation-loop-3s {
  animation-duration: 3s;
  animation-iteration-count: infinite;
}

.stage-animation-loop-5s {
  animation-duration: 5s;
  animation-iteration-count: infinite;
}
</style>

<route lang="yaml">
meta:
  layout: stage
</route>

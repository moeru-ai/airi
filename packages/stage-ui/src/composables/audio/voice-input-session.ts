import type { MaybeRefOrGetter } from 'vue'

import type { VoiceInputRecordingSegment, VoiceInputSessionTrigger } from './voice-input-segment'
import type { VoiceInputTranscriptionTicket } from './voice-input-transcription-chain'

import { computed, ref, shallowRef, toRef } from 'vue'

import workletUrl from '../../workers/vad/process.worklet?worker&url'

import { useVAD } from '../../stores/ai/models/vad'
import { useHearingSpeechInputPipeline } from '../../stores/modules/hearing'
import { useAudioRecorder } from './audio-recorder'
import {
  createVoiceInputRecordingSegment,
  resolveActiveVoiceInputRecordingSegmentAfterStop,
} from './voice-input-segment'
import { createVoiceInputTranscriptionChain } from './voice-input-transcription-chain'
import { startVoiceInputVadDetectionSafely } from './voice-input-vad-startup'

export type { VoiceInputSessionTrigger } from './voice-input-segment'

export type VoiceInputSessionLogLevel = 'info' | 'warn' | 'error'

export interface VoiceInputSessionGate {
  skip?: boolean
  reason?: string
  details?: Record<string, unknown>
}

export interface VoiceInputSessionEvent {
  trigger: VoiceInputSessionTrigger
  recording?: Blob
  text?: string
  error?: unknown
  metadata?: Record<string, unknown>
  gate?: VoiceInputSessionGate
}

export interface VoiceInputSessionVadOptions {
  threshold?: MaybeRefOrGetter<number>
  minSilenceDurationMs?: MaybeRefOrGetter<number>
  speechPadMs?: MaybeRefOrGetter<number>
  minSpeechDurationMs?: MaybeRefOrGetter<number>
}

export interface VoiceInputSessionVolumeFallbackOptions {
  enabled?: MaybeRefOrGetter<boolean>
  startThreshold?: number
  stopThreshold?: number
  startFrames?: number
  stopDelayMs?: number
  logIntervalMs?: number
}

export interface VoiceInputSessionOptions {
  shouldUseStreamInput?: MaybeRefOrGetter<boolean>
  vad?: VoiceInputSessionVadOptions
  volumeFallback?: VoiceInputSessionVolumeFallbackOptions
  canStartSegment?: (event: VoiceInputSessionEvent) => boolean | Promise<boolean>
  inspectBeforeTranscription?: (event: VoiceInputSessionEvent) => VoiceInputSessionGate | Promise<VoiceInputSessionGate | undefined> | undefined
  inspectAfterTranscription?: (event: VoiceInputSessionEvent) => VoiceInputSessionGate | Promise<VoiceInputSessionGate | undefined> | undefined
  onLog?: (level: VoiceInputSessionLogLevel, event: string, message: string, details?: Record<string, unknown>) => void
  onSegmentStart?: (event: VoiceInputSessionEvent) => void | Promise<void>
  onSegmentStarted?: (event: VoiceInputSessionEvent) => void | Promise<void>
  onSegmentStop?: (event: VoiceInputSessionEvent) => void | Promise<void>
  onSegmentStopped?: (event: VoiceInputSessionEvent) => void | Promise<void>
  onRecordingReady?: (event: VoiceInputSessionEvent) => Record<string, unknown> | void | Promise<Record<string, unknown> | void>
  onRecordingSkipped?: (event: VoiceInputSessionEvent) => void | Promise<void>
  onTranscriptionStart?: (event: VoiceInputSessionEvent) => void | Promise<void>
  onTranscriptionResult?: (event: VoiceInputSessionEvent & { text: string }) => void | Promise<void>
  onTranscriptionEmpty?: (event: VoiceInputSessionEvent & { text: string }) => void | Promise<void>
  onTranscriptionError?: (event: VoiceInputSessionEvent & { error: unknown }) => void | Promise<void>
}

const DEFAULT_VOLUME_FALLBACK_START_THRESHOLD = 10
const DEFAULT_VOLUME_FALLBACK_STOP_THRESHOLD = 6
const DEFAULT_VOLUME_FALLBACK_START_FRAMES = 4
const DEFAULT_VOLUME_FALLBACK_STOP_DELAY_MS = 900
const DEFAULT_VOLUME_FALLBACK_LOG_INTERVAL_MS = 2000

function calculateTimeDomainVolumeLevel(dataArray: Uint8Array<ArrayBuffer>) {
  let sum = 0
  for (let i = 0; i < dataArray.length; i++) {
    const centered = (dataArray[i] - 128) / 128
    sum += centered * centered
  }

  return Math.min(100, Math.sqrt(sum / dataArray.length) * 100 * 3)
}

/**
 * Shared voice-input session for both manual STT tests and always-on stage listening.
 *
 * Owns:
 * - recorder-backed segment creation
 * - VAD-triggered auto segmentation
 * - volume-triggered fallback segmentation
 * - record-then-transcribe ASR calls
 *
 * Leaves product-specific behavior, such as sending text to chat or updating UI state, to callbacks.
 */
export function useVoiceInputSession(
  media: MaybeRefOrGetter<MediaStream | undefined>,
  options: VoiceInputSessionOptions = {},
) {
  const mediaRef = toRef(media)
  const shouldUseStreamInput = toRef(options.shouldUseStreamInput ?? false)
  const volumeFallbackEnabled = toRef(options.volumeFallback?.enabled ?? true)
  const hearingPipeline = useHearingSpeechInputPipeline()
  const { transcribeForRecording } = hearingPipeline
  const recorder = useAudioRecorder(mediaRef)

  const activeRecordingSegment = shallowRef<VoiceInputRecordingSegment>()
  const activeRecordingTrigger = computed(() => activeRecordingSegment.value?.trigger)
  const isTranscribing = ref(false)
  const lastTranscriptionText = ref('')
  const lastError = ref<unknown>()
  const transcriptionChain = createVoiceInputTranscriptionChain()
  const stoppedRecordingSegments: VoiceInputRecordingSegment[] = []
  let nextRecordingSegmentId = 0
  let discardNextRecording = false
  let activeTranscriptionCount = 0

  const {
    init: initVAD,
    dispose: disposeVAD,
    start: startVAD,
    loaded: vadLoaded,
    isSpeech: isSpeechVAD,
    isSpeechProb,
    isSpeechHistory,
    inferenceError: vadError,
  } = useVAD(workletUrl, {
    threshold: options.vad?.threshold,
    minSilenceDurationMs: options.vad?.minSilenceDurationMs,
    speechPadMs: options.vad?.speechPadMs,
    minSpeechDurationMs: options.vad?.minSpeechDurationMs,
    onSpeechStart: () => {
      void startSegment('vad')
    },
    onSpeechEnd: () => {
      void stopSegment('vad')
    },
  })

  let volumeFallbackAudioContext: AudioContext | undefined
  let volumeFallbackSourceNode: MediaStreamAudioSourceNode | undefined
  let volumeFallbackAnalyserNode: AnalyserNode | undefined
  let volumeFallbackSilentGainNode: GainNode | undefined
  let volumeFallbackDataArray: Uint8Array<ArrayBuffer> | undefined
  let volumeFallbackAnimationFrame: number | undefined
  let volumeFallbackSpeechFrames = 0
  let volumeFallbackLastSpeechAt = 0
  let volumeFallbackLastLogAt = 0

  const isRecording = computed(() => recorder.isRecording.value)

  function log(level: VoiceInputSessionLogLevel, event: string, message: string, details?: Record<string, unknown>) {
    options.onLog?.(level, event, message, details)
  }

  function markTranscriptionStarted() {
    activeTranscriptionCount += 1
    isTranscribing.value = true
  }

  function markTranscriptionFinished() {
    activeTranscriptionCount = Math.max(0, activeTranscriptionCount - 1)
    isTranscribing.value = activeTranscriptionCount > 0
  }

  function isStaleTranscriptionTicket(ticket: VoiceInputTranscriptionTicket, trigger: VoiceInputSessionTrigger, phase: string) {
    if (ticket.isCurrent())
      return false

    log('info', 'recording-drop-stale-session', 'Dropping stale recorder-backed transcription work after the listening session changed.', {
      trigger,
      phase,
    })
    return true
  }

  async function discardActiveRecorderSegment(segment: VoiceInputRecordingSegment) {
    discardNextRecording = true
    try {
      await recorder.stopRecord()
    }
    finally {
      discardNextRecording = false
      activeRecordingSegment.value = resolveActiveVoiceInputRecordingSegmentAfterStop(activeRecordingSegment.value, segment)
    }
  }

  async function startSegment(trigger: VoiceInputSessionTrigger = 'manual') {
    const event: VoiceInputSessionEvent = { trigger }
    if (shouldUseStreamInput.value) {
      log('info', 'segment-start-skipped-streaming', 'Recorder segment start skipped because streaming transcription is active.', { trigger })
      return false
    }

    if (isRecording.value || activeRecordingSegment.value) {
      log('info', 'segment-start-skipped-active', 'Recorder segment start skipped because another segment is already active.', {
        trigger,
        activeRecordingTrigger: activeRecordingTrigger.value,
      })
      return false
    }

    const segment = createVoiceInputRecordingSegment(++nextRecordingSegmentId, trigger)
    activeRecordingSegment.value = segment

    if (options.canStartSegment) {
      try {
        if (!await options.canStartSegment(event)) {
          log('info', 'segment-start-skipped-gate', 'Recorder segment start skipped by caller gate.', { trigger })
          activeRecordingSegment.value = resolveActiveVoiceInputRecordingSegmentAfterStop(activeRecordingSegment.value, segment)
          return false
        }
      }
      catch (error) {
        activeRecordingSegment.value = resolveActiveVoiceInputRecordingSegmentAfterStop(activeRecordingSegment.value, segment)
        lastError.value = error
        log('error', 'segment-start-gate-failed', 'Recorder segment start gate failed.', { trigger, error })
        await options.onTranscriptionError?.({ trigger, error })
        return false
      }
    }

    try {
      await options.onSegmentStart?.(event)
      await recorder.startRecord()

      try {
        await options.onSegmentStarted?.(event)
      }
      catch (error) {
        await discardActiveRecorderSegment(segment)
        throw error
      }

      return true
    }
    catch (error) {
      activeRecordingSegment.value = resolveActiveVoiceInputRecordingSegmentAfterStop(activeRecordingSegment.value, segment)
      lastError.value = error
      log('error', 'segment-start-failed', 'Failed to start recorder-backed voice input segment.', { trigger, error })
      await options.onTranscriptionError?.({ trigger, error })
      return false
    }
  }

  async function stopSegment(trigger: VoiceInputSessionTrigger = 'manual') {
    const event: VoiceInputSessionEvent = { trigger }
    const segment = activeRecordingSegment.value

    if (shouldUseStreamInput.value && !isRecording.value && !segment) {
      log('info', 'segment-stop-skipped-streaming', 'Recorder segment stop skipped because streaming transcription is active.', { trigger })
      return
    }

    if (segment && segment.trigger !== trigger) {
      log('info', 'segment-stop-skipped-trigger-mismatch', 'Recorder segment stop skipped because another detector owns the active segment.', {
        trigger,
        activeRecordingTrigger: activeRecordingTrigger.value,
      })
      return
    }

    if (!isRecording.value) {
      log('warn', 'segment-stop-without-active-recorder', 'Recorder segment stop requested without an active recording.', { trigger })
      return
    }

    const stoppedSegment = segment ?? createVoiceInputRecordingSegment(++nextRecordingSegmentId, trigger)

    try {
      await options.onSegmentStop?.(event)
    }
    catch (error) {
      lastError.value = error
      log('error', 'segment-stop-hook-failed', 'Caller stop hook failed; finalizing recorder segment anyway.', { trigger, error })
      await options.onTranscriptionError?.({ trigger, error })
    }

    try {
      stoppedRecordingSegments.push(stoppedSegment)
      activeRecordingSegment.value = resolveActiveVoiceInputRecordingSegmentAfterStop(activeRecordingSegment.value, stoppedSegment)
      await recorder.stopRecord()
      await options.onSegmentStopped?.(event)
    }
    catch (error) {
      const queuedIndex = stoppedRecordingSegments.findIndex(item => item.id === stoppedSegment.id)
      if (queuedIndex !== -1)
        stoppedRecordingSegments.splice(queuedIndex, 1)
      lastError.value = error
      log('error', 'segment-stop-failed', 'Failed to stop recorder-backed voice input segment.', { trigger, error })
      await options.onTranscriptionError?.({ trigger, error })
    }
    finally {
      activeRecordingSegment.value = resolveActiveVoiceInputRecordingSegmentAfterStop(activeRecordingSegment.value, stoppedSegment)
    }
  }

  async function processRecording(recording: Blob | undefined, trigger: VoiceInputSessionTrigger, ticket: VoiceInputTranscriptionTicket) {
    const event: VoiceInputSessionEvent = { trigger, recording }

    if (isStaleTranscriptionTicket(ticket, trigger, 'recording-start'))
      return

    if (!recording || recording.size <= 0) {
      log('warn', 'recording-drop-empty', 'Dropping empty recorder-backed voice input segment.', { trigger, recording })
      await options.onRecordingSkipped?.(event)
      return
    }

    const metadata = await options.onRecordingReady?.(event) ?? undefined
    const readyEvent = { ...event, metadata }
    if (isStaleTranscriptionTicket(ticket, trigger, 'recording-ready'))
      return

    const beforeGate = await options.inspectBeforeTranscription?.(readyEvent)
    if (isStaleTranscriptionTicket(ticket, trigger, 'before-transcription-gate'))
      return

    if (beforeGate?.skip) {
      log('info', 'recording-drop-before-asr', 'Skipping recorder-backed segment before transcription request.', {
        trigger,
        gate: beforeGate,
      })
      await options.onRecordingSkipped?.({ ...readyEvent, gate: beforeGate })
      return
    }

    markTranscriptionStarted()

    let text = ''
    try {
      await options.onTranscriptionStart?.(readyEvent)
      if (isStaleTranscriptionTicket(ticket, trigger, 'transcription-started'))
        return

      text = await transcribeForRecording(recording) ?? ''
    }
    catch (error) {
      if (isStaleTranscriptionTicket(ticket, trigger, 'transcription-error'))
        return

      lastError.value = error
      log('error', 'recording-transcription-error', 'Transcription provider threw while processing recorder-backed segment.', { trigger, error })
      await options.onTranscriptionError?.({ ...readyEvent, error })
      return
    }
    finally {
      markTranscriptionFinished()
    }

    if (isStaleTranscriptionTicket(ticket, trigger, 'transcription-result'))
      return

    const resultEvent = { ...readyEvent, text }
    const afterGate = await options.inspectAfterTranscription?.(resultEvent)
    if (isStaleTranscriptionTicket(ticket, trigger, 'after-transcription-gate'))
      return

    if (afterGate?.skip) {
      log('info', 'recording-drop-after-asr', 'Dropping stale transcription result after transcription request.', {
        trigger,
        gate: afterGate,
        text,
      })
      await options.onRecordingSkipped?.({ ...resultEvent, gate: afterGate })
      return
    }

    if (!text || !text.trim()) {
      log('warn', 'recording-transcription-empty', 'Transcription provider returned empty text for recorder-backed segment.', { trigger, text })
      await options.onTranscriptionEmpty?.(resultEvent)
      return
    }

    lastTranscriptionText.value = text
    await options.onTranscriptionResult?.(resultEvent)
  }

  recorder.onStopRecord(async (recording) => {
    if (discardNextRecording) {
      discardNextRecording = false
      return
    }

    const segment = stoppedRecordingSegments.shift()
    const trigger = segment?.trigger ?? activeRecordingTrigger.value ?? 'manual'
    await transcriptionChain
      .enqueue(ticket => processRecording(recording, trigger, ticket))
      .catch((error) => {
        lastError.value = error
        log('error', 'recording-processing-error', 'Voice input recording processing failed.', { trigger, error })
      })
  })

  function stopVolumeFallback() {
    if (volumeFallbackAnimationFrame !== undefined) {
      cancelAnimationFrame(volumeFallbackAnimationFrame)
      volumeFallbackAnimationFrame = undefined
    }

    volumeFallbackSourceNode?.disconnect()
    volumeFallbackAnalyserNode?.disconnect()
    volumeFallbackSilentGainNode?.disconnect()
    volumeFallbackSourceNode = undefined
    volumeFallbackAnalyserNode = undefined
    volumeFallbackSilentGainNode = undefined
    volumeFallbackDataArray = undefined
    volumeFallbackSpeechFrames = 0
    volumeFallbackLastSpeechAt = 0
    volumeFallbackLastLogAt = 0

    if (volumeFallbackAudioContext && volumeFallbackAudioContext.state !== 'closed')
      void volumeFallbackAudioContext.close()
    volumeFallbackAudioContext = undefined
  }

  async function startVolumeFallback(stream: MediaStream) {
    if (!volumeFallbackEnabled.value || shouldUseStreamInput.value)
      return

    stopVolumeFallback()

    const startThreshold = options.volumeFallback?.startThreshold ?? DEFAULT_VOLUME_FALLBACK_START_THRESHOLD
    const stopThreshold = options.volumeFallback?.stopThreshold ?? DEFAULT_VOLUME_FALLBACK_STOP_THRESHOLD
    const startFrames = options.volumeFallback?.startFrames ?? DEFAULT_VOLUME_FALLBACK_START_FRAMES
    const stopDelayMs = options.volumeFallback?.stopDelayMs ?? DEFAULT_VOLUME_FALLBACK_STOP_DELAY_MS
    const logIntervalMs = options.volumeFallback?.logIntervalMs ?? DEFAULT_VOLUME_FALLBACK_LOG_INTERVAL_MS

    try {
      volumeFallbackAudioContext = new AudioContext({ latencyHint: 'interactive' })
      if (volumeFallbackAudioContext.state === 'suspended')
        await volumeFallbackAudioContext.resume()

      volumeFallbackSourceNode = volumeFallbackAudioContext.createMediaStreamSource(stream)
      volumeFallbackAnalyserNode = volumeFallbackAudioContext.createAnalyser()
      volumeFallbackAnalyserNode.fftSize = 512
      volumeFallbackAnalyserNode.smoothingTimeConstant = 0.25
      volumeFallbackSilentGainNode = volumeFallbackAudioContext.createGain()
      volumeFallbackSilentGainNode.gain.value = 0
      volumeFallbackDataArray = new Uint8Array(volumeFallbackAnalyserNode.fftSize) as Uint8Array<ArrayBuffer>

      volumeFallbackSourceNode.connect(volumeFallbackAnalyserNode)
      volumeFallbackAnalyserNode.connect(volumeFallbackSilentGainNode)
      volumeFallbackSilentGainNode.connect(volumeFallbackAudioContext.destination)

      log('info', 'volume-fallback-started', 'Volume-based recorder fallback started for record-then-transcribe voice input.', {
        startThreshold,
        stopThreshold,
        stopDelayMs,
      })

      const analyze = () => {
        if (!volumeFallbackAnalyserNode || !volumeFallbackDataArray)
          return

        volumeFallbackAnalyserNode.getByteTimeDomainData(volumeFallbackDataArray)
        const level = calculateTimeDomainVolumeLevel(volumeFallbackDataArray)
        const now = Date.now()

        if (now - volumeFallbackLastLogAt >= logIntervalMs) {
          volumeFallbackLastLogAt = now
          log('info', 'volume-fallback-level', 'Volume fallback sampled microphone input.', {
            level: Number(level.toFixed(1)),
            isRecording: isRecording.value,
            activeRecordingTrigger: activeRecordingTrigger.value,
            startThreshold,
            stopThreshold,
          })
        }

        if (shouldUseStreamInput.value) {
          volumeFallbackSpeechFrames = 0
          volumeFallbackAnimationFrame = requestAnimationFrame(analyze)
          return
        }

        if (!isRecording.value) {
          if (level >= startThreshold) {
            volumeFallbackSpeechFrames += 1
            if (volumeFallbackSpeechFrames >= startFrames) {
              volumeFallbackLastSpeechAt = now
              volumeFallbackSpeechFrames = 0
              log('info', 'volume-fallback-speech-start', 'Volume fallback detected speech; starting recorder segment.', {
                level: Number(level.toFixed(1)),
              })
              void startSegment('volume')
            }
          }
          else {
            volumeFallbackSpeechFrames = 0
          }
        }
        else if (activeRecordingTrigger.value === 'volume' || activeRecordingTrigger.value === 'vad') {
          if (level > stopThreshold) {
            volumeFallbackLastSpeechAt = now
          }
          else if (!volumeFallbackLastSpeechAt) {
            volumeFallbackLastSpeechAt = now
          }
          else if (volumeFallbackLastSpeechAt && now - volumeFallbackLastSpeechAt >= stopDelayMs) {
            const trigger = activeRecordingTrigger.value
            volumeFallbackLastSpeechAt = 0
            log('info', 'volume-fallback-speech-end', 'Volume fallback detected silence; finalizing recorder segment.', {
              level: Number(level.toFixed(1)),
              silenceMs: stopDelayMs,
              trigger,
            })
            void stopSegment(trigger)
          }
        }

        volumeFallbackAnimationFrame = requestAnimationFrame(analyze)
      }

      volumeFallbackAnimationFrame = requestAnimationFrame(analyze)
    }
    catch (error) {
      stopVolumeFallback()
      lastError.value = error
      log('error', 'volume-fallback-start-failed', 'Failed to start volume-based recorder fallback.', { error })
    }
  }

  async function startAutoSegmentation() {
    const stream = mediaRef.value
    if (!stream)
      throw new Error('No microphone stream available for voice input')

    await startVoiceInputVadDetectionSafely({
      init: initVAD,
      loaded: () => vadLoaded.value,
      start: startVAD,
      stream,
      getError: () => vadError.value,
      log,
    })
    await startVolumeFallback(stream)
  }

  async function stop(options: { flushActiveRecording?: boolean } = {}) {
    stopVolumeFallback()
    disposeVAD()
    transcriptionChain.reset()
    stoppedRecordingSegments.length = 0

    if (options.flushActiveRecording && isRecording.value) {
      await stopSegment(activeRecordingTrigger.value ?? 'manual')
      await transcriptionChain.idle()
      transcriptionChain.reset()
    }
    else if (isRecording.value) {
      discardNextRecording = true
      try {
        await recorder.stopRecord()
      }
      finally {
        discardNextRecording = false
        activeRecordingSegment.value = undefined
      }
    }
    else {
      activeRecordingSegment.value = undefined
    }
  }

  return {
    isRecording,
    isTranscribing,
    lastTranscriptionText,
    lastError,
    activeRecordingTrigger,
    isSpeechVAD,
    isSpeechProb,
    isSpeechHistory,
    vadLoaded,
    vadError,

    startSegment,
    stopSegment,
    startAutoSegmentation,
    stop,
  }
}

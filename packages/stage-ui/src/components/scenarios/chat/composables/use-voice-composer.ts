import type { ChatAttachment } from '@proj-airi/core-agent'
import type { MaybeRefOrGetter } from 'vue'

import { encodeBase64 } from '@moeru/std/base64'
import { useUserMedia } from '@vueuse/core'
import { computed, onScopeDispose, shallowRef, toValue, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useAudioAnalyzer } from '../../../../composables/audio/audio-analyzer'
import { useAudioRecorder } from '../../../../composables/audio/audio-recorder'
import { useStreamingTranscriptionInput } from '../../../../composables/use-streaming-transcription-input'
import { useAudioContext } from '../../../../stores/audio'
import { useHearingStore, useTranscriptionSession } from '../../../../stores/modules/hearing'
import { useSettingsAudioDevice } from '../../../../stores/settings/audio-device'

/** Limits in-memory WAV capture before encoding and storing the recording. */
const MAX_MANUAL_RECORDING_DURATION_MS = 90_000

class VoiceComposerFailure extends Error {}

/** The active hold determines whether release sends audio or inserts text. */
export type VoiceComposerMode = 'audio' | 'transcription'

export type VoiceComposerResult
  = | { sessionId: string, mode: 'audio', audio: Extract<ChatAttachment, { type: 'audio' }>, text: string }
    | { sessionId: string, mode: 'transcription', text: string }

/** One recording is bound to the chat session that was selected on press. */
export interface VoiceComposerOptions {
  sessionId: MaybeRefOrGetter<string>
  needsTranscription: () => boolean
  complete: (result: VoiceComposerResult) => Promise<void>
  onError: (message: string) => void
}

/**
 * Owns a manual microphone and an isolated transcription session.
 * A generation invalidates permission requests and ASR results after cancel,
 * session changes, or disposal. Recorder finalization precedes track shutdown.
 */
export function useVoiceComposer(options: VoiceComposerOptions) {
  const { t } = useI18n()
  const phase = shallowRef<'idle' | 'starting' | 'recording' | 'processing'>('idle')
  const transcript = shallowRef('')
  const volume = shallowRef(0)
  const startedAt = shallowRef(0)
  const hearing = useHearingStore()
  const pipeline = useTranscriptionSession()
  const input = useStreamingTranscriptionInput(transcript)
  const device = useSettingsAudioDevice()
  const media = useUserMedia({ constraints: computed(() => device.deviceConstraints), enabled: false })
  const recorder = useAudioRecorder(media.stream)
  const analyzer = useAudioAnalyzer()
  const { audioContext } = useAudioContext()
  analyzer.onAnalyzerUpdate((level) => {
    volume.value = level
  })
  let source: MediaStreamAudioSourceNode | undefined
  let generation = 0
  let starting: Promise<void> | undefined
  let permissionPending = false
  let finishing: Promise<void> | undefined
  let activeMode: VoiceComposerMode = 'audio'
  let activeSession = ''
  let requiresTranscript = false
  let streaming = false
  let streamingStartupPending = false
  let startupAbortController: AbortController | undefined
  let recordingDeadline: ReturnType<typeof setTimeout> | undefined
  let processingAbortController: AbortController | undefined
  const consumerId = 'manual-composer'

  function stopMicrophone() {
    clearTimeout(recordingDeadline)
    recordingDeadline = undefined
    source?.disconnect()
    source = undefined
    analyzer.stopAnalyzer()
    media.stop()
    volume.value = 0
  }

  async function start(mode: VoiceComposerMode) {
    if (phase.value !== 'idle' || permissionPending)
      return
    const ticket = ++generation
    activeSession = toValue(options.sessionId)
    activeMode = mode
    const streamingOnly = hearing.configured && pipeline.supportsStreamInput.value && !pipeline.supportsGenerateOutput.value
    requiresTranscript = mode === 'transcription' || options.needsTranscription() || streamingOnly
    transcript.value = ''
    input.reset()
    phase.value = 'starting'
    const startupController = new AbortController()
    startupAbortController = startupController
    starting = (async () => {
      try {
        const resuming = audioContext.resume()
        permissionPending = true
        const stream = await media.start()
        permissionPending = false
        if (ticket !== generation) {
          stopMicrophone()
          return
        }
        if (!stream)
          throw new VoiceComposerFailure(t('stage.voice.microphone-unavailable'))
        const resumeCancellation = Promise.withResolvers<void>()
        const releaseResume = () => resumeCancellation.resolve()
        startupController.signal.addEventListener('abort', releaseResume, { once: true })
        try {
          await Promise.race([resuming, resumeCancellation.promise])
        }
        finally {
          startupController.signal.removeEventListener('abort', releaseResume)
        }
        if (ticket !== generation)
          return
        const node = analyzer.startAnalyzer(audioContext)
        if (node) {
          source = audioContext.createMediaStreamSource(stream)
          source.connect(node)
        }
        await recorder.startRecord()
        if (ticket !== generation)
          return
        startedAt.value = Date.now()
        phase.value = 'recording'
        recordingDeadline = setTimeout(() => {
          if (streamingStartupPending)
            startupController.abort()
          void finish()
        }, MAX_MANUAL_RECORDING_DURATION_MS)
        streaming = requiresTranscript && pipeline.supportsStreamInput.value
        if (streaming) {
          const browserRecognition = hearing.activeTranscriptionProvider === 'browser-web-speech-api'
          streamingStartupPending = true
          try {
            await pipeline.transcribeForMediaStream(stream, {
              consumerId,
              abortSignal: startupController.signal,
              onTranscriptionUpdate: (text) => {
                if (ticket === generation)
                  input.replace(text)
              },
              // Browser recognition commits sentences. Other providers emit token
              // deltas here, so commit their full utterance only at speech end.
              onSentenceEnd: (text) => {
                if (ticket === generation && browserRecognition)
                  input.commit(text)
              },
              onSpeechEnd: (text) => {
                if (ticket === generation && !browserRecognition)
                  input.commit(text)
              },
            })
          }
          finally {
            streamingStartupPending = false
          }
          if (startupController.signal.aborted)
            throw new VoiceComposerFailure(t('stage.voice.start-failed'))
          if (pipeline.error.value)
            throw new VoiceComposerFailure(t('stage.voice.start-failed'))
        }
      }
      catch (error) {
        await recorder.discardRecord()
        await pipeline.stopStreamingTranscription(true)
        stopMicrophone()
        if (ticket === generation) {
          phase.value = 'idle'
          options.onError(error instanceof VoiceComposerFailure ? error.message : t('stage.voice.start-failed'))
        }
      }
      finally {
        permissionPending = false
        if (startupAbortController === startupController)
          startupAbortController = undefined
      }
    })()
    await starting
  }

  async function finish() {
    if (phase.value === 'idle' || finishing)
      return
    if (phase.value === 'starting') {
      await cancel()
      return
    }
    if (streamingStartupPending)
      startupAbortController?.abort()
    clearTimeout(recordingDeadline)
    recordingDeadline = undefined
    const ticket = generation
    const abortController = new AbortController()
    processingAbortController = abortController
    phase.value = 'processing'
    finishing = (async () => {
      try {
        await starting
        if (ticket !== generation || !recorder.isRecording.value)
          return
        phase.value = 'processing'
        // Drain recognition while its audio session is still active. The WAV
        // recorder's Web Audio capture path suspends its context on finalization.
        if (streaming) {
          await pipeline.stopStreamingTranscription(false, undefined, abortController.signal)
          if (pipeline.error.value)
            throw new VoiceComposerFailure(t('stage.voice.finish-failed'))
        }
        const recording = await recorder.stopRecord()
        pipeline.removeStreamingTranscriptionConsumer(consumerId)
        stopMicrophone()
        if (ticket !== generation)
          return
        if (!recording?.size)
          throw new VoiceComposerFailure(t('stage.voice.empty-recording'))
        if (requiresTranscript && !streaming) {
          const text = await pipeline.transcribeForRecording(recording, abortController.signal)
          if (!text)
            throw new VoiceComposerFailure(t('stage.voice.empty-transcription'))
          transcript.value = text
        }
        if (requiresTranscript && !transcript.value.trim())
          throw new VoiceComposerFailure(t('stage.voice.empty-transcription'))
        if (ticket !== generation)
          return
        if (activeMode === 'transcription') {
          await options.complete({ sessionId: activeSession, mode: 'transcription', text: transcript.value.trim() })
          return
        }
        const data = encodeBase64(await recording.arrayBuffer())
        if (ticket !== generation)
          return
        await options.complete({
          sessionId: activeSession,
          mode: 'audio',
          text: transcript.value.trim(),
          audio: { type: 'audio', data, mimeType: 'audio/wav', transcript: transcript.value.trim() || undefined },
        })
      }
      catch (error) {
        if (ticket === generation)
          options.onError(error instanceof VoiceComposerFailure ? error.message : t('stage.voice.finish-failed'))
      }
      finally {
        if (processingAbortController === abortController)
          processingAbortController = undefined
        await recorder.discardRecord()
        await pipeline.stopStreamingTranscription(true)
        pipeline.removeStreamingTranscriptionConsumer(consumerId)
        stopMicrophone()
        if (ticket === generation)
          phase.value = 'idle'
      }
    })()
    try {
      await finishing
    }
    finally {
      finishing = undefined
    }
  }

  async function cancel() {
    ++generation
    startupAbortController?.abort()
    processingAbortController?.abort()
    clearTimeout(recordingDeadline)
    recordingDeadline = undefined
    if (permissionPending) {
      stopMicrophone()
      input.reset()
      transcript.value = ''
      phase.value = 'idle'
      return
    }
    if (phase.value !== 'idle')
      phase.value = 'processing'
    await starting
    await recorder.discardRecord()
    await pipeline.stopStreamingTranscription(true)
    pipeline.removeStreamingTranscriptionConsumer(consumerId)
    await finishing
    stopMicrophone()
    input.reset()
    transcript.value = ''
    phase.value = 'idle'
  }

  watch(() => toValue(options.sessionId), () => {
    void cancel()
  })
  onScopeDispose(() => {
    void cancel()
  })

  return { phase, transcript, volume, startedAt, start, finish, cancel, configured: computed(() => hearing.configured) }
}

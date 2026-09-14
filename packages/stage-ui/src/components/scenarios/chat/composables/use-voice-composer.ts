import type { ChatAttachment } from '@proj-airi/core-agent'
import type { MaybeRefOrGetter } from 'vue'

import { errorMessageFrom } from '@moeru/std'
import { encodeBase64 } from '@moeru/std/base64'
import { useUserMedia } from '@vueuse/core'
import { computed, onScopeDispose, shallowRef, toValue, watch } from 'vue'

import { useAudioAnalyzer } from '../../../../composables/audio/audio-analyzer'
import { useAudioRecorder } from '../../../../composables/audio/audio-recorder'
import { useStreamingTranscriptionInput } from '../../../../composables/use-streaming-transcription-input'
import { useAudioContext } from '../../../../stores/audio'
import { useHearingStore, useTranscriptionSession } from '../../../../stores/modules/hearing'
import { useSettingsAudioDevice } from '../../../../stores/settings/audio-device'

/** The active hold determines whether release sends audio or inserts text. */
export type VoiceComposerMode = 'audio' | 'transcription'

/** One recording is bound to the chat session that was selected on press. */
export interface VoiceComposerOptions {
  sessionId: MaybeRefOrGetter<string>
  needsTranscription: () => boolean
  complete: (result: { sessionId: string, mode: VoiceComposerMode, audio: Extract<ChatAttachment, { type: 'audio' }>, text: string }) => Promise<void>
  onError: (message: string) => void
}

/**
 * Owns a manual microphone and an isolated transcription session.
 * A generation invalidates permission requests and ASR results after cancel,
 * session changes, or disposal. Recorder finalization precedes track shutdown.
 */
export function useVoiceComposer(options: VoiceComposerOptions) {
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
  let finishing: Promise<void> | undefined
  let activeMode: VoiceComposerMode = 'audio'
  let activeSession = ''
  let requiresTranscript = false
  let streaming = false
  const consumerId = 'manual-composer'

  function stopMicrophone() {
    source?.disconnect()
    source = undefined
    analyzer.stopAnalyzer()
    media.stop()
    volume.value = 0
  }

  async function start(mode: VoiceComposerMode) {
    if (phase.value !== 'idle')
      return
    const ticket = ++generation
    activeSession = toValue(options.sessionId)
    activeMode = mode
    requiresTranscript = mode === 'transcription' || options.needsTranscription()
    transcript.value = ''
    input.reset()
    phase.value = 'starting'
    starting = (async () => {
      try {
        const resuming = audioContext.resume()
        const stream = await media.start()
        if (ticket !== generation) {
          stopMicrophone()
          return
        }
        if (!stream)
          throw new Error('Microphone is unavailable.')
        await resuming
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
        streaming = requiresTranscript && pipeline.supportsStreamInput.value
        if (streaming) {
          const browserRecognition = hearing.activeTranscriptionProvider === 'browser-web-speech-api'
          await pipeline.transcribeForMediaStream(stream, {
            consumerId,
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
          if (pipeline.error.value)
            throw new Error(pipeline.error.value)
        }
      }
      catch (error) {
        await recorder.discardRecord()
        await pipeline.stopStreamingTranscription(true)
        stopMicrophone()
        if (ticket === generation) {
          phase.value = 'idle'
          options.onError(errorMessageFrom(error) ?? 'Could not start recording.')
        }
      }
    })()
    await starting
  }

  async function finish() {
    if (phase.value === 'idle' || finishing)
      return
    const ticket = generation
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
          await pipeline.stopStreamingTranscription(false)
          if (pipeline.error.value)
            throw new Error(pipeline.error.value)
        }
        const recording = await recorder.stopRecord()
        pipeline.removeStreamingTranscriptionConsumer(consumerId)
        stopMicrophone()
        if (ticket !== generation)
          return
        if (!recording?.size)
          throw new Error('The recording is empty.')
        if (requiresTranscript && !streaming) {
          const text = await pipeline.transcribeForRecording(recording)
          if (!text)
            throw new Error(pipeline.error.value ?? 'Transcription returned no text.')
          transcript.value = text
        }
        if (requiresTranscript && !transcript.value.trim())
          throw new Error('Transcription returned no text.')
        const data = encodeBase64(await recording.arrayBuffer())
        if (ticket !== generation)
          return
        await options.complete({
          sessionId: activeSession,
          mode: activeMode,
          text: transcript.value.trim(),
          audio: { type: 'audio', data, mimeType: 'audio/wav', transcript: transcript.value.trim() || undefined },
        })
      }
      catch (error) {
        if (ticket === generation)
          options.onError(errorMessageFrom(error) ?? 'Could not finish recording.')
      }
      finally {
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
    // Keep new presses blocked until an outstanding permission request settles.
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

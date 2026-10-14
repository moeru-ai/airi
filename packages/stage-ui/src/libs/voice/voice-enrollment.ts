import type { AudioInput, AudioWindow, Capture } from '@proj-airi/pipelines-audio'

import { errorMessageFrom } from '@moeru/std'
import { audioWindows, capture } from '@proj-airi/pipelines-audio'

/** Sherpaw enrolls a speaker only from this much speech or more. */
export const MIN_ENROLLMENT_SPEECH_SECONDS = 5

/** Recording stops after this much audio, speech or not. The Sherpaw sandbox uses the same limit. */
const MAX_RECORDING_SECONDS = 30

// NOTICE:
// Silero VAD reads 512 samples at 16 kHz, so each window lasts 32 ms.
// The constraint is in workers/vad/silero-vad.ts. The voice activity plugin uses the same windows.
// Remove this fixed size when detectors supply their own window requirements.
const WINDOW_MS = 32

/** A window starts speech at this VAD score. The voice activity plugin uses the same default. */
const SPEECH_START_SCORE = 0.6
/** Speech continues while the score stays at 30 percent of the start score, as in a live speech input. */
const SPEECH_CONTINUE_SCORE = SPEECH_START_SCORE * 0.3

/**
 * Progress of one enrollment.
 *
 * - `recording`: the microphone records. `speechSeconds` counts the speech that the VAD found so far.
 * - `enrolling`: recording ended. The voiceprint model computes the voiceprint.
 * - `enrolled`: the voiceprint exists. The owner of the enrollment saved it.
 * - `failed`: see `failure`.
 * - `cancelled`: the user or the host stopped the enrollment. Nothing was saved.
 */
export interface VoiceEnrollmentSnapshot {
  readonly phase: 'recording' | 'enrolling' | 'enrolled' | 'failed' | 'cancelled'
  readonly speechSeconds: number
  /**
   * Why a `failed` enrollment failed.
   *
   * - `too-short`: the recording had less than {@link MIN_ENROLLMENT_SPEECH_SECONDS} of speech. The user can record again.
   * - `error`: the microphone, the VAD, or the voiceprint model failed. `error` has the message.
   */
  readonly failure?: 'too-short' | 'error'
  readonly error?: string
}

export interface VoiceEnrollmentOptions {
  /** Scores one 32 ms window at 16 kHz from 0 (silence) to 1 (speech). */
  readonly detect: (window: AudioWindow, signal: AbortSignal) => Promise<number>
  /**
   * Computes and saves the voiceprint of the recorded speech. `speech` holds speech windows only, because silence
   * weakens the voiceprint. Aborting `signal` cancels the work, and nothing must be saved after that.
   */
  readonly enroll: (speech: Float32Array, sampleRate: number, signal: AbortSignal) => Promise<void>
}

const SETTLED_PHASES = new Set<VoiceEnrollmentSnapshot['phase']>(['enrolled', 'failed', 'cancelled'])

/**
 * Records the user's speech once and turns it into a voiceprint.
 *
 * The recording keeps only the windows that the VAD scores as speech. It ends with `finish`, or after
 * 30 s of audio. Then `enroll` runs with the speech, if it has at least {@link MIN_ENROLLMENT_SPEECH_SECONDS}.
 * The enrollment never keeps the audio after it settles.
 */
export class VoiceEnrollment {
  /** Settles when the enrollment reaches `enrolled`, `failed`, or `cancelled`. It never rejects. */
  readonly done: Promise<void>
  private current: VoiceEnrollmentSnapshot = { phase: 'recording', speechSeconds: 0 }
  private readonly listeners = new Set<() => void>()
  private readonly lifetime = new AbortController()
  private readonly recording: Capture

  constructor(input: AudioInput, options: VoiceEnrollmentOptions) {
    this.recording = capture(input, { signal: this.lifetime.signal })
    this.done = this.run(options)
  }

  get snapshot(): VoiceEnrollmentSnapshot { return this.current }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Ends the recording. The speech recorded so far then enrolls. */
  finish(): void {
    if (this.current.phase === 'recording')
      void this.recording.finish()
  }

  /** Stops the recording or the voiceprint computation. A settled enrollment does not change. */
  cancel(): void {
    if (this.current.phase !== 'recording' && this.current.phase !== 'enrolling')
      return
    this.change({ phase: 'cancelled', speechSeconds: this.current.speechSeconds })
    this.lifetime.abort('Voice enrollment cancelled')
  }

  private async run(options: VoiceEnrollmentOptions) {
    const signal = this.lifetime.signal
    const speech: Float32Array[] = []
    let speechSamples = 0
    let sampleRate = 0
    try {
      let recordedSamples = 0
      let speaking = false
      const reader = this.recording.stream.pipeThrough(audioWindows({ windowMs: WINDOW_MS, hopMs: WINDOW_MS })).getReader()
      while (true) {
        const { done, value: window } = await reader.read()
        if (done)
          break

        const score = await options.detect(window, signal)
        sampleRate = window.sampleRate
        const samples = new Float32Array(window.channels[0]?.length ?? 0)
        for (const channel of window.channels) {
          for (let index = 0; index < samples.length; index++)
            samples[index] += (channel[index] ?? 0) / window.channels.length
        }

        speaking = score >= (speaking ? SPEECH_CONTINUE_SCORE : SPEECH_START_SCORE)
        if (speaking) {
          speech.push(samples)
          speechSamples += samples.length
          // Publish tenths of a second, so a listener gets about 10 updates each second of speech.
          const speechSeconds = Math.floor(speechSamples / sampleRate * 10) / 10
          if (speechSeconds !== this.current.speechSeconds)
            this.change({ phase: 'recording', speechSeconds })
        }

        recordedSamples += samples.length
        if (recordedSamples >= MAX_RECORDING_SECONDS * sampleRate) {
          // Windows that are already queued come after the limit, so stop reading them too.
          await this.recording.finish()
          await reader.cancel()
          break
        }
      }

      // A cancel after `finish` does not end the finished capture, so the loop above can still end normally.
      signal.throwIfAborted()
      if (speechSamples < MIN_ENROLLMENT_SPEECH_SECONDS * sampleRate || sampleRate === 0) {
        this.change({ phase: 'failed', speechSeconds: this.current.speechSeconds, failure: 'too-short' })
        return
      }

      this.change({ phase: 'enrolling', speechSeconds: this.current.speechSeconds })
      const joined = new Float32Array(speechSamples)
      let offset = 0
      for (const samples of speech.splice(0)) {
        joined.set(samples, offset)
        offset += samples.length
      }
      await options.enroll(joined, sampleRate, signal)
      signal.throwIfAborted()
      this.change({ phase: 'enrolled', speechSeconds: this.current.speechSeconds })
    }
    catch (error) {
      // `cancel` already reported the outcome. A cancelled capture or an aborted model call ends here.
      if (signal.aborted)
        return
      this.recording.cancel('Voice enrollment failed')
      this.change({ phase: 'failed', speechSeconds: this.current.speechSeconds, failure: 'error', error: errorMessageFrom(error) ?? 'Voice enrollment failed' })
    }
  }

  private change(snapshot: VoiceEnrollmentSnapshot) {
    // `cancel` settles the enrollment while `run` can still wait on a VAD score. A later change must not replace it.
    if (SETTLED_PHASES.has(this.current.phase))
      return
    this.current = snapshot
    for (const listener of this.listeners) {
      try {
        listener()
      }
      catch (error) {
        console.error('Voice enrollment observer failed', error)
      }
    }
  }
}

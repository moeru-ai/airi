import type { AudioInputObservations } from './types'

import { expect as vitestExpect } from 'vitest'

export interface CapturedTranscriptionAudioExpectation {
  count: number
  minimumBytes: number
}

export interface TranscriptionExpectationOptions {
  /** @default 'exact' */
  match?: 'exact' | 'contains'
}

declare module 'vitest' {
  interface Assertion<T> {
    toHaveCapturedTranscriptionAudio: T extends AudioInputObservations
      ? (expected: CapturedTranscriptionAudioExpectation) => Promise<void>
      : never
    toHaveTranscriptions: T extends AudioInputObservations
      ? (
          expected: ReadonlyArray<ReadonlyArray<string>>,
          options?: TranscriptionExpectationOptions,
        ) => Promise<void>
      : never
  }
}

/** Vitest expect with AIRI audio-input matcher types. */
export const expect = vitestExpect

/**
 * Normalizes a transcript for speech-recognition comparison.
 *
 * @example
 * normalizeTranscript(' Hello, AIRI! ')
 * // => 'helloairi'
 */
function normalizeTranscript(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

/** Installs asynchronous matchers for AIRI audio-input observations. */
export function installAudioInputMatchers(): void {
  vitestExpect.extend({
    async toHaveCapturedTranscriptionAudio(
      session: AudioInputObservations,
      expected: CapturedTranscriptionAudioExpectation,
    ) {
      const format = session.transcriptionCaptureFormat
      if (!format) {
        return {
          pass: false,
          message: () => 'The active transcription Provider does not expose uploaded audio.',
        }
      }

      const captures = await session.capturedTranscriptionAudio(expected.count)
      const invalidCapture = captures.find((capture) => {
        if (capture.format !== format || capture.data.byteLength < expected.minimumBytes)
          return true
        return format === 'wav' && new TextDecoder().decode(capture.data.subarray(0, 4)) !== 'RIFF'
      })
      const pass = captures.length === expected.count && !invalidCapture

      return {
        pass,
        message: () => pass
          ? 'Expected the session not to contain valid transcription audio.'
          : `Expected ${expected.count} ${format} capture(s) with at least ${expected.minimumBytes} bytes.`,
      }
    },
    async toHaveTranscriptions(
      session: AudioInputObservations,
      expected: ReadonlyArray<ReadonlyArray<string>>,
      options: TranscriptionExpectationOptions = {},
    ) {
      const actual = await session.transcriptionResults(expected.length)
      const normalizedActual = actual.map(normalizeTranscript)
      const normalizedExpected = expected.map(alternatives => alternatives.map(normalizeTranscript))
      const match = options.match ?? 'exact'
      const pass = normalizedActual.length === normalizedExpected.length
        && normalizedActual.every((transcript, index) => (
          match === 'contains'
            ? normalizedExpected[index].some(candidate => transcript.includes(candidate))
            : normalizedExpected[index].includes(transcript)
        ))

      return {
        pass,
        message: () => pass
          ? 'Expected the session not to contain the specified transcriptions.'
          : `Expected transcriptions ${JSON.stringify(expected)}, but received ${JSON.stringify(actual)}.`,
      }
    },
  })
}

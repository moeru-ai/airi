import type { SerializedIOSpan } from '@proj-airi/stage-shared/types/io-trace'

import type { AudioInputObservations } from './types'

import { IOAttributes, IOSpanNames } from '@proj-airi/stage-shared/perf/io-trace'
import { expect as vitestExpect } from 'vitest'

export interface CapturedTranscriptionAudioExpectation {
  count: number
  minimumBytes: number
}

export interface TranscriptionExpectationOptions {
  /** @default 'exact' */
  match?: 'exact' | 'contains'
}

/** Sets the wait limit for a transcription action assertion. */
export interface TranscriptionActionExpectationOptions {
  /** Maximum time to wait for a completed ASR action. @default 60000 */
  timeout?: number
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
    toHaveCompletedTranscription: T extends AudioInputObservations
      ? (options?: TranscriptionActionExpectationOptions) => Promise<void>
      : never
  }
}

/** Vitest expect with AIRI audio-input matcher types. */
export const expect = vitestExpect

/**
 * Normalizes speech text for transcript comparison.
 *
 * @example
 * normalizeSpeechText(' Hello, AIRI! ')
 * // => 'helloairi'
 */
function normalizeSpeechText(value: string): string {
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
      const normalizedActual = actual.map(normalizeSpeechText)
      const normalizedExpected = expected.map(alternatives => alternatives.map(normalizeSpeechText))
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
    async toHaveCompletedTranscription(
      session: AudioInputObservations,
      options: TranscriptionActionExpectationOptions = {},
    ) {
      const result = await waitForTranscription(session, options.timeout ?? 60_000)
      return {
        pass: result.complete,
        message: () => result.complete
          ? 'Expected the transcription action not to complete.'
          : `Expected the transcription action to complete, but ${result.summary}.`,
      }
    },
  })
}

/** OpenTelemetry marks a span that ended with an error with this status code. */
const SPAN_STATUS_ERROR = 2

async function waitForTranscription(
  session: AudioInputObservations,
  timeout: number,
): Promise<{ complete: boolean, failed: boolean, summary: string }> {
  const deadline = Date.now() + timeout
  let result = transcriptionResult(await session.completedSpans(IOSpanNames.SpeechRecognition))

  while (!result.complete && !result.failed && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 100))
    result = transcriptionResult(await session.completedSpans(IOSpanNames.SpeechRecognition))
  }
  return result
}

/**
 * Reads the latest speech recognition span. The hearing transcriber ends one span per provider request.
 * An aborted request is neither complete nor failed, because the voice input that owned it was cancelled.
 */
function transcriptionResult(spans: SerializedIOSpan[]): { complete: boolean, failed: boolean, summary: string } {
  const latest = spans.findLast(span => span.attributes[IOAttributes.ASRAbort] !== true)
  if (latest?.status.code === SPAN_STATUS_ERROR) {
    return {
      complete: false,
      failed: true,
      summary: `ASR failed${latest.status.message ? `: ${latest.status.message}` : ''}`,
    }
  }
  return {
    complete: !!latest,
    failed: false,
    summary: 'ASR did not complete',
  }
}

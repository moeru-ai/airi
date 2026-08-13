import type { SerializedIOSpan } from '@proj-airi/stage-shared/types/io-trace'
import type { AudioCapture, AudioCaptureFormat, AudioTestCase, AudioTestPreflightCallback, AudioTestSession } from '@proj-airi/vitest-plugin-fakemic'
import type { ElectronApplication, Page } from 'playwright'

export const audioInputTargets = ['web', 'electron'] as const

export type AudioInputTarget = (typeof audioInputTargets)[number]

/** Values available when one case resolves its preflight callbacks. */
export interface AudioInputPreflightContext {
  /** Environment variables loaded for this case. */
  env: Readonly<NodeJS.ProcessEnv>
  /** Clean runtime that the configuration callback can prepare. */
  runtime: AudioInputSession
  /** Skips this case when its environment does not satisfy a case constraint. */
  skip: (condition: unknown, note?: string) => void
}

/** One optional case callback that resolves configuration from its environment. */
export type AudioInputPreflightCallback = AudioTestPreflightCallback<AudioInputPreflightContext>

/** One AIRI audio-input test definition. */
export type AudioInputTestCase = AudioTestCase<AudioInputPreflightContext>

/** Snapshot of the observable AIRI audio pipeline state. */
export interface AudioInputSnapshot {
  spans: SerializedIOSpan[]
  streamingTranscriptionUpdates: string[]
  transcriptionResults: string[]
  diagnostics: string[]
}

/** Observable audio values used by AIRI matchers. */
export interface AudioInputObservations {
  /** Capture format used by the active transcription Provider. */
  transcriptionCaptureFormat?: AudioCaptureFormat
  capturedTranscriptionAudio: (count: number) => Promise<AudioCapture[]>
  streamingTranscriptionUpdates: () => Promise<string[]>
  transcriptionResults: (count: number) => Promise<string[]>
  completedSpans: (name?: string) => Promise<SerializedIOSpan[]>
  /** Waits until the VAD audio graph is connected to the microphone stream. */
  waitForVadReady: () => Promise<void>
  /** Waits until a streaming transcription transport accepts microphone audio. */
  waitForStreamingTranscriptionReady: () => Promise<void>
}

/** Runtime handle for one AIRI audio-input test. */
export interface AudioInputSession extends AudioInputObservations, AudioTestSession {
  /** Electron application for Electron tasks. */
  electronApp?: ElectronApplication
  /** Page used by case interactions. */
  page: Page
  /** Page that owns the audio-input pipeline. */
  runtimePage: Page
  /** Runtime selected for this concrete task. */
  target: AudioInputTarget
  /** Selects the page used by subsequent case interactions. */
  activatePage: (page: Page) => void
  snapshot: () => Promise<AudioInputSnapshot>
}

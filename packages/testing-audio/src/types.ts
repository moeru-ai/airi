import type { SerializedIOSpan } from '@proj-airi/stage-shared/types/io-trace'
import type { PiniaActionEvent, PiniaActionEventStatus } from '@proj-airi/stage-shared/types/pinia-action-event'
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
  piniaActionEvents: PiniaActionEvent[]
  spans: SerializedIOSpan[]
  streamingTranscriptionUpdates: string[]
  transcriptionResults: string[]
}

/** One rendered chat message from the completed turn. */
export interface AudioInputChatMessage {
  role: 'assistant' | 'user'
  text: string
}

/** One LLM input message represented without its potentially sensitive content. */
export interface AudioInputLLMMessage {
  role: string
}

/** One text chunk emitted by the LLM stream. */
export interface AudioInputLLMOutputChunk {
  characters: number
}

/** One synthesized audio segment routed from the LLM turn. */
export interface AudioInputTTSSegment {
  durationMs: number
  text: string
}

/** Structured observations for one completed voice interaction turn. */
export interface AudioInputTurn {
  id: string
  chat: {
    messages: AudioInputChatMessage[]
  }
  llm: {
    inputMessages: AudioInputLLMMessage[]
    outputCharacters: number
    outputChunks: AudioInputLLMOutputChunk[]
  }
  tts: {
    audioSegments: AudioInputTTSSegment[]
  }
}

/** Observable audio values used by AIRI matchers. */
export interface AudioInputObservations {
  /** Capture format used by the active transcription Provider. */
  transcriptionCaptureFormat?: AudioCaptureFormat
  capturedTranscriptionAudio: (count: number) => Promise<AudioCapture[]>
  streamingTranscriptionUpdates: () => Promise<string[]>
  transcriptionResults: (count: number) => Promise<string[]>
  completedSpans: (name?: string) => Promise<SerializedIOSpan[]>
  /** Waits until all speech work for the latest LLM turn is complete. */
  waitForTurn: (options?: {
    /** @default 60000 */
    timeout?: number
  }) => Promise<AudioInputTurn>
  /** Returns the Pinia action events collected by the runtime probe. */
  piniaActionEvents: () => Promise<PiniaActionEvent[]>
  /** Waits until the VAD audio graph is connected to the microphone stream. */
  waitForVadReady: () => Promise<void>
  /** Waits until a streaming transcription transport accepts microphone audio. */
  waitForStreamingTranscriptionReady: () => Promise<void>
  /**
   * Waits for the next matching Pinia action event after this method is called.
   *
   * @example
   * const completed = audio.waitForPiniaAction({
   *   storeId: 'modules:hearing:speech:audio-input-pipeline',
   *   actionName: 'transcribeForMediaStream',
   * })
   * await enableButton.click()
   * await completed
   */
  waitForPiniaAction: (options: {
    storeId: string
    actionName: string
    /** @default 'completed' */
    status?: PiniaActionEventStatus
    /** @default 60000 */
    timeout?: number
  }) => Promise<PiniaActionEvent>
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

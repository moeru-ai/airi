/** Runtime support and locale inventory reported by the macOS Speech framework. */
export interface AppleSpeechCapabilities {
  available: boolean
  installedLocales: string[]
  reason?: string
  supportedLocales: string[]
}

/** Final result returned by one on-device Apple Speech transcription request. */
export interface AppleSpeechTranscriptionResult {
  durationMilliseconds: number
  isFinal: true
  locale: string
  text: string
}

/** A full live transcript snapshot that replaces the previous snapshot. */
export interface AppleSpeechStreamingUpdate {
  /** Duration of the Apple result range that caused this snapshot. */
  durationMilliseconds: number
  /** Whether the Apple result range is final. Other ranges in `text` can still be volatile. */
  isFinal: boolean
  locale: string
  /** Start of the Apple result range that caused this snapshot. */
  startMilliseconds: number
  /** Current transcript for all received audio. This value replaces the previous snapshot. */
  text: string
}

export interface AppleSpeechStreamingOptions {
  /** Cancels the analyzer and closes the native session. */
  signal?: AbortSignal
}

export type AppleSpeechAudioChunk = ArrayBuffer | ArrayBufferView

/** Returns whether Apple Speech transcription is available on this Mac. */
export function getCapabilities(): Promise<AppleSpeechCapabilities>

/** Transcribes encoded audio bytes with Apple's on-device speech model. */
export function transcribeAudio(audio: Uint8Array, locale: string, fileExtension: string): Promise<AppleSpeechTranscriptionResult>

/** Transcribes one local audio file with Apple's on-device speech model. */
export function transcribeFile(path: string, locale: string): Promise<AppleSpeechTranscriptionResult>

/** Transcribes live mono PCM16 audio and yields replaceable text snapshots. */
export function transcribePcmStream(
  audioStream: AsyncIterable<AppleSpeechAudioChunk>,
  locale: string,
  sampleRate: number,
  options?: AppleSpeechStreamingOptions,
): AsyncGenerator<AppleSpeechStreamingUpdate>

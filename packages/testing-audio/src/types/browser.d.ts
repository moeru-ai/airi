import type { SerializedIOSpan } from '@proj-airi/stage-shared/types/io-trace'
import type { PiniaActionEvent } from '@proj-airi/stage-shared/types/pinia-action-event'

declare global {
  interface BrowserAudioInputState {
    piniaActionEvents: PiniaActionEvent[]
    spans: SerializedIOSpan[]
    streamingTranscriptionReady: boolean
    streamingTranscriptionUpdates: string[]
    transcriptionAudio: Array<{ base64: string, format: 'pcm' | 'wav' }>
    transcriptionResults: string[]
    vadReady: boolean
  }

  interface Window {
    __airiAudioInputE2E?: BrowserAudioInputState
  }

  // NOTICE:
  // TypeScript 5.9 does not declare the Baseline 2025 Uint8Array Base64 methods.
  // The test runs in current Playwright and Electron Chromium runtimes that implement this API.
  // Source: https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array/toBase64
  // Remove this declaration when the TypeScript standard library includes the method.
  interface Uint8Array<TArrayBuffer extends ArrayBufferLike = ArrayBufferLike> {
    toBase64: (options?: {
      alphabet?: 'base64' | 'base64url'
      omitPadding?: boolean
    }) => string
  }
}

export {}

import { defineInvokeEventa } from '@moeru/eventa'

/**
 * Payload sent from the Electron renderer to the main process for a Fish Audio
 * TTS request. AbortSignal is intentionally omitted — it is not serializable
 * across IPC and cancellation must be handled at a higher level if needed.
 */
export interface ElectronFishAudioTTSPayload {
  apiKey: string
  baseUrl: string
  text: string
  referenceId?: string | null
}

/** Response returned by the main process after proxying the Fish Audio request. */
export interface ElectronFishAudioTTSResult {
  /** Raw audio bytes as a structured-clone-safe Uint8Array. */
  data: Uint8Array
  contentType: string
  status: number
}

/**
 * Eventa IPC contract for proxying Fish Audio TTS through the Electron main
 * process. The main process uses net.fetch which runs in Node and is therefore
 * not subject to browser CORS enforcement.
 *
 * Handler: apps/stage-tamagotchi/src/main/services/electron/fish-audio.ts
 */
export const electronFishAudioTTS = defineInvokeEventa<ElectronFishAudioTTSResult, ElectronFishAudioTTSPayload>(
  'eventa:invoke:electron:providers:fish-audio:tts',
)

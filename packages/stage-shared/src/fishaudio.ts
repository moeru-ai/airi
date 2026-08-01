import { defineInvokeEventa } from '@moeru/eventa'

/**
 * Payload for routing Fish Audio TTS through Electron's main process.
 */
export interface ElectronFishAudioTtsRequest {
  apiKey: string
  baseUrl: string
  model: string
  text: string
  referenceId?: string
  normalize: boolean
  latency: string
  chunkLength?: number
  mp3Bitrate?: number
}

/**
 * Serialized Fish Audio MP3 response returned over Electron IPC.
 */
export interface ElectronFishAudioTtsResponse {
  audioBase64: string
  mimeType: 'audio/mpeg'
  status: number
  statusText: string
}

export const electronFishAudioTTS = defineInvokeEventa<ElectronFishAudioTtsResponse, ElectronFishAudioTtsRequest>('eventa:invoke:electron:fishaudio:tts')

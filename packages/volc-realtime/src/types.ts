import type { Buffer } from 'node:buffer'

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'streaming' | 'error'

export interface VolcRealtimeClientOptions {
  appId: string
  accessKey: string
  appKey: string
  resourceId: string
  speaker: string
  dialogModel: string
  onAudioReceived: (pcm: Int16Array) => void
  onAsrResult: (text: string, isFinal: boolean) => void
  onAsrEnded: (fullText: string) => void
  onChatResponse: (text: string) => void
  onTtsStart: () => void
  onTtsEnd: () => void
  onStateChange?: (state: ConnectionState) => void
  onError: (error: Error) => void
}

export interface VolcFrame {
  eventId: number
  sequence?: number
  sessionId?: string
  payload: Buffer | Uint8Array
  messageType?: number
}

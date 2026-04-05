import type { SourceDescriptor } from './source'
import type { TextMessage, VideoFrameMeta } from './stream'

export interface GatewaySubscriptionMessage {
  type: 'subscribe'
  sessionId: string
  sessionToken: string
}

export interface GatewayUnsubscribeMessage {
  type: 'unsubscribe'
  sessionId: string
}

export interface GatewayRealtimeVideoFrameMessage {
  type: 'realtime:media:video'
  sessionId: string
  participantIdentity: string
  sourceId: string
  sourceType: SourceDescriptor['sourceType']
  timestamp: number
  width: number
  height: number
  format: VideoFrameMeta['format']
  data: string
}

export interface GatewayRealtimeTextInputMessage {
  type: 'realtime:user:text'
  sessionId: string
  participantIdentity: string
  text: string
  sourceId?: string
}

export type GatewayRealtimeControlAction = 'request-inference' | 'start-auto-observe' | 'stop-auto-observe' | 'reset-source'

export interface GatewayRealtimeControlMessage {
  type: 'realtime:control'
  sessionId: string
  action: GatewayRealtimeControlAction
  intervalMs?: number
}

export interface RealtimeAutoObserveStartedPayload {
  sessionId: string
  intervalMs: number
}

export interface RealtimeAutoObserveStoppedPayload {
  sessionId: string
}

export type GatewayWsClientMessage
  = | GatewaySubscriptionMessage
    | GatewayUnsubscribeMessage
    | GatewayRealtimeVideoFrameMessage
    | GatewayRealtimeTextInputMessage
    | GatewayRealtimeControlMessage

export interface SessionMessagesResponse {
  messages: TextMessage[]
}

export interface RealtimeInferenceStartedPayload {
  prompt: string
  auto: boolean
  sourceId: string
}

export interface RealtimeInferenceTextChunkPayload {
  id: string
  delta: string
  text: string
  sourceId: string
  model?: string
}

export interface RealtimeInferenceCompletedPayload {
  message: TextMessage
  sourceId: string
  auto: boolean
  durationMs?: number
}

export interface RealtimeInferenceFailedPayload {
  error: string
  sourceId?: string
  auto?: boolean
}

export interface RealtimeVideoFrameReadyPayload extends VideoFrameMeta {
  participantIdentity: string
}

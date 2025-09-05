export type ChannelKind = 'ipc' | 'ws' | 'webrtc' | 'http' | 'grpc'

export interface MessageEnvelope<T = unknown> {
  type: string // e.g. "chat/token", "scene/update"
  payload: T
  dest?: 'internal' | 'ui' | 'bridge'
}

export type MessageHandler<T = unknown> = (msg: MessageEnvelope<T>) => void | Promise<void>

export interface MessageChannel {
  readonly kind: ChannelKind
  send: <T>(msg: MessageEnvelope<T>) => Promise<void>
  on: <T = unknown>(type: string, handler: MessageHandler<T>) => () => void // returns off()
  close: () => void
}

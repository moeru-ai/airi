export enum MessageType {
  Status = 'status',
  Output = 'output',
  Info = 'info',
  Request = 'request',
  Error = 'error',
  Load = 'load',
}

export enum MessageStatus {
  RecordingStart = 'recording_start',
  RecordingEnd = 'recording_end',
  Ready = 'ready',
}

export enum Duration {
  UntilNext = 'until_next',
}

export interface MessageEventStatus {
  type: MessageType.Status
  status: MessageStatus
  message: string
  duration?: Duration
}

export interface MessageEventOutput {
  type: MessageType.Output
  buffer: Float32Array<any>
  message: string
  start: number
  end: number
  duration: number
}

export interface MessageEventInfo {
  type: MessageType.Info
  message: string
  duration?: Duration.UntilNext
}

export interface MessageEventBufferRequest {
  type: MessageType.Request
  buffer: Float32Array<any>
  message?: string
}

export interface MessageEventError {
  type: MessageType.Error
  error: unknown
  message?: string
}

export interface MessageEventLoad {
  type: MessageType.Load
  message?: string
}

export type MessageEvent = MessageEventError | MessageEventStatus | MessageEventOutput | MessageEventInfo | MessageEventBufferRequest | MessageEventLoad

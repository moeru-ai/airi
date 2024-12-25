export enum MessageType {
  Status = 'status',
  Output = 'output',
  Info = 'info',
}

export enum MessageStatus {
  RecordingStart = 'recording_start',
  RecordingEnd = 'recording_end',
}

export enum Duration {
  UntilNext = 'until_next',
}

export interface MessageEventStatus {
  type: MessageType.Status
  status: MessageStatus
  message: string
  duration: Duration
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

export interface MessageEventError {
  error: unknown
}

export type MessageEvent = MessageEventError | MessageEventStatus | MessageEventOutput | MessageEventInfo

export type IntentBehavior = 'interrupt' | 'queue' | 'replace'

export interface IntentHandle {
  cancel: (reason?: string) => void
  end: () => void
  intentId: string
  ownerId?: string
  priority: number
  stream: ReadableStream<TextToken>
  streamId: string
  turnId?: string
  writeFlush: () => void
  writeLiteral: (text: string) => void
  writeSpecial: (special: string) => void
}

export interface IntentOptions {
  behavior?: IntentBehavior
  intentId?: string
  ownerId?: string
  priority?: number | PriorityLevel
  streamId?: string
  turnId?: string
}

export interface LoggerLike {
  debug: (message: string, ...args: unknown[]) => void
  error: (message: string, ...args: unknown[]) => void
  info: (message: string, ...args: unknown[]) => void
  warn: (message: string, ...args: unknown[]) => void
}

export interface PlaybackEndEvent<TAudio> {
  endedAt: number
  item: PlaybackItem<TAudio>
}

export interface PlaybackInterruptEvent<TAudio> {
  interruptedAt: number
  item: PlaybackItem<TAudio>
  reason: string
}

export interface PlaybackItem<TAudio> {
  audio: TAudio
  createdAt: number
  id: string
  intentId: string
  ownerId?: string
  priority: number
  segmentId: string
  sequence: number
  special: null | string
  streamId: string
  text: string
  turnId?: string
}

export interface PlaybackRejectEvent<TAudio> {
  item: PlaybackItem<TAudio>
  reason: string
  rejectedAt?: number
}

export interface PlaybackStartEvent<TAudio> {
  item: PlaybackItem<TAudio>
  startedAt: number
}

export type PriorityLevel = 'critical' | 'high' | 'low' | 'normal'

export interface PriorityResolver {
  resolve: (priority?: number | PriorityLevel) => number
}

export interface SpeechPipelineEvents<TAudio> {
  onIntentCancel: (event: { intentId: string, reason?: string }) => void
  onIntentEnd: (intentId: string) => void
  onIntentStart: (intentId: string) => void
  onPlaybackEnd: (event: PlaybackEndEvent<TAudio>) => void
  onPlaybackInterrupt: (event: PlaybackInterruptEvent<TAudio>) => void
  onPlaybackReject: (event: PlaybackRejectEvent<TAudio>) => void
  onPlaybackStart: (event: PlaybackStartEvent<TAudio>) => void
  onSegment: (segment: TextSegment) => void
  onSpecial: (segment: TextSegment) => void
  onTtsRequest: (request: TtsRequest) => void
  onTtsResult: (result: TtsResult<TAudio>) => void
  onTurnCancel: (event: { reason?: string, turnId: string }) => void
  onTurnEnd: (turnId: string) => void
  onTurnStart: (turnId: string) => void
}

export interface TextSegment {
  createdAt: number
  intentId: string
  reason: 'boost' | 'flush' | 'hard' | 'limit' | 'special'
  segmentId: string
  special: null | string
  streamId: string
  text: string
  turnId?: string
}

export interface TextToken {
  createdAt: number
  intentId: string
  sequence: number
  streamId: string
  turnId?: string
  type: 'flush' | 'literal' | 'special'
  value?: string
}

export interface TtsRequest {
  createdAt: number
  intentId: string
  priority: number
  segmentId: string
  sequence: number
  special: null | string
  streamId: string
  text: string
  turnId?: string
}

export interface TtsResult<TAudio> {
  audio: TAudio
  createdAt: number
  intentId: string
  segmentId: string
  sequence: number
  special: null | string
  streamId: string
  text: string
  turnId?: string
}

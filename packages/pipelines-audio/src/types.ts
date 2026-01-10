export type PriorityLevel = 'critical' | 'high' | 'normal' | 'low'

export interface PriorityResolver {
  resolve: (priority?: PriorityLevel | number) => number
}

export interface TextToken {
  type: 'literal' | 'special' | 'flush'
  value?: string
  streamId: string
  intentId: string
  sequence: number
  createdAt: number
}

export interface TextSegment {
  streamId: string
  intentId: string
  segmentId: string
  text: string
  special: string | null
  reason: 'boost' | 'limit' | 'hard' | 'flush' | 'special'
  createdAt: number
}

export interface TtsRequest {
  streamId: string
  intentId: string
  segmentId: string
  text: string
  special: string | null
  priority: number
  createdAt: number
}

export interface TtsResult<TAudio> {
  streamId: string
  intentId: string
  segmentId: string
  text: string
  special: string | null
  audio: TAudio
  createdAt: number
}

export interface PlaybackItem<TAudio> {
  id: string
  streamId: string
  intentId: string
  segmentId: string
  ownerId?: string
  priority: number
  text: string
  special: string | null
  audio: TAudio
  createdAt: number
}

export interface PlaybackStartEvent<TAudio> {
  item: PlaybackItem<TAudio>
  startedAt: number
}

export interface PlaybackEndEvent<TAudio> {
  item: PlaybackItem<TAudio>
  endedAt: number
}

export interface PlaybackInterruptEvent<TAudio> {
  item: PlaybackItem<TAudio>
  reason: string
  interruptedAt: number
}

export interface PlaybackRejectEvent<TAudio> {
  item: PlaybackItem<TAudio>
  reason: string
}

export type IntentBehavior = 'queue' | 'interrupt' | 'replace'

export interface IntentOptions {
  intentId?: string
  streamId?: string
  priority?: PriorityLevel | number
  ownerId?: string
  behavior?: IntentBehavior
}

export interface IntentHandle {
  intentId: string
  streamId: string
  priority: number
  ownerId?: string
  writeLiteral: (text: string) => void
  writeSpecial: (special: string) => void
  writeFlush: () => void
  end: () => void
  cancel: (reason?: string) => void
  stream: ReadableStream<TextToken>
}

export interface SpeechPipelineEvents<TAudio> {
  onSegment: (segment: TextSegment) => void
  onSpecial: (segment: TextSegment) => void
  onTtsRequest: (request: TtsRequest) => void
  onTtsResult: (result: TtsResult<TAudio>) => void
  onPlaybackStart: (event: PlaybackStartEvent<TAudio>) => void
  onPlaybackEnd: (event: PlaybackEndEvent<TAudio>) => void
  onPlaybackInterrupt: (event: PlaybackInterruptEvent<TAudio>) => void
  onPlaybackReject: (event: PlaybackRejectEvent<TAudio>) => void
  onIntentStart: (intentId: string) => void
  onIntentEnd: (intentId: string) => void
  onIntentCancel: (intentId: string, reason?: string) => void
}

export interface LoggerLike {
  debug: (message: string, ...args: unknown[]) => void
  info: (message: string, ...args: unknown[]) => void
  warn: (message: string, ...args: unknown[]) => void
  error: (message: string, ...args: unknown[]) => void
}

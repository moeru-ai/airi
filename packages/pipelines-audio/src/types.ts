export type PriorityLevel = 'critical' | 'high' | 'normal' | 'low'

export interface PriorityResolver {
  resolve: (priority?: PriorityLevel | number) => number
}

export interface TextToken {
  type: 'literal' | 'special' | 'flush'
  value?: string
  turnId?: string
  streamId: string
  intentId: string
  sequence: number
  createdAt: number
}

export interface TextSegment {
  turnId?: string
  streamId: string
  intentId: string
  segmentId: string
  text: string
  special: string | null
  reason: 'boost' | 'limit' | 'hard' | 'flush' | 'special'
  /**
   * This segment ends a spoken sentence (hard punctuation or an explicit
   * flush marker). `limit`/`boost` segments produced by the word-limit
   * splitter are mid-sentence pieces and are not boundaries. Bilingual
   * captions reveal only on a boundary, so a long sentence split into
   * several pieces reveals once, on the piece that finishes it.
   */
  sentenceBoundary?: boolean
  createdAt: number
}

export interface TtsRequest {
  turnId?: string
  streamId: string
  intentId: string
  segmentId: string
  sequence: number
  text: string
  special: string | null
  /** See {@link TextSegment.sentenceBoundary}. */
  sentenceBoundary?: boolean
  priority: number
  createdAt: number
}

export interface TtsResult<TAudio> {
  turnId?: string
  streamId: string
  intentId: string
  segmentId: string
  sequence: number
  text: string
  special: string | null
  /** See {@link TextSegment.sentenceBoundary}. */
  sentenceBoundary?: boolean
  audio: TAudio
  createdAt: number
}

export interface PlaybackItem<TAudio> {
  id: string
  turnId?: string
  streamId: string
  intentId: string
  segmentId: string
  sequence: number
  ownerId?: string
  priority: number
  text: string
  special: string | null
  /**
   * True when this item's audio ends a spoken sentence. Mid-sentence chunks
   * produced by the word-limit splitter are false.
   */
  sentenceBoundary?: boolean
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
  rejectedAt?: number
}

/**
 * Fired once after an intent is sealed (no more items will be scheduled)
 * and no active or waiting item remains. A transient empty queue between
 * streaming sentences does not fire this. It also fires after rejects or
 * interrupts drain a sealed intent. Consumers use it as the turn-level
 * playback-complete signal.
 */
export interface PlaybackIntentDrainedEvent {
  intentId: string
  turnId?: string
  drainedAt: number
}

export type IntentBehavior = 'queue' | 'interrupt' | 'replace'

/**
 * Controls which TTS segments count as sentence boundaries.
 *
 * - `punctuation` (default): hard punctuation and flush markers both end a
 *   sentence. Correct for ordinary TTS.
 * - `flush`: only explicit flush markers end sentences. Bilingual turns use
 *   this so the boundary count matches the translation-pair count exactly,
 *   regardless of abbreviation periods or line breaks.
 */
export type SentenceBoundaryMode = 'punctuation' | 'flush'

export interface IntentOptions {
  turnId?: string
  intentId?: string
  streamId?: string
  priority?: PriorityLevel | number
  ownerId?: string
  behavior?: IntentBehavior
  /** See {@link SentenceBoundaryMode}. Defaults to `punctuation`. */
  boundaryMode?: SentenceBoundaryMode
}

export interface IntentHandle {
  turnId?: string
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
  onIntentCancel: (event: { intentId: string, reason?: string }) => void
  onTurnStart: (turnId: string) => void
  onTurnEnd: (turnId: string) => void
  onTurnCancel: (event: { turnId: string, reason?: string }) => void
}

export interface LoggerLike {
  debug: (message: string, ...args: unknown[]) => void
  info: (message: string, ...args: unknown[]) => void
  warn: (message: string, ...args: unknown[]) => void
  error: (message: string, ...args: unknown[]) => void
}

import * as _moeru_eventa0 from "@moeru/eventa";
import { ReaderLike } from "clustr";

//#region src/types.d.ts
type PriorityLevel = 'critical' | 'high' | 'normal' | 'low';
interface PriorityResolver {
  resolve: (priority?: PriorityLevel | number) => number;
}
interface TextToken {
  type: 'literal' | 'special' | 'flush';
  value?: string;
  streamId: string;
  intentId: string;
  sequence: number;
  createdAt: number;
}
interface TextSegment {
  streamId: string;
  intentId: string;
  segmentId: string;
  text: string;
  special: string | null;
  reason: 'boost' | 'limit' | 'hard' | 'flush' | 'special';
  createdAt: number;
}
interface TtsRequest {
  streamId: string;
  intentId: string;
  segmentId: string;
  text: string;
  special: string | null;
  priority: number;
  createdAt: number;
}
interface TtsResult<TAudio> {
  streamId: string;
  intentId: string;
  segmentId: string;
  text: string;
  special: string | null;
  audio: TAudio;
  createdAt: number;
}
interface PlaybackItem<TAudio> {
  id: string;
  streamId: string;
  intentId: string;
  segmentId: string;
  ownerId?: string;
  priority: number;
  text: string;
  special: string | null;
  audio: TAudio;
  createdAt: number;
}
interface PlaybackStartEvent<TAudio> {
  item: PlaybackItem<TAudio>;
  startedAt: number;
}
interface PlaybackEndEvent<TAudio> {
  item: PlaybackItem<TAudio>;
  endedAt: number;
}
interface PlaybackInterruptEvent<TAudio> {
  item: PlaybackItem<TAudio>;
  reason: string;
  interruptedAt: number;
}
interface PlaybackRejectEvent<TAudio> {
  item: PlaybackItem<TAudio>;
  reason: string;
}
type IntentBehavior = 'queue' | 'interrupt' | 'replace';
interface IntentOptions {
  intentId?: string;
  streamId?: string;
  priority?: PriorityLevel | number;
  ownerId?: string;
  behavior?: IntentBehavior;
}
interface IntentHandle {
  intentId: string;
  streamId: string;
  priority: number;
  ownerId?: string;
  writeLiteral: (text: string) => void;
  writeSpecial: (special: string) => void;
  writeFlush: () => void;
  end: () => void;
  cancel: (reason?: string) => void;
  stream: ReadableStream<TextToken>;
}
interface SpeechPipelineEvents<TAudio> {
  onSegment: (segment: TextSegment) => void;
  onSpecial: (segment: TextSegment) => void;
  onTtsRequest: (request: TtsRequest) => void;
  onTtsResult: (result: TtsResult<TAudio>) => void;
  onPlaybackStart: (event: PlaybackStartEvent<TAudio>) => void;
  onPlaybackEnd: (event: PlaybackEndEvent<TAudio>) => void;
  onPlaybackInterrupt: (event: PlaybackInterruptEvent<TAudio>) => void;
  onPlaybackReject: (event: PlaybackRejectEvent<TAudio>) => void;
  onIntentStart: (intentId: string) => void;
  onIntentEnd: (intentId: string) => void;
  onIntentCancel: (intentId: string, reason?: string) => void;
}
interface LoggerLike {
  debug: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
}
//#endregion
//#region src/eventa.d.ts
declare const speechSegmentEvent: _moeru_eventa0.Eventa<TextSegment>;
declare const speechSpecialEvent: _moeru_eventa0.Eventa<TextSegment>;
declare const speechTtsRequestEvent: _moeru_eventa0.Eventa<TtsRequest>;
declare const speechTtsResultEvent: _moeru_eventa0.Eventa<TtsResult<any>>;
declare const speechPlaybackStartEvent: _moeru_eventa0.Eventa<PlaybackStartEvent<any>>;
declare const speechPlaybackEndEvent: _moeru_eventa0.Eventa<PlaybackEndEvent<any>>;
declare const speechPlaybackInterruptEvent: _moeru_eventa0.Eventa<PlaybackInterruptEvent<any>>;
declare const speechPlaybackRejectEvent: _moeru_eventa0.Eventa<PlaybackRejectEvent<any>>;
declare const speechIntentStartEvent: _moeru_eventa0.Eventa<string>;
declare const speechIntentEndEvent: _moeru_eventa0.Eventa<string>;
declare const speechIntentCancelEvent: _moeru_eventa0.Eventa<{
  intentId: string;
  reason?: string;
}>;
declare const speechPipelineEventMap: {
  readonly onSegment: _moeru_eventa0.Eventa<TextSegment>;
  readonly onSpecial: _moeru_eventa0.Eventa<TextSegment>;
  readonly onTtsRequest: _moeru_eventa0.Eventa<TtsRequest>;
  readonly onTtsResult: _moeru_eventa0.Eventa<TtsResult<any>>;
  readonly onPlaybackStart: _moeru_eventa0.Eventa<PlaybackStartEvent<any>>;
  readonly onPlaybackEnd: _moeru_eventa0.Eventa<PlaybackEndEvent<any>>;
  readonly onPlaybackInterrupt: _moeru_eventa0.Eventa<PlaybackInterruptEvent<any>>;
  readonly onPlaybackReject: _moeru_eventa0.Eventa<PlaybackRejectEvent<any>>;
  readonly onIntentStart: _moeru_eventa0.Eventa<string>;
  readonly onIntentEnd: _moeru_eventa0.Eventa<string>;
  readonly onIntentCancel: _moeru_eventa0.Eventa<{
    intentId: string;
    reason?: string;
  }>;
};
type SpeechPipelineEventName = keyof typeof speechPipelineEventMap;
//#endregion
//#region src/managers/playback-manager.d.ts
type OverflowPolicy = 'queue' | 'reject' | 'steal-oldest' | 'steal-lowest-priority';
type OwnerOverflowPolicy = 'reject' | 'steal-oldest';
interface PlaybackManagerOptions<TAudio> {
  play: (item: PlaybackItem<TAudio>, signal: AbortSignal) => Promise<void>;
  maxVoices?: number;
  maxVoicesPerOwner?: number;
  overflowPolicy?: OverflowPolicy;
  ownerOverflowPolicy?: OwnerOverflowPolicy;
}
declare function createPlaybackManager<TAudio>(options: PlaybackManagerOptions<TAudio>): {
  schedule: (item: PlaybackItem<TAudio>) => void;
  stopAll: (reason: string) => void;
  stopByIntent: (intentId: string, reason: string) => void;
  stopByOwner: (ownerId: string, reason: string) => void;
  onStart: (listener: (event: PlaybackStartEvent<TAudio>) => void) => void;
  onEnd: (listener: (event: PlaybackEndEvent<TAudio>) => void) => void;
  onInterrupt: (listener: (event: PlaybackInterruptEvent<TAudio>) => void) => void;
  onReject: (listener: (event: PlaybackRejectEvent<TAudio>) => void) => void;
};
//#endregion
//#region src/priority.d.ts
declare function createPriorityResolver(levels?: Partial<Record<PriorityLevel, number>>): PriorityResolver;
declare function comparePriority(a: number, b: number): 0 | 1 | -1;
//#endregion
//#region src/processors/tts-chunker.d.ts
declare const TTS_FLUSH_INSTRUCTION = "\u200B";
declare const TTS_SPECIAL_TOKEN = "\u2063";
interface TtsInputChunk {
  text: string;
  words: number;
  reason: 'boost' | 'limit' | 'hard' | 'flush' | 'special';
}
interface TtsInputChunkOptions {
  boost?: number;
  minimumWords?: number;
  maximumWords?: number;
}
interface TtsChunkItem {
  chunk: string;
  special: string | null;
  reason: 'boost' | 'limit' | 'hard' | 'flush' | 'special';
}
declare function chunkTtsInput(input: string | ReaderLike, options?: TtsInputChunkOptions): AsyncGenerator<TtsInputChunk, void, unknown>;
declare function chunkEmitter(reader: ReaderLike, pendingSpecials: string[], options: TtsInputChunkOptions | undefined, handler: (ttsSegment: TtsChunkItem) => Promise<void> | void): Promise<void>;
declare function createTtsSegmentStream(tokens: ReadableStream<TextToken>, meta: {
  streamId: string;
  intentId: string;
}, options?: TtsInputChunkOptions): ReadableStream<TextSegment>;
//#endregion
//#region src/speech-pipeline.d.ts
interface SpeechPipelineOptions<TAudio> {
  tts: (request: TtsRequest, signal: AbortSignal) => Promise<TAudio | null>;
  playback: {
    schedule: (item: PlaybackItem<TAudio>) => void;
    stopAll: (reason: string) => void;
    stopByIntent: (intentId: string, reason: string) => void;
    stopByOwner: (ownerId: string, reason: string) => void;
    onStart: (listener: (event: {
      item: PlaybackItem<TAudio>;
      startedAt: number;
    }) => void) => void;
    onEnd: (listener: (event: {
      item: PlaybackItem<TAudio>;
      endedAt: number;
    }) => void) => void;
    onInterrupt: (listener: (event: {
      item: PlaybackItem<TAudio>;
      reason: string;
      interruptedAt: number;
    }) => void) => void;
    onReject: (listener: (event: {
      item: PlaybackItem<TAudio>;
      reason: string;
    }) => void) => void;
  };
  logger?: LoggerLike;
  priority?: ReturnType<typeof createPriorityResolver>;
  segmenter?: (tokens: ReadableStream<TextToken>, meta: {
    streamId: string;
    intentId: string;
  }) => ReadableStream<TextSegment>;
}
declare function createSpeechPipeline<TAudio>(options: SpeechPipelineOptions<TAudio>): {
  openIntent: (optionsInput?: IntentOptions) => IntentHandle;
  cancelIntent: (intentId: string, reason?: string) => void;
  interrupt: (reason: string) => void;
  stopAll: (reason: string) => void;
  on<K extends SpeechPipelineEventName>(event: K, listener: SpeechPipelineEvents<TAudio>[K]): () => void;
};
//#endregion
//#region src/stream.d.ts
interface StreamController<T> {
  stream: ReadableStream<T>;
  write: (value: T) => void;
  close: () => void;
  error: (err: unknown) => void;
  isClosed: () => boolean;
}
declare function createPushStream<T>(): StreamController<T>;
declare function readStream<T>(stream: ReadableStream<T>, handler: (value: T) => Promise<void> | void): Promise<void>;
//#endregion
export { IntentBehavior, IntentHandle, IntentOptions, LoggerLike, OverflowPolicy, OwnerOverflowPolicy, PlaybackEndEvent, PlaybackInterruptEvent, PlaybackItem, PlaybackManagerOptions, PlaybackRejectEvent, PlaybackStartEvent, PriorityLevel, PriorityResolver, SpeechPipelineEventName, SpeechPipelineEvents, SpeechPipelineOptions, StreamController, TTS_FLUSH_INSTRUCTION, TTS_SPECIAL_TOKEN, TextSegment, TextToken, TtsChunkItem, TtsInputChunk, TtsInputChunkOptions, TtsRequest, TtsResult, chunkEmitter, chunkTtsInput, comparePriority, createPlaybackManager, createPriorityResolver, createPushStream, createSpeechPipeline, createTtsSegmentStream, readStream, speechIntentCancelEvent, speechIntentEndEvent, speechIntentStartEvent, speechPipelineEventMap, speechPlaybackEndEvent, speechPlaybackInterruptEvent, speechPlaybackRejectEvent, speechPlaybackStartEvent, speechSegmentEvent, speechSpecialEvent, speechTtsRequestEvent, speechTtsResultEvent };
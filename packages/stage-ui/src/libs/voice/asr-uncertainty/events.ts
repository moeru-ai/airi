import type { SherpawModelPack } from '../../providers/providers/sherpaw/model-assets'

import { defineInvokeEventa } from '@moeru/eventa'

/** A Sherpaw preload pack and the recognizer settings that read it. */
export interface DecoderModel {
  /** `preload.data`. Each worker gets its own copy. */
  readonly data: ArrayBuffer
  readonly metadata: SherpawModelPack['metadata']
  readonly recognizer: 'paraformer' | 'transducer'
  readonly modelingUnit: string
}

/**
 * One endpoint segment as sherpa-onnx reports it.
 *
 * Sherpaw's transcription worker keeps only `text`. The probe needs token times, so this worker keeps
 * the raw result. `tokens`, `timestamps`, and `ysProbs` have the same length when the model reports
 * times. Online Paraformer reports no times, so `timestamps` is empty for it.
 */
export interface RawSegment {
  readonly text: string
  readonly tokens: readonly string[]
  /** Seconds from `startTime`. */
  readonly timestamps: readonly number[]
  /** Log probability of each emitted token. Only transducers report it. */
  readonly ysProbs: readonly number[]
  /** Seconds from the start of the decoded audio to the start of this segment. */
  readonly startTime: number
}

/**
 * Encoder-output noise rollouts of one transducer stream.
 *
 * Each rollout decodes the stream's encoder output with Gaussian noise added. The encoder runs once for
 * the stream and all its rollouts, so a rollout costs only a decoder and joiner pass. Sherpaw runs them,
 * see `OnlineRecognizer.attachRollouts` in `@sherpaw/asr`.
 */
export interface RolloutSettings {
  readonly count: number
  /** Noise level as a multiple of the standard deviation of the encoder output. */
  readonly sigma: number
  /** The same seed and input repeat the same rollouts. */
  readonly seed: number
}

/** One phrase that a decode prefers. */
export interface Hotword {
  readonly phrase: string
  /** sherpa-onnx boost score of the phrase. Undefined uses the default `hotwordsScore` of the recognizer, 1.5. */
  readonly score?: number
}

export interface DecodeRequest {
  /** Mono PCM in [-1, 1]. The worker takes ownership, so the caller transfers its buffer. */
  readonly samples: Float32Array<ArrayBuffer>
  readonly sampleRate: number
  /**
   * Subtracted from the blank logit of a transducer. A positive value makes the decoder emit tokens
   * that it would otherwise drop, which exposes deleted speech. `0` is the normal decoder.
   */
  readonly blankPenalty: number
  /** Rollouts of the decode. Only transducers support them. */
  readonly rollouts?: RolloutSettings
  /**
   * Phrases that the decode prefers. They switch the decode to modified beam search, and the rollouts use them too.
   * A model that cannot encode plain-text hotwords ignores them. See `acceptsHotwords` in `@proj-airi/provider-inference`.
   */
  readonly hotwords?: readonly Hotword[]
}

/** The segments of one clip decode. */
export interface DecodedClip {
  readonly segments: readonly RawSegment[]
  /** The segments of each rollout, in rollout order. Empty without rollouts. */
  readonly rollouts: readonly (readonly RawSegment[])[]
}

/** One stream of a live decoder Worker. Every stream of a Worker gets the same input. */
export interface LiveStreamSpec {
  /**
   * White noise added to the input, relative to the loudest recent input block. The seed makes the
   * noise repeatable. Undefined decodes the input unchanged.
   */
  readonly noise?: { readonly snrDb: number, readonly seed: number }
  /** The blank penalty of the stream's recognizer. See {@link DecodeRequest.blankPenalty}. */
  readonly blankPenalty: number
  /** Rollouts of the stream. They get the stream's endpoints. Only transducers support them. */
  readonly rollouts?: RolloutSettings
  /** Phrases that the stream prefers. See {@link DecodeRequest.hotwords}. */
  readonly hotwords?: readonly Hotword[]
}

/**
 * Names one live session of a Worker. A Worker keeps one session at a time. Calls for another session
 * fail, so a session that the caller dropped cannot feed or close a newer one.
 */
export interface LiveSessionRef {
  readonly session: number
}

export interface LiveListen extends LiveSessionRef {
  readonly sampleRate: number
  readonly streams: readonly LiveStreamSpec[]
  /**
   * When true, the first stream finds the endpoints, and each endpoint cuts every stream at the same
   * input. When false, the caller cuts the streams with `decoderCut`.
   */
  readonly leads: boolean
}

/** The segments that one cut closed, at an endpoint or at the end of the input. */
export interface LiveEndpoint {
  /**
   * One segment per stream, in listen order, all over the same input. A segment has no tokens when its
   * stream heard nothing. The audio can still hold speech that the model deleted.
   */
  readonly segments: readonly RawSegment[]
  /** For each stream, in listen order, one segment per rollout over the same input. Empty for a stream without rollouts. */
  readonly rollouts: readonly (readonly RawSegment[])[]
  /** Seconds from the first accepted sample to the end of the segments. */
  readonly endTime: number
}

export interface LiveUpdate {
  /** The open segment of the first stream. Undefined when it has no tokens yet, or when the Worker does not lead. */
  readonly partial?: RawSegment
  readonly endpoints: readonly LiveEndpoint[]
}

export interface LiveChunk extends LiveSessionRef {
  /** Mono PCM in [-1, 1] at the sample rate of `decoderListen`. The worker takes ownership. */
  readonly samples: Float32Array<ArrayBuffer>
}

export const decoderLoad = defineInvokeEventa<void, DecoderModel>('voice:asr-uncertainty:decoder:load')
export const decoderDecode = defineInvokeEventa<DecodedClip, DecodeRequest>('voice:asr-uncertainty:decoder:decode')
/** Opens a live session. It replaces the open session, and drops that session's streams. */
export const decoderListen = defineInvokeEventa<void, LiveListen>('voice:asr-uncertainty:decoder:listen')
export const decoderAccept = defineInvokeEventa<LiveUpdate, LiveChunk>('voice:asr-uncertainty:decoder:accept')
/** Closes the segment of every live stream at the input accepted so far, and starts the next ones. */
export const decoderCut = defineInvokeEventa<LiveEndpoint, LiveSessionRef>('voice:asr-uncertainty:decoder:cut')
/** Flushes and closes the live streams. The result holds the last segment of each stream. */
export const decoderFinish = defineInvokeEventa<LiveEndpoint, LiveSessionRef>('voice:asr-uncertainty:decoder:finish')
/** Closes the live streams without a result. Does nothing when the session is already closed or replaced. */
export const decoderClose = defineInvokeEventa<void, LiveSessionRef>('voice:asr-uncertainty:decoder:close')

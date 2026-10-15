import type { ASRModule, OnlineRecognizer } from '@sherpaw/asr'

import type { DecodedClip, DecoderModel, Hotword, LiveEndpoint, LiveUpdate, RawSegment, RolloutSettings } from './events'

import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/webworkers/worker'
import { createOnlineRecognizer, initASRModule, OnlineRecognizerTypes } from '@sherpaw/asr'
import { loadData } from '@sherpaw/preloader'
import { array, number, object, optional, parse, string } from 'valibot'

import { decoderAccept, decoderClose, decoderCut, decoderDecode, decoderFinish, decoderListen, decoderLoad } from './events'
import { InputLevel, NoiseStream } from './live-noise'

/**
 * The subset of the sherpa-onnx result JSON that the probe reads.
 * Source: `OnlineRecognizerResult::AsJsonString` in sherpa-onnx `csrc/online-recognizer.cc`.
 */
const resultSchema = object({
  text: string(),
  tokens: optional(array(string()), []),
  timestamps: optional(array(number()), []),
  ys_probs: optional(array(number()), []),
  start_time: optional(number(), 0),
})

/**
 * Streaming models hold back the last frames until more audio arrives. This much silence after the
 * clip flushes them, so the last word is decoded. The value matches the sherpa-onnx examples.
 */
const tailPaddingSeconds = 0.6

/** Feed size for one `acceptWaveform` call. The decoder result does not depend on it. */
const chunkSeconds = 0.1

type Stream = ReturnType<OnlineRecognizer['createStream']>

interface LiveStream {
  readonly recognizer: OnlineRecognizer
  readonly stream: Stream
  readonly noise?: NoiseStream
}

interface LiveState {
  readonly session: number
  readonly streams: LiveStream[]
  readonly sampleRate: number
  /** Input samples accepted so far, without the tail padding. */
  received: number
  readonly level: InputLevel
  readonly leads: boolean
}

const { context } = createContext()

/**
 * Worker state. `load` replaces all of it. Recognizers read model files from the module file system,
 * so each recognizer stays valid until the next `load`.
 *
 * `recognizers` is keyed by {@link recognizerKey}. Each recognizer holds its own copy of the model sessions, so
 * the worker keeps one hotword list at a time: a new list frees the recognizers of older lists that no live
 * stream uses.
 */
let state: {
  module: ASRModule
  model: DecoderModel
  recognizers: Map<string, OnlineRecognizer>
  live?: LiveState
} | undefined

function loaded() {
  if (!state)
    throw new Error('Load a model before decoding.')
  return state
}

/**
 * The sherpa-onnx hotword buffer: one phrase per line, with an optional ` :score` after the phrase.
 * A word that starts with `:` would read as a score, and a line break would split a phrase, so both are removed.
 * Returns an empty string when the model cannot encode plain-text hotwords, so the decode keeps greedy search.
 *
 * @example
 * hotwordBuffer([{ phrase: '硫方怪', score: 4 }, { phrase: 'Zustand' }])
 * // => '硫方怪 :4\nZustand'
 */
function hotwordBuffer(hotwords: readonly Hotword[] | undefined) {
  const model = loaded().model
  if (model.recognizer !== 'transducer' || model.modelingUnit === '')
    return ''
  return (hotwords ?? []).flatMap(({ phrase, score }) => {
    const text = phrase.split(/\s+/).filter(word => word !== '' && !word.startsWith(':')).join(' ')
    if (!text)
      return []
    return [score === undefined ? text : `${text} :${score}`]
  }).join('\n')
}

/** The blank penalty and the hotword buffer are recognizer settings, so each pair needs its own recognizer. */
function recognizerKey(blankPenalty: number, buffer: string) {
  return `${blankPenalty}\n${buffer}`
}

function recognizerFor(blankPenalty: number, hotwords?: readonly Hotword[]): OnlineRecognizer {
  const current = loaded()
  const buffer = hotwordBuffer(hotwords)
  const key = recognizerKey(blankPenalty, buffer)
  let recognizer = current.recognizers.get(key)
  if (recognizer)
    return recognizer

  if (buffer) {
    // Another list's recognizers are freed, unless a live stream still decodes with them.
    const inUse = new Set(current.live?.streams.map(live => live.recognizer))
    for (const [otherKey, other] of current.recognizers) {
      if (!otherKey.endsWith('\n') && !inUse.has(other)) {
        other.free()
        current.recognizers.delete(otherKey)
      }
    }
  }
  recognizer = createOnlineRecognizer(current.module, {
    type: current.model.recognizer === 'paraformer' ? OnlineRecognizerTypes.Paraformer : OnlineRecognizerTypes.Transducer,
    modelConfig: { modelingUnit: current.model.modelingUnit },
    blankPenalty,
    // sherpa-onnx applies hotwords only in modified beam search. The buffer size counts UTF-8 bytes.
    ...(buffer ? { decodingMethod: 'modified_beam_search', hotwordsBuf: buffer, hotwordsBufSize: new TextEncoder().encode(buffer).byteLength } : {}),
  })
  current.recognizers.set(key, recognizer)
  return recognizer
}

function toSegment(raw: unknown): RawSegment {
  const result = parse(resultSchema, raw)
  return {
    text: result.text,
    tokens: result.tokens,
    timestamps: result.timestamps,
    ysProbs: result.ys_probs,
    startTime: result.start_time,
  }
}

function readResult(recognizer: OnlineRecognizer, stream: Stream): RawSegment {
  return toSegment(recognizer.getResult(stream))
}

function hasContent(segment: RawSegment) {
  return segment.text !== '' || segment.tokens.length > 0
}

/** The open segment of a stream and of each of its rollouts. */
interface OpenSegments {
  readonly segment: RawSegment
  readonly rollouts: RawSegment[]
}

function readSegments(recognizer: OnlineRecognizer, stream: Stream): OpenSegments {
  return { segment: readResult(recognizer, stream), rollouts: recognizer.getRolloutResults(stream).map(toSegment) }
}

/** Closes the open segments and starts the next ones. The rollouts reset with their stream. */
function closeSegments(recognizer: OnlineRecognizer, stream: Stream): OpenSegments {
  // Reset starts the next segment, so the results must be read first.
  const closed = readSegments(recognizer, stream)
  recognizer.reset(stream)
  return closed
}

function createStream(recognizer: OnlineRecognizer, rollouts: RolloutSettings | undefined): Stream {
  const stream = recognizer.createStream()
  try {
    if (rollouts)
      recognizer.attachRollouts(stream, rollouts)
    return stream
  }
  catch (error) {
    stream.free()
    throw error
  }
}

/** Decodes one block. Returns the closed segments when the block reaches an endpoint, and starts the next ones. */
function feed(recognizer: OnlineRecognizer, stream: Stream, sampleRate: number, block: Float32Array): OpenSegments | undefined {
  stream.acceptWaveform(sampleRate, block)
  while (recognizer.isReady(stream))
    recognizer.decode(stream)
  return recognizer.isEndpoint(stream) ? closeSegments(recognizer, stream) : undefined
}

/** Flushes the held-back frames and returns the segments that the flush closes, the last ones included. */
function flush(recognizer: OnlineRecognizer, stream: Stream, sampleRate: number): OpenSegments[] {
  const closed = feed(recognizer, stream, sampleRate, new Float32Array(Math.round(sampleRate * tailPaddingSeconds)))
  stream.inputFinished()
  while (recognizer.isReady(stream))
    recognizer.decode(stream)
  return [closed, readSegments(recognizer, stream)].filter(segments => segments !== undefined)
}

function closeLive() {
  for (const live of state?.live?.streams ?? [])
    live.stream.free()
  if (state)
    state.live = undefined
}

function listening(session: number): LiveState {
  const live = state?.live
  if (live?.session !== session)
    throw new Error('This live session is closed.')
  return live
}

/** Gives every live stream the same block, with its own noise, and decodes what is ready. */
function feedLive(live: LiveState, block: Float32Array) {
  const level = live.level.update(block)
  for (const { recognizer, stream, noise } of live.streams) {
    stream.acceptWaveform(live.sampleRate, noise ? noise.apply(block, level) : block)
    while (recognizer.isReady(stream))
      recognizer.decode(stream)
  }
}

/**
 * Closes the segment of every live stream and starts the next ones.
 * Only the first stream's endpoints count, so all segments cover the same input.
 */
function cutLive(live: LiveState): LiveEndpoint {
  const closed = live.streams.map(({ recognizer, stream }) => closeSegments(recognizer, stream))
  return {
    segments: closed.map(({ segment }) => segment),
    rollouts: closed.map(({ rollouts }) => rollouts),
    endTime: live.received / live.sampleRate,
  }
}

defineInvokeHandler(context, decoderLoad, async (model) => {
  closeLive()
  for (const recognizer of state?.recognizers.values() ?? [])
    recognizer.free()
  // A fresh module per load keeps an earlier model's files out of the file system.
  const module = await initASRModule()
  loadData({ module, metadata: model.metadata, data: model.data })
  state = { module, model, recognizers: new Map() }
  // Creating the default recognizer now reports a wrong model or recognizer type at load time.
  recognizerFor(0)
})

defineInvokeHandler(context, decoderDecode, ({ samples, sampleRate, blankPenalty, rollouts, hotwords }): DecodedClip => {
  const recognizer = recognizerFor(blankPenalty, hotwords)
  // Freeing the stream also frees its rollouts.
  const stream = createStream(recognizer, rollouts)
  const closed: OpenSegments[] = []
  try {
    const chunk = Math.round(sampleRate * chunkSeconds)
    for (let start = 0; start < samples.length; start += chunk) {
      const segments = feed(recognizer, stream, sampleRate, samples.subarray(start, start + chunk))
      if (segments)
        closed.push(segments)
    }
    closed.push(...flush(recognizer, stream, sampleRate))
    return {
      segments: closed.map(({ segment }) => segment).filter(hasContent),
      rollouts: Array.from({ length: rollouts?.count ?? 0 }, (_, index) => closed.map(segments => segments.rollouts[index]).filter(hasContent)),
    }
  }
  finally {
    stream.free()
  }
})

defineInvokeHandler(context, decoderListen, ({ session, sampleRate, streams, leads }) => {
  const current = loaded()
  closeLive()
  const live: LiveState = { session, streams: [], sampleRate, received: 0, level: new InputLevel(sampleRate), leads }
  current.live = live
  try {
    for (const spec of streams) {
      const recognizer = recognizerFor(spec.blankPenalty, spec.hotwords)
      live.streams.push({ recognizer, stream: createStream(recognizer, spec.rollouts), noise: spec.noise && new NoiseStream(spec.noise.snrDb, spec.noise.seed) })
    }
  }
  catch (error) {
    // A failed listen returns no session to close, so the streams created so far are freed here.
    closeLive()
    throw error
  }
})

defineInvokeHandler(context, decoderAccept, ({ session, samples }): LiveUpdate => {
  const live = listening(session)
  feedLive(live, samples)
  live.received += samples.length
  const first = live.streams[0]
  if (!live.leads || !first)
    return { endpoints: [] }
  if (first.recognizer.isEndpoint(first.stream))
    return { endpoints: [cutLive(live)] }
  const partial = readResult(first.recognizer, first.stream)
  return { partial: hasContent(partial) ? partial : undefined, endpoints: [] }
})

defineInvokeHandler(context, decoderCut, ({ session }) => cutLive(listening(session)))

defineInvokeHandler(context, decoderFinish, ({ session }): LiveEndpoint => {
  const live = listening(session)
  try {
    // The padding is not input, so it does not count in `received`, and the segments end where the input ended.
    feedLive(live, new Float32Array(Math.round(live.sampleRate * tailPaddingSeconds)))
    for (const { recognizer, stream } of live.streams) {
      stream.inputFinished()
      while (recognizer.isReady(stream))
        recognizer.decode(stream)
    }
    return cutLive(live)
  }
  finally {
    closeLive()
  }
})

defineInvokeHandler(context, decoderClose, ({ session }) => {
  if (state?.live?.session === session)
    closeLive()
})

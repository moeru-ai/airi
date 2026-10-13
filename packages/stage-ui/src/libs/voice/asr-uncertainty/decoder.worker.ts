import type { ASRModule, OnlineRecognizer } from '@sherpaw/asr'

import type { DecoderModel, LiveEndpoint, LiveUpdate, RawSegment } from './events'

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
 */
let state: {
  module: ASRModule
  model: DecoderModel
  recognizers: Map<number, OnlineRecognizer>
  live?: LiveState
} | undefined

function loaded() {
  if (!state)
    throw new Error('Load a model before decoding.')
  return state
}

function recognizerFor(blankPenalty: number): OnlineRecognizer {
  const current = loaded()
  // The blank penalty is a recognizer setting, so each value needs its own recognizer.
  let recognizer = current.recognizers.get(blankPenalty)
  if (!recognizer) {
    recognizer = createOnlineRecognizer(current.module, {
      type: current.model.recognizer === 'paraformer' ? OnlineRecognizerTypes.Paraformer : OnlineRecognizerTypes.Transducer,
      modelConfig: { modelingUnit: current.model.modelingUnit },
      blankPenalty,
    })
    current.recognizers.set(blankPenalty, recognizer)
  }
  return recognizer
}

function readResult(recognizer: OnlineRecognizer, stream: Stream): RawSegment {
  const result = parse(resultSchema, recognizer.getResult(stream))
  return {
    text: result.text,
    tokens: result.tokens,
    timestamps: result.timestamps,
    ysProbs: result.ys_probs,
    startTime: result.start_time,
  }
}

function hasContent(segment: RawSegment) {
  return segment.text !== '' || segment.tokens.length > 0
}

/** Decodes one block. Returns the closed segment when the block reaches an endpoint, and starts the next one. */
function feed(recognizer: OnlineRecognizer, stream: Stream, sampleRate: number, block: Float32Array): RawSegment | undefined {
  stream.acceptWaveform(sampleRate, block)
  while (recognizer.isReady(stream))
    recognizer.decode(stream)
  if (!recognizer.isEndpoint(stream))
    return undefined
  // Reset starts the next segment, so the result must be read first.
  const segment = readResult(recognizer, stream)
  recognizer.reset(stream)
  return segment
}

/** Flushes the held-back frames and returns the segments that the flush closes, the last one included. */
function flush(recognizer: OnlineRecognizer, stream: Stream, sampleRate: number): RawSegment[] {
  const closed = feed(recognizer, stream, sampleRate, new Float32Array(Math.round(sampleRate * tailPaddingSeconds)))
  stream.inputFinished()
  while (recognizer.isReady(stream))
    recognizer.decode(stream)
  return [closed, readResult(recognizer, stream)].filter(segment => segment !== undefined)
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
  const segments = live.streams.map(({ recognizer, stream }) => {
    // Reset starts the next segment, so the result must be read first.
    const segment = readResult(recognizer, stream)
    recognizer.reset(stream)
    return segment
  })
  return { segments, endTime: live.received / live.sampleRate }
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

defineInvokeHandler(context, decoderDecode, ({ samples, sampleRate, blankPenalty }) => {
  const recognizer = recognizerFor(blankPenalty)
  const stream = recognizer.createStream()
  const segments: RawSegment[] = []
  try {
    const chunk = Math.round(sampleRate * chunkSeconds)
    for (let start = 0; start < samples.length; start += chunk) {
      const closed = feed(recognizer, stream, sampleRate, samples.subarray(start, start + chunk))
      if (closed)
        segments.push(closed)
    }
    segments.push(...flush(recognizer, stream, sampleRate))
    return segments.filter(hasContent)
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
  for (const spec of streams) {
    const recognizer = recognizerFor(spec.blankPenalty)
    live.streams.push({ recognizer, stream: recognizer.createStream(), noise: spec.noise && new NoiseStream(spec.noise.snrDb, spec.noise.seed) })
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

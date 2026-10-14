import type { SherpawModel } from '@proj-airi/provider-inference'

import type { DecodedClip, DecodeRequest, DecoderModel, LiveEndpoint, LiveListen, LiveUpdate, RolloutSettings } from './events'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/webworkers'

import { fetchSherpawModelPack } from '../../providers/providers/sherpaw/model-assets'
import { decoderAccept, decoderClose, decoderCut, decoderDecode, decoderFinish, decoderListen, decoderLoad } from './events'

type WorkerContext = ReturnType<typeof createContext>['context']

/** Downloads the model pack when needed. One result can start many decoders. */
export async function fetchDecoderModel(model: SherpawModel): Promise<DecoderModel> {
  const pack = await fetchSherpawModelPack(model.id, `Sherpaw model "${model.id}"`)
  return { data: pack.data, metadata: pack.metadata, recognizer: model.recognizer, modelingUnit: model.modelingUnit }
}

/** Settings of one clip decode. See {@link DecodeRequest}. */
export interface DecodeOptions {
  readonly sampleRate: number
  readonly blankPenalty: number
  readonly rollouts?: RolloutSettings
}

/** Starts a decoder Worker and loads a copy of the model into it, so the caller keeps `model`. */
async function startWorker(model: DecoderModel) {
  const { default: DecoderScript } = await import('./decoder.worker?worker')
  const worker = new DecoderScript()
  try {
    const { context } = createContext(worker)
    const data = model.data.slice(0)
    await defineInvoke(context, decoderLoad)({ ...model, data }, { transfer: [data] })
    return { worker, context }
  }
  catch (error) {
    worker.terminate()
    throw error
  }
}

/** The calls of a live session. A Worker defines them once, and every session uses them. */
function liveCalls(context: WorkerContext) {
  return {
    accept: defineInvoke(context, decoderAccept),
    cut: defineInvoke(context, decoderCut),
    finish: defineInvoke(context, decoderFinish),
    close: defineInvoke(context, decoderClose),
  }
}

type LiveCalls = ReturnType<typeof liveCalls>

/**
 * One Worker with one Sherpaw model loaded. It decodes whole clips, and it runs live sessions.
 *
 * Hearing's Sherpaw Provider keeps only text. This decoder keeps token times and log probabilities,
 * which the uncertainty probe needs. The Worker keeps the model loaded until `dispose`, so later runs
 * start at once. It runs one call at a time, in call order. `dispose` terminates the Worker, and calls
 * that are still pending never settle.
 */
export class DecoderWorker {
  private readonly decodeInWorker
  private readonly listenInWorker
  private readonly calls: LiveCalls
  private nextSession = 0

  private constructor(
    private readonly worker: Worker,
    context: WorkerContext,
  ) {
    this.decodeInWorker = defineInvoke(context, decoderDecode)
    this.listenInWorker = defineInvoke(context, decoderListen)
    this.calls = liveCalls(context)
  }

  static async create(model: DecoderModel): Promise<DecoderWorker> {
    const { worker, context } = await startWorker(model)
    return new DecoderWorker(worker, context)
  }

  /** Decodes mono PCM in [-1, 1]. The samples are copied, so the caller keeps its array. */
  decode(samples: Float32Array, options: DecodeOptions): Promise<DecodedClip> {
    const copy = new Float32Array(samples)
    return this.decodeInWorker({ samples: copy, ...options }, { transfer: [copy.buffer] })
  }

  /** Opens a live session. It replaces the open session of this Worker. */
  async listen(listen: Omit<LiveListen, 'session'>): Promise<LiveDecoder> {
    const session = this.nextSession++
    await this.listenInWorker({ ...listen, session })
    return new LiveDecoder(this.calls, session)
  }

  dispose(): void {
    this.worker.terminate()
  }
}

/**
 * One live session in a {@link DecoderWorker}, as one or more streams that each get the same input.
 *
 * Each stream can add its own noise, so the streams are Monte Carlo rollouts that run while the
 * input arrives. A leading session finds endpoints with its first stream and cuts all its streams
 * there. A following session cuts only when `cut` is called. Calls run in order in the Worker, so a
 * `cut` sent after an `accept` cuts after that input. Token times count from the first accepted
 * sample, also after a cut. A decode slower than real time makes `accept` fall behind the input.
 * Calls fail after `finish`, after `close`, and after the Worker opens another session.
 */
export class LiveDecoder {
  constructor(
    private readonly calls: LiveCalls,
    private readonly session: number,
  ) {}

  /** Decodes the next mono PCM block. The samples are copied, so the caller keeps its array. */
  accept(samples: Float32Array): Promise<LiveUpdate> {
    const copy = new Float32Array(samples)
    return this.calls.accept({ session: this.session, samples: copy }, { transfer: [copy.buffer] })
  }

  /** Closes the segment of every stream at the input accepted so far. */
  cut(): Promise<LiveEndpoint> {
    return this.calls.cut({ session: this.session })
  }

  /** Ends the input and closes the session. The result holds the last segment of every stream. */
  finish(): Promise<LiveEndpoint> {
    return this.calls.finish({ session: this.session })
  }

  /** Closes the session without a result. The Worker keeps its model. */
  close(): Promise<void> {
    return this.calls.close({ session: this.session })
  }
}

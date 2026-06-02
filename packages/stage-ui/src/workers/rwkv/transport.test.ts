import type { InboundMessage, MessageEndpoint, OutboundMessage, RwkvWorkerOps } from './transport'

import { describe, expect, it, vi } from 'vitest'

import { createMessagePortTransport } from './transport'

/**
 * A fake {@link MessageEndpoint} that captures outbound messages and lets a
 * test push inbound ones, standing in for the worker's `globalThis`.
 *
 * @example
 * const { endpoint, posted, send } = createFakeEndpoint()
 * send({ kind: 'invoke', id: '1', op: 'unload' })
 */
function createFakeEndpoint() {
  let listener: ((event: MessageEvent<InboundMessage>) => void) | null = null
  const posted: OutboundMessage[] = []

  const endpoint: MessageEndpoint = {
    postMessage: message => posted.push(message),
    addEventListener: (_type, handler) => { listener = handler },
  }

  const send = (message: InboundMessage): void => {
    listener?.({ data: message } as MessageEvent<InboundMessage>)
  }

  return { endpoint, posted, send }
}

/** Let queued microtasks/timers settle so async dispatch completes. */
const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

const READY = {
  modelId: 'rwkv7-g1-100m-fp16',
  quantization: 'fp16',
  info: { numLayer: 2, numVocab: 10, numEmb: 4, version: 'v7' },
} as const

describe('createMessagePortTransport', () => {
  /**
   * @example
   * send({ kind: 'invoke', id: '1', op: 'load', payload: { modelId } })
   * // -> posts a 'chunk' then a 'result'
   */
  it('forwards an emit as a chunk and the resolved value as a result', async () => {
    const { endpoint, posted, send } = createFakeEndpoint()
    const ops: RwkvWorkerOps = {
      load: async (request, context) => {
        context.emit({ phase: 'compile', percent: 50 })
        return { ...READY, modelId: request.modelId }
      },
      generate: async () => ({ text: '', tokens: 0, finishReason: 'length' }),
      unload: async () => {},
    }

    createMessagePortTransport(endpoint).serve(ops)
    send({ kind: 'invoke', id: '1', op: 'load', payload: { modelId: 'rwkv7-g1-100m-fp16' } })
    await flush()

    expect(posted[0]).toEqual({ kind: 'chunk', id: '1', chunk: { phase: 'compile', percent: 50 } })
    expect(posted[1]).toEqual({ kind: 'result', id: '1', result: READY })
  })

  /**
   * @example
   * send invoke generate, then send cancel with the same id // -> aborts the op
   */
  it('aborts the matching operation on a cancel message', async () => {
    const { endpoint, posted, send } = createFakeEndpoint()
    const onAbort = vi.fn()
    const ops: RwkvWorkerOps = {
      load: async () => READY,
      generate: (_request, context) => new Promise((_resolve, reject) => {
        context.signal.addEventListener('abort', () => {
          onAbort()
          reject(new DOMException('The operation was aborted', 'AbortError'))
        })
      }),
      unload: async () => {},
    }

    createMessagePortTransport(endpoint).serve(ops)
    send({ kind: 'invoke', id: '2', op: 'generate', payload: { prompt: 'hi' } })
    await flush()
    send({ kind: 'cancel', id: '2' })
    await flush()

    expect(onAbort).toHaveBeenCalledOnce()
    expect(posted).toContainEqual({ kind: 'error', id: '2', name: 'AbortError', message: 'The operation was aborted' })
  })

  /**
   * @example
   * send({ kind: 'invoke', id: '3', op: 'unload' }) // -> result null
   */
  it('acknowledges unload with a null result', async () => {
    const { endpoint, posted, send } = createFakeEndpoint()
    const unload = vi.fn(async () => {})
    const ops: RwkvWorkerOps = {
      load: async () => READY,
      generate: async () => ({ text: '', tokens: 0, finishReason: 'length' }),
      unload,
    }

    createMessagePortTransport(endpoint).serve(ops)
    send({ kind: 'invoke', id: '3', op: 'unload' })
    await flush()

    expect(unload).toHaveBeenCalledOnce()
    expect(posted).toContainEqual({ kind: 'result', id: '3', result: null })
  })

  /**
   * @example
   * a throwing op // -> posts an 'error' carrying the name and message
   */
  it('reports a thrown error as an error message', async () => {
    const { endpoint, posted, send } = createFakeEndpoint()
    const ops: RwkvWorkerOps = {
      load: async () => { throw new Error('model not found') },
      generate: async () => ({ text: '', tokens: 0, finishReason: 'length' }),
      unload: async () => {},
    }

    createMessagePortTransport(endpoint).serve(ops)
    send({ kind: 'invoke', id: '4', op: 'load', payload: { modelId: 'rwkv7-g1-100m-fp16' } })
    await flush()

    expect(posted).toContainEqual({ kind: 'error', id: '4', name: 'Error', message: 'model not found' })
  })
})

/**
 * Worker-side transport abstraction for the web-rwkv worker.
 *
 * ## Why this exists
 *
 * The repo's inference workers are mid-migration: the hand-rolled `postMessage`
 * protocol (`libs/inference/protocol.ts` + `worker-manager.ts`) is being
 * replaced by a typed `@moeru/eventa` RPC contract (PR #1917). Rather than
 * couple the RWKV engine to whichever transport happens to be current, the
 * engine speaks to this small, transport-agnostic port:
 *
 * - An {@link Operation} is a request → terminal-result async function that may
 *   stream intermediate chunks (load progress, generated tokens) via its
 *   {@link OperationContext} and observe cancellation via `ctx.signal`.
 * - {@link RwkvWorkerOps} is the worker's full surface (load / generate / unload).
 * - A {@link RwkvWorkerTransport} binds those ops to a concrete wire.
 *
 * Exactly one binding ships today — {@link createMessagePortTransport}, over a
 * `postMessage` endpoint with its own minimal, self-contained envelope. It is
 * the *only* seam that PR #1917 needs to replace (with an eventa binding); the
 * engine, the ops, and every domain type stay untouched.
 *
 * Call stack (worker entry):
 *
 * worker.ts
 *   -> {@link createMessagePortTransport}
 *     -> transport.serve({@link RwkvWorkerOps})
 *       -> Operation(request, {@link OperationContext})  // engine.load / engine.generate
 */

import type {
  RwkvGenerateDelta,
  RwkvGenerateRequest,
  RwkvGenerateResult,
  RwkvLoadProgress,
  RwkvLoadRequest,
  RwkvLoadResult,
} from './types'

import { errorMessageFrom } from '@moeru/std'

/**
 * Per-operation handle passed to an {@link Operation}.
 *
 * @param TChunk - The intermediate chunk type this operation streams.
 */
export interface OperationContext<TChunk> {
  /** Emit an intermediate chunk (load progress, or a generated token). */
  emit: (chunk: TChunk) => void
  /** Aborts when the caller cancels *this* operation. */
  signal: AbortSignal
}

/**
 * A request → terminal-result async function that may stream chunks meanwhile.
 *
 * @param TRequest - Inbound request payload.
 * @param TChunk - Intermediate streamed chunk type.
 * @param TResult - Terminal result payload.
 */
export type Operation<TRequest, TChunk, TResult>
  = (request: TRequest, context: OperationContext<TChunk>) => Promise<TResult>

/**
 * The web-rwkv worker's full operation surface.
 *
 * `load` and `generate` are server-streaming (progress chunks / token deltas
 * precede the terminal result); `unload` is a plain request → ack.
 */
export interface RwkvWorkerOps {
  load: Operation<RwkvLoadRequest, RwkvLoadProgress, RwkvLoadResult>
  generate: Operation<RwkvGenerateRequest, RwkvGenerateDelta, RwkvGenerateResult>
  unload: () => Promise<void>
}

/** Binds an {@link RwkvWorkerOps} implementation to a concrete wire. */
export interface RwkvWorkerTransport {
  /** Begin routing inbound messages to `ops`. Call once. */
  serve: (ops: RwkvWorkerOps) => void
}

// postMessage binding (the seam PR #1917 swaps for an eventa binding).

/** Names of the streaming operations carried by the wire envelope. */
type StreamingOpName = 'load' | 'generate'

/**
 * Inbound wire messages (main → worker).
 *
 * NOTICE:
 * This envelope is intentionally self-contained — it does NOT import the
 * `libs/inference/protocol.ts` message types, because that module is being
 * removed by PR #1917. When the eventa contract lands, replace this whole
 * binding (not the ops/engine) with an eventa-backed one.
 */
export type InboundMessage
  = | { kind: 'invoke', id: string, op: 'load', payload: RwkvLoadRequest }
    | { kind: 'invoke', id: string, op: 'generate', payload: RwkvGenerateRequest }
    | { kind: 'invoke', id: string, op: 'unload' }
    | { kind: 'cancel', id: string }

/** Outbound wire messages (worker → main). */
export type OutboundMessage
  = | { kind: 'chunk', id: string, chunk: RwkvLoadProgress | RwkvGenerateDelta }
    | { kind: 'result', id: string, result: RwkvLoadResult | RwkvGenerateResult | null }
    | { kind: 'error', id: string, name: string, message: string }

/**
 * Minimal `postMessage`-style endpoint.
 *
 * Matches both a `DedicatedWorkerGlobalScope` (the real worker) and a fake
 * object in tests, so the binding never reaches for a global directly.
 */
export interface MessageEndpoint {
  postMessage: (message: OutboundMessage) => void
  addEventListener: (type: 'message', listener: (event: MessageEvent<InboundMessage>) => void) => void
}

/**
 * Build the `postMessage` transport binding.
 *
 * Use when:
 * - Wiring the RWKV worker entry to its host scope (`globalThis`), or driving
 *   the worker from a unit test via a fake {@link MessageEndpoint}.
 *
 * Expects:
 * - `endpoint` delivers inbound {@link InboundMessage}s and accepts outbound
 *   ones. Callers serialize their own invokes (the engine is single-GPU and
 *   not reentrant); concurrent streaming invokes are not multiplexed safely.
 *
 * Returns:
 * - A {@link RwkvWorkerTransport} whose `serve` routes each invoke to the
 *   matching op, forwards `emit` as `chunk` messages, the resolved value as a
 *   `result`, and any throw (including `AbortError`) as an `error`.
 */
export function createMessagePortTransport(endpoint: MessageEndpoint): RwkvWorkerTransport {
  // Per-invoke abort controllers, keyed by request id, so a `cancel` message
  // can signal the exact in-flight operation.
  const inflight = new Map<string, AbortController>()

  function serve(ops: RwkvWorkerOps): void {
    endpoint.addEventListener('message', (event) => {
      const message = event.data
      if (message.kind === 'cancel') {
        inflight.get(message.id)?.abort()
        return
      }
      void dispatch(ops, message)
    })
  }

  async function dispatch(ops: RwkvWorkerOps, message: Extract<InboundMessage, { kind: 'invoke' }>): Promise<void> {
    const { id } = message
    const controller = new AbortController()
    inflight.set(id, controller)

    try {
      if (message.op === 'unload') {
        await ops.unload()
        endpoint.postMessage({ kind: 'result', id, result: null })
        return
      }

      const result = await runStreaming(ops, message, id, controller.signal)
      endpoint.postMessage({ kind: 'result', id, result })
    }
    catch (error) {
      endpoint.postMessage({
        kind: 'error',
        id,
        name: error instanceof Error ? error.name : 'Error',
        message: errorMessageFrom(error) ?? 'Unknown worker error',
      })
    }
    finally {
      inflight.delete(id)
    }
  }

  function runStreaming(
    ops: RwkvWorkerOps,
    message: Extract<InboundMessage, { kind: 'invoke', op: StreamingOpName }>,
    id: string,
    signal: AbortSignal,
  ): Promise<RwkvLoadResult | RwkvGenerateResult> {
    const emit = (chunk: RwkvLoadProgress | RwkvGenerateDelta): void => {
      endpoint.postMessage({ kind: 'chunk', id, chunk })
    }
    if (message.op === 'load')
      return ops.load(message.payload, { emit, signal })
    return ops.generate(message.payload, { emit, signal })
  }

  return { serve }
}

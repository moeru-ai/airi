import type { EventContext } from '@moeru/eventa'
import type {
  FetchTransportPort,
  FetchTransportResponse,
  ModelConnectionErrorFields,
} from '@proj-airi/core-agent'

import type { CustomModelFetchStreamEvent } from '../../shared/eventa/custom-model-fetch'

import { defineInvoke, defineStreamInvoke } from '@moeru/eventa'
import { ModelConnectionError, toModelConnectionError } from '@proj-airi/core-agent'

import {
  electronCustomModelFetch,
  electronCustomModelFetchCancel,
} from '../../shared/eventa/custom-model-fetch'

/**
 * Creates the Renderer Fetch Transport Port.
 *
 * The port talks Eventa only. It never calls `fetch()` with the user URL.
 * Main Process owns the upstream request and the AbortController.
 */
export function createElectronCustomModelFetchTransport<EmitOptions>(
  context: EventContext<undefined, EmitOptions>,
): FetchTransportPort {
  const invokeFetch = defineStreamInvoke(context, electronCustomModelFetch)
  const invokeCancel = defineInvoke(context, electronCustomModelFetchCancel)

  return {
    async request(input) {
      if (input.signal?.aborted)
        throw input.signal.reason ?? new Error('aborted')

      const onAbort = () => {
        void invokeCancel({ requestId: input.requestId })
      }
      input.signal?.addEventListener('abort', onAbort, { once: true })

      try {
        const stream = invokeFetch({
          requestId: input.requestId,
          protocol: input.protocol,
          operation: input.operation,
          url: input.url,
          method: input.method,
          headers: input.headers,
          body: input.body,
          timeoutMs: input.timeoutMs,
        }, { signal: input.signal })

        return await readEventaFetchResponse(input.requestId, stream)
      }
      catch (error) {
        if (input.signal?.aborted)
          throw input.signal.reason ?? error
        throw toModelConnectionError(unwrapEventaError(error), 'transport')
      }
      finally {
        input.signal?.removeEventListener('abort', onAbort)
      }
    },
  }
}

async function readEventaFetchResponse(
  requestId: string,
  stream: ReadableStream<CustomModelFetchStreamEvent>,
): Promise<FetchTransportResponse> {
  const reader = stream.getReader()
  const first = await reader.read()
  const firstEvent = requireEvent(requestId, first)

  if (firstEvent.type === 'error')
    throw new ModelConnectionError(firstEvent.error)
  if (firstEvent.type !== 'headers') {
    throw new ModelConnectionError({
      stage: 'transport',
      code: 'unsupported-response',
      message: 'The Electron transport did not send response headers first.',
      retryable: false,
    })
  }

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const next = await reader.read()
      if (next.done) {
        controller.close()
        return
      }

      const event = next.value
      if (event.type === 'chunk') {
        controller.enqueue(toUint8Array(event.bytes))
        return
      }
      if (event.type === 'complete') {
        controller.close()
        return
      }
      if (event.type === 'error') {
        controller.error(new ModelConnectionError(event.error))
        return
      }

      controller.error(new ModelConnectionError({
        stage: 'transport',
        code: 'unsupported-response',
        message: 'The Electron transport sent an unexpected stream event.',
        retryable: false,
      }))
    },
    cancel(reason) {
      void reader.cancel(reason)
    },
  })

  return {
    requestId,
    status: firstEvent.status,
    headers: firstEvent.headers,
    body,
  }
}

function requireEvent(
  requestId: string,
  result: ReadableStreamReadResult<CustomModelFetchStreamEvent>,
): CustomModelFetchStreamEvent {
  if (result.done || result.value == null) {
    throw new ModelConnectionError({
      stage: 'transport',
      code: 'unknown',
      message: `The Electron transport returned an empty response for ${requestId}.`,
      retryable: false,
    })
  }
  return result.value
}

function toUint8Array(bytes: Uint8Array | number[] | ArrayBuffer): Uint8Array {
  if (bytes instanceof Uint8Array)
    return bytes
  if (bytes instanceof ArrayBuffer)
    return new Uint8Array(bytes)
  return Uint8Array.from(bytes)
}

function unwrapEventaError(error: unknown): unknown {
  if (typeof error !== 'object' || error == null)
    return error

  if ('error' in error) {
    const nested = (error as { error: unknown }).error
    if (isErrorFields(nested))
      return new ModelConnectionError(nested)
    return nested
  }

  if (isErrorFields(error))
    return new ModelConnectionError(error)

  return error
}

function isErrorFields(value: unknown): value is ModelConnectionErrorFields {
  if (typeof value !== 'object' || value == null)
    return false
  const candidate = value as Partial<ModelConnectionErrorFields>
  return typeof candidate.stage === 'string'
    && typeof candidate.code === 'string'
    && typeof candidate.message === 'string'
    && typeof candidate.retryable === 'boolean'
}

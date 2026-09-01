import type { RawData } from 'ws'

import type { CreateDoubaoSpeechTransport, DoubaoSpeechTransport } from './session'

import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'

import WebSocket from 'ws'

import { errorMessageFrom } from '@moeru/std'

interface QueueWaiter<T> {
  reject: (reason?: unknown) => void
  resolve: (result: IteratorResult<T>) => void
}

function createIncomingQueue<T>() {
  const values: T[] = []
  const waiters: QueueWaiter<T>[] = []
  let failure: unknown
  let closed = false

  function next(): Promise<IteratorResult<T>> {
    const value = values.shift()
    if (value !== undefined)
      return Promise.resolve({ done: false, value })
    if (failure !== undefined)
      return Promise.reject(failure)
    if (closed)
      return Promise.resolve({ done: true, value: undefined })

    return new Promise((resolve, reject) => waiters.push({ reject, resolve }))
  }

  return {
    iterable: {
      [Symbol.asyncIterator]() {
        return { next }
      },
    } satisfies AsyncIterable<T>,
    push(value: T) {
      if (closed || failure !== undefined)
        return
      const waiter = waiters.shift()
      if (waiter)
        waiter.resolve({ done: false, value })
      else
        values.push(value)
    },
    fail(error: unknown) {
      if (closed || failure !== undefined)
        return
      failure = error
      for (const waiter of waiters.splice(0))
        waiter.reject(error)
    },
    close() {
      if (closed || failure !== undefined)
        return
      closed = true
      for (const waiter of waiters.splice(0))
        waiter.resolve({ done: true, value: undefined })
    },
  }
}

function rawDataBytes(data: RawData) {
  if (data instanceof ArrayBuffer)
    return new Uint8Array(data)
  if (Array.isArray(data)) {
    const combined = Buffer.concat(data)
    return new Uint8Array(combined.buffer, combined.byteOffset, combined.byteLength)
  }
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
}

/**
 * Opens the authenticated upstream WebSocket in the Electron main process.
 *
 * Browser WebSocket clients cannot set the required `X-Api-Key` and resource
 * headers. This transport owns those headers and exposes only binary frames to
 * the protocol session.
 */
export const createDoubaoSpeechWebSocketTransport: CreateDoubaoSpeechTransport = async (config, signal) => {
  signal?.throwIfAborted()
  const incoming = createIncomingQueue<Uint8Array>()
  const socket = new WebSocket(config.baseUrl, {
    handshakeTimeout: 15_000,
    headers: {
      'X-Api-Key': config.apiKey,
      'X-Api-Resource-Id': config.resourceId,
      'X-Api-Connect-Id': randomUUID(),
      'X-Control-Require-Usage-Tokens-Return': '*',
    },
    maxPayload: 10 * 1024 * 1024,
  })
  let logId: string | undefined
  let disposed = false

  socket.on('upgrade', (response) => {
    const value = response.headers['x-tt-logid']
    logId = Array.isArray(value) ? value[0] : value
  })
  socket.on('message', (data, isBinary) => {
    if (!isBinary) {
      incoming.fail(new TypeError('Doubao speech returned an unexpected text WebSocket frame.'))
      return
    }
    incoming.push(rawDataBytes(data))
  })
  socket.on('error', error => incoming.fail(error))
  socket.on('close', () => incoming.close())

  const abortConnection = () => {
    if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)
      socket.terminate()
  }
  signal?.addEventListener('abort', abortConnection, { once: true })

  try {
    await new Promise<void>((resolve, reject) => {
      function opened() {
        socket.off('error', failed)
        socket.off('unexpected-response', unexpectedResponse)
        resolve()
      }
      function failed(error: Error) {
        socket.off('open', opened)
        socket.off('unexpected-response', unexpectedResponse)
        reject(error)
      }
      function unexpectedResponse(_request: unknown, response: { statusCode?: number, destroy: () => void }) {
        socket.off('open', opened)
        socket.off('error', failed)
        response.destroy()
        reject(new Error(`Doubao speech WebSocket handshake returned HTTP ${response.statusCode ?? 'unknown'}.`))
      }

      socket.once('open', opened)
      socket.once('error', failed)
      socket.once('unexpected-response', unexpectedResponse)
    })
  }
  catch (error) {
    signal?.removeEventListener('abort', abortConnection)
    socket.terminate()
    throw new Error(`Could not connect to Doubao speech: ${errorMessageFrom(error) ?? 'WebSocket handshake failed.'}`, { cause: error })
  }

  const transport: DoubaoSpeechTransport = {
    get logId() {
      return logId
    },
    incoming: incoming.iterable,
    send(data) {
      if (socket.readyState !== WebSocket.OPEN)
        throw new Error('Doubao speech WebSocket is not open.')
      socket.send(data, { binary: true })
    },
    close() {
      if (disposed)
        return
      disposed = true
      signal?.removeEventListener('abort', abortConnection)
      if (socket.readyState === WebSocket.CONNECTING)
        socket.terminate()
      else if (socket.readyState === WebSocket.OPEN)
        socket.close()
    },
  }

  return transport
}

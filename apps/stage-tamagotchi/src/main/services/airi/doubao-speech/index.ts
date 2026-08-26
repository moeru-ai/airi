import type { DoubaoSpeechRequest } from '@proj-airi/stage-shared/doubao-speech'
import type { Lifecycle } from 'injeca'

import { defineStreamInvokeHandler, isAsyncIterable, isReadableStream } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { doubaoSpeechStream } from '@proj-airi/stage-shared/doubao-speech'
import { ipcMain } from 'electron'

import { runDoubaoSpeechSession } from './session'
import { createDoubaoSpeechWebSocketTransport } from './transport'

async function* readableRequests(stream: ReadableStream<DoubaoSpeechRequest>) {
  const reader = stream.getReader()
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done)
        return
      yield next.value
    }
  }
  finally {
    reader.releaseLock()
  }
}

/**
 * Registers the app-wide Doubao Speech stream bridge.
 *
 * The Electron main process owns the authenticated upstream connection. Each
 * renderer invoke owns exactly one connection and one synthesis session.
 *
 * Call stack:
 *
 * setupDoubaoSpeechService
 *   -> {@link defineStreamInvokeHandler}
 *     -> {@link runDoubaoSpeechSession}
 *       -> {@link createDoubaoSpeechWebSocketTransport}
 */
export function setupDoubaoSpeechService(options: { lifecycle: Lifecycle }) {
  const eventa = createContext(ipcMain)
  const removeHandler = defineStreamInvokeHandler(eventa.context, doubaoSpeechStream, async function* (payload, invokeOptions) {
    let requests: AsyncIterable<DoubaoSpeechRequest>
    if (isReadableStream<DoubaoSpeechRequest>(payload))
      requests = readableRequests(payload)
    else if (isAsyncIterable<DoubaoSpeechRequest>(payload))
      requests = payload
    else
      throw new TypeError('Doubao speech requires a streaming request.')

    yield* runDoubaoSpeechSession(
      requests,
      createDoubaoSpeechWebSocketTransport,
      invokeOptions?.abortController?.signal,
    )
  })
  let disposed = false

  const dispose = () => {
    if (disposed)
      return
    disposed = true
    removeHandler()
    eventa.dispose()
  }

  options.lifecycle.appHooks.onStop(dispose)
  return { dispose }
}

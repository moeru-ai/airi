import type { DoubaoSpeechRequest } from '@proj-airi/stage-shared/doubao-speech'
import type { Lifecycle } from 'injeca'

import { defineStreamInvokeHandler, isAsyncIterable, isReadableStream } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { doubaoSpeechStream } from '@proj-airi/stage-shared/doubao-speech'
import { ipcMain } from 'electron'

import { runDoubaoSpeechSession } from './session'
import { createDoubaoSpeechWebSocketTransport } from './transport'

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
    if (!isReadableStream<DoubaoSpeechRequest>(payload) && !isAsyncIterable<DoubaoSpeechRequest>(payload))
      throw new TypeError('Doubao speech requires a streaming request.')

    yield* runDoubaoSpeechSession(
      payload,
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

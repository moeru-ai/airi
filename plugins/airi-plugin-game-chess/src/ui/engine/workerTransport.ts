import type { UciTransport } from '../../engine/stockfishEngine'

/**
 * Path of the Stockfish worker script, relative to the gamelet document.
 *
 * The `.js` glue and its `.wasm` binary ship as verbatim sibling assets under
 * `engine/`, emitted by the `stockfishEngineAssets` plugin in
 * `src/ui/vite.config.ts`.
 */
const ENGINE_SCRIPT = 'engine/stockfish-18-lite-single.js'

/**
 * Wires a {@link UciTransport} to a real Stockfish engine running in a Web Worker.
 *
 * Use when:
 * - The gamelet UI needs production position analysis (pair with
 *   `createStockfishEngine`)
 *
 * Expects:
 * - Runs in the browser; `document` and `Worker` are available
 * - The engine assets are reachable at {@link ENGINE_SCRIPT} relative to the
 *   document base URL
 *
 * Returns:
 * - A transport that forwards UCI command strings to the worker and fans the
 *   worker's output lines out to every `onLine` subscriber.
 */
export function createWorkerTransport(): UciTransport {
  // NOTICE:
  // Resolved against document.baseURI (not import.meta.url) on purpose.
  // Root cause: the Stockfish worker derives its .wasm URL from its own script
  // URL, so the .js and .wasm must stay co-located with matching basenames and
  // must NOT pass through Vite's hashing asset pipeline. Building the URL from
  // a non-literal base also keeps Vite from trying to bundle the worker.
  // Source: stockfish 18.0.7 bin/stockfish-18-lite-single.js (locateFile);
  // assets emitted by src/ui/vite.config.ts.
  // Removal condition: only if the engine is shipped through Vite's worker/
  // asset pipeline with a wasm-locating shim.
  const worker = new Worker(new URL(ENGINE_SCRIPT, document.baseURI))

  const listeners = new Set<(line: string) => void>()
  worker.addEventListener('message', (event: MessageEvent<string>) => {
    for (const listener of listeners)
      listener(event.data)
  })

  return {
    send: command => worker.postMessage(command),
    onLine: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    terminate: () => worker.terminate(),
  }
}

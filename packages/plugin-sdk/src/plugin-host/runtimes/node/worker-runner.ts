import type { PluginEndpoint } from '../../bridge/ports'
import type { PluginRunner, PluginRunnerExit } from '../../runners/types'
import type { PluginWorkerData } from './worker-entry'

import { pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'

import { createContext } from '@moeru/eventa/adapters/worker-threads'

import { connectHostBridge } from '../../bridge/channel'
import { FileSystemLoader } from './loaders'

/** Options of {@link createWorkerRunner}. */
export interface WorkerRunnerOptions {
  /**
   * The worker entry file. The default is the `worker-entry` file next to this module.
   * Pass the built `worker-entry.mjs` when the Host bundles plugin-sdk.
   */
  workerUrl?: URL
  /** Node flags of each worker, for example `['--import', 'tsx']` to run TypeScript plugins. */
  execArgv?: string[]
}

/** The endpoint calls that are cleanup. After the worker ends, they have nothing to clean, so they resolve. */
const cleanupCalls: ReadonlySet<keyof PluginEndpoint> = new Set<keyof PluginEndpoint>(['abortRound', 'stopRound', 'stopModule', 'dropModule', 'updateKits', 'updateCatalog'])

/**
 * Wraps the endpoint of a worker so that no call waits for a worker that ended.
 * A cleanup call resolves, and any other call rejects with the exit error.
 */
function guardEndpoint(endpoint: PluginEndpoint, ended: () => Error | undefined, onEnd: Promise<Error>): PluginEndpoint {
  return new Proxy(endpoint, {
    get: (target, property) => {
      const member: unknown = Reflect.get(target, property)
      if (typeof property !== 'string' || typeof member !== 'function')
        return member
      const cleanup = cleanupCalls.has(property as keyof PluginEndpoint)
      return (...args: unknown[]) => {
        const error = ended()
        if (error)
          return cleanup ? Promise.resolve(undefined) : Promise.reject(error)
        const ending = onEnd.then(endError => cleanup ? undefined : Promise.reject(endError))
        return Promise.race([Reflect.apply(member, target, args) as Promise<unknown>, ending])
      }
    },
  })
}

function defaultWorkerUrl(): URL {
  // NOTICE:
  // The worker needs a real entry file: `worker-entry.ts` in the source tree, `worker-entry.mjs` in a build.
  // A bundler can move this module into a shared chunk, so this sibling path works only without bundling.
  // Source: packages/plugin-sdk/tsdown.config.ts emits the worker entry separately.
  // Remove this default when `@injeca/bridge` owns the worker entry.
  return new URL(import.meta.url.endsWith('.ts') ? './worker-entry.ts' : './worker-entry.mjs', import.meta.url)
}

/**
 * Creates the runner that runs each plugin in its own `worker_threads` Worker and talks to it over an eventa channel.
 *
 * Use when:
 * - A plugin runs untrusted or heavy code that must not block the Host thread
 * - A Host Kit API is a plain object whose methods take and return structured clone values or functions
 *
 * Expects:
 * - The plugin entrypoint is a file that Node can import with `execArgv`
 *
 * Returns:
 * - A runner whose handle reports the worker exit as a runtime exit
 */
export function createWorkerRunner(options: WorkerRunnerOptions = {}): PluginRunner {
  const loader = new FileSystemLoader()
  return {
    kind: 'worker',
    async open(input) {
      const entrypoint = loader.resolveEntrypointFor(input.manifest, { cwd: input.cwd, runtime: input.runtime })
      const workerData: PluginWorkerData = { entrypoint: pathToFileURL(entrypoint).href }
      const worker = new Worker(options.workerUrl ?? defaultWorkerUrl(), { workerData, execArgv: options.execArgv })
      const { context } = createContext(worker)
      const listeners = new Set<(exit: PluginRunnerExit) => void>()
      let closing = false
      let lastError: unknown
      let endError: Error | undefined
      let markEnded: (error: Error) => void = () => {}
      const onEnd = new Promise<Error>((resolveEnd) => {
        markEnded = resolveEnd
      })
      const end = (error: Error) => {
        endError ??= error
        markEnded(endError)
      }
      const endpoint = guardEndpoint(connectHostBridge(context, input.host), () => endError, onEnd)
      worker.on('error', (error) => {
        lastError = error
      })
      worker.on('exit', (code) => {
        end(new Error(`The plugin worker of \`${input.manifest.id}\` exited with code ${code}.`, { cause: lastError }))
        if (closing)
          return
        for (const listener of [...listeners])
          listener({ code, error: lastError })
      })
      return {
        endpoint,
        passesValues: false,
        onExit: (listener) => {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
        close: async () => {
          closing = true
          end(new Error(`The plugin worker of \`${input.manifest.id}\` is closed.`))
          await worker.terminate()
        },
      }
    },
  }
}

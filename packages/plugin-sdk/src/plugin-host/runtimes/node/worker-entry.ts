import { workerData } from 'node:worker_threads'

import { createContext } from '@moeru/eventa/adapters/worker-threads/worker'

import { connectPluginBridge } from '../../bridge/channel'
import { PluginRuntime } from '../../bridge/plugin-runtime'
import { coerceExtensionFromModule } from './loaders/fs'

/** The data that the worker runner passes to each plugin worker. */
export interface PluginWorkerData {
  /** The file URL of the plugin entrypoint. */
  entrypoint: string
}

const { entrypoint } = workerData as PluginWorkerData
const { context } = createContext()
let loaded: Promise<ReturnType<typeof coerceExtensionFromModule>> | undefined

connectPluginBridge(context, host => new PluginRuntime(() => {
  loaded ??= import(entrypoint).then(coerceExtensionFromModule)
  return loaded
}, host))

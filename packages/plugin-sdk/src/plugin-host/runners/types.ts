import type { Extension } from '../../extension/shared'
import type { HostPort, PluginEndpoint } from '../bridge/ports'
import type { ExtensionManifestV2, PluginRuntime } from '../shared/types'

/** The input of one plugin runtime start. */
export interface PluginRunnerOpenInput {
  readonly manifest: ExtensionManifestV2
  readonly cwd?: string
  readonly runtime: PluginRuntime
  /** A loaded Extension. Only the direct runner accepts it. */
  readonly extension?: Extension
  /** The Host side of the session. */
  readonly host: HostPort
}

/** How a plugin runtime ended. */
export interface PluginRunnerExit {
  readonly code?: number
  readonly error?: unknown
}

/** One running plugin runtime: a worker, or a runtime in the Host thread. */
export interface PluginRunnerHandle {
  /** The plugin side of the session. */
  readonly endpoint: PluginEndpoint
  /** `true` when the plugin runs in the Host thread, so the Host can pass client objects. */
  readonly passesValues: boolean
  /** Calls `listener` when the runtime ends without `close()`, for example when a worker exits. */
  readonly onExit: (listener: (exit: PluginRunnerExit) => void) => () => void
  /** Ends the runtime. */
  readonly close: () => Promise<void>
}

/** Starts plugin runtimes. The `runtime` node of each plugin container uses it. */
export interface PluginRunner {
  readonly kind: string
  readonly open: (input: PluginRunnerOpenInput) => Promise<PluginRunnerHandle>
}

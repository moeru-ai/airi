import type { StageToolRegistry } from '@proj-airi/plugin-sdk-stage/tools'
import type { ExtensionHost } from '@proj-airi/plugin-sdk/plugin-host'

import type { SetupExtensionHostOptions } from '../types'

import { installStageHostKits } from '@proj-airi/plugin-sdk-stage/host'

import { createGameletOrchestrationRuntime } from './gamelet/orchestration'
import { registerWidgetPluginKit } from './widget'

/**
 * Creates the built-in kits installed by the Electron extension host.
 *
 * The shared stage package owns gamelet binding and model-tool registration.
 * This module only supplies the Electron widget implementation.
 */
export function createBuiltInExtensionKitRuntime(options: SetupExtensionHostOptions): {
  registerHostKits: (host: ExtensionHost) => void
  tools: StageToolRegistry
  dispose: () => void
} {
  const gamelets = createGameletOrchestrationRuntime(options.widgetsManager)
  let tools: StageToolRegistry | undefined

  return {
    registerHostKits(host) {
      registerWidgetPluginKit(host)
      tools = installStageHostKits({ host, gamelets })
    },
    get tools() {
      if (!tools) {
        throw new Error('Extension host kits must be registered before tools are read.')
      }
      return tools
    },
    dispose() {
      gamelets.dispose()
      tools?.clear()
    },
  }
}

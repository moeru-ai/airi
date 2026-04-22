import type { PluginHost } from '@proj-airi/plugin-sdk/plugin-host'

import type { SetupPluginHostOptions } from '../types'

import {
  createGameletHostContribution,
  registerGameletPluginKit,
} from './gamelet'
import { registerWidgetPluginKit } from './widget'

/**
 * Creates the built-in kit runtime installed by the Electron plugin host.
 *
 * Use when:
 * - Host bootstrap should depend on a kit-layer API instead of wiring widget/gamelet details inline
 * - Built-in kit registration and contributions should remain outside the host layer
 *
 * Expects:
 * - `widgetsManager` is initialized before host construction
 *
 * Returns:
 * - Helpers to attach contributions and register built-in kits on the host
 */
export function createBuiltInPluginKitRuntime(options: SetupPluginHostOptions): {
  contributions: ReturnType<typeof createGameletHostContribution>['contribution'][]
  attachHost: (host: PluginHost) => void
  registerHostKits: (host: PluginHost) => void
} {
  const gameletContribution = createGameletHostContribution({
    widgetsManager: options.widgetsManager,
  })

  return {
    contributions: [gameletContribution.contribution],
    attachHost(host) {
      gameletContribution.attachHost(host)
    },
    registerHostKits(host) {
      registerWidgetPluginKit(host)
      registerGameletPluginKit(host)
    },
  }
}

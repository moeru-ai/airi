import type { KitRef } from '@proj-airi/plugin-sdk'
import type { ExtensionHost } from '@proj-airi/plugin-sdk/plugin-host'

import type { SetupExtensionHostOptions } from '../types'

import { gameletKit, toolKit } from '@proj-airi/plugin-sdk-tamagotchi'

import {
  createGameletHostContribution,
  registerGameletPluginKit,
} from './gamelet'
import { registerWidgetPluginKit } from './widget'

type GameletKitClient = ReturnType<typeof gameletKit.createClient>
type ToolKitClient = ReturnType<typeof toolKit.createClient>

function createHostGameletKit(host: ExtensionHost): KitRef<GameletKitClient> {
  return {
    ...gameletKit,
    createClient(runtime) {
      const hostRuntime = {
        ...runtime,
        bindings: {
          bind: (input: Parameters<ExtensionHost['bindExtensionKitModule']>[1]) => host.bindExtensionKitModule(runtime.sessionId, input, runtime.moduleId),
        },
      }

      return gameletKit.createClient(hostRuntime)
    },
  }
}

function createHostToolKit(host: ExtensionHost): KitRef<ToolKitClient> {
  return {
    ...toolKit,
    createClient(runtime) {
      const hostRuntime = {
        ...runtime,
        tools: {
          register: (input: Parameters<ExtensionHost['registerExtensionTool']>[1]) => host.registerExtensionTool(runtime.sessionId, input, runtime.moduleId),
          registerToolsetPrompt: (input: Parameters<ExtensionHost['registerExtensionToolsetPrompt']>[1]) => host.registerExtensionToolsetPrompt(runtime.sessionId, input, runtime.moduleId),
        },
      }

      return toolKit.createClient(hostRuntime)
    },
  }
}

/**
 * Creates the built-in kit runtime installed by the Electron extension host.
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
export function createBuiltInExtensionKitRuntime(options: SetupExtensionHostOptions): {
  contributions: ReturnType<typeof createGameletHostContribution>['contribution'][]
  attachHost: (host: ExtensionHost) => void
  registerHostKits: (host: ExtensionHost) => void
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
      host.registerKitApi(createHostGameletKit(host))
      host.registerKitApi(createHostToolKit(host))
    },
  }
}

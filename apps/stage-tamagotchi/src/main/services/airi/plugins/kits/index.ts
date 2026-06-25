import type { KitRef } from '@proj-airi/plugin-sdk'
import type { ToolKitRuntime } from '@proj-airi/plugin-sdk-tamagotchi/tools'
import type { ExtensionHost } from '@proj-airi/plugin-sdk/plugin-host'

import type { SetupExtensionHostOptions } from '../types'
import type { GameletOrchestrationRuntime } from './gamelet/orchestration'

import { gameletKit, toolKit } from '@proj-airi/plugin-sdk-tamagotchi'
import { TamagotchiToolRegistry } from '@proj-airi/plugin-sdk-tamagotchi/tools'

import { registerGameletPluginKit } from './gamelet'
import { createGameletOrchestrationRuntime } from './gamelet/orchestration'
import { registerWidgetPluginKit } from './widget'

type GameletKitClient = ReturnType<typeof gameletKit.createClient>
type ToolKitClient = ReturnType<typeof toolKit.createClient>

function createHostGameletKit(options: { host: ExtensionHost, gamelets: GameletOrchestrationRuntime }): KitRef<GameletKitClient> {
  return {
    ...gameletKit,
    createClient(runtime) {
      const hostRuntime = {
        ...runtime,
        bindings: {
          bind: (input: Parameters<ExtensionHost['bindExtensionKitModule']>[1]) => options.host.bindExtensionKitModule(runtime.sessionId, input, runtime.moduleId),
        },
        gamelets: options.gamelets,
      }

      return gameletKit.createClient(hostRuntime)
    },
  }
}

function createHostToolKit(options: { tools: TamagotchiToolRegistry }): KitRef<ToolKitClient> {
  return {
    ...toolKit,
    createClient(runtime) {
      let cleanupRegistered = false
      const ensureCleanup = () => {
        if (cleanupRegistered) {
          return
        }

        cleanupRegistered = true
        runtime.subscriptions.add({
          dispose: () => {
            options.tools.unregisterOwnerScope(runtime.sessionId, runtime.moduleId)
          },
        })
      }

      const hostRuntime: ToolKitRuntime = {
        ...runtime,
        tools: {
          register: (input) => {
            ensureCleanup()
            options.tools.register({
              ownerSessionId: runtime.sessionId,
              ownerExtensionId: runtime.extensionId,
              ownerModuleId: runtime.moduleId,
              ...input,
            })
          },
          registerToolsetPrompt: (input) => {
            ensureCleanup()
            options.tools.registerToolsetPrompt({
              ownerSessionId: runtime.sessionId,
              ownerExtensionId: runtime.extensionId,
              ownerModuleId: runtime.moduleId,
              toolset: input,
            })
          },
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
 * - Built-in kit registration should remain outside the host layer
 *
 * Expects:
 * - `widgetsManager` is initialized before host construction
 *
 * Returns:
 * - Helpers to register built-in kits on the host
 */
export function createBuiltInExtensionKitRuntime(options: SetupExtensionHostOptions): {
  registerHostKits: (host: ExtensionHost) => void
  tools: TamagotchiToolRegistry
  dispose: () => void
} {
  const gamelets = createGameletOrchestrationRuntime(options.widgetsManager)
  const tools = new TamagotchiToolRegistry()

  return {
    registerHostKits(host) {
      registerWidgetPluginKit(host)
      registerGameletPluginKit(host)
      host.registerKitApi(createHostGameletKit({ host, gamelets }))
      host.registerKitApi(createHostToolKit({ tools }))
    },
    tools,
    dispose() {
      gamelets.dispose()
      tools.clear()
    },
  }
}

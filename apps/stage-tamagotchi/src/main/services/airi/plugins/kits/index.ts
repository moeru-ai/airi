import type { KitRef } from '@proj-airi/plugin-sdk'
import type { ToolKitRuntime } from '@proj-airi/plugin-sdk-tamagotchi/tools'
import type { ExtensionHost, HostSourceLease } from '@proj-airi/plugin-sdk/plugin-host'

import type { ExtensionHostGameletWidgetsManager, SetupExtensionHostOptions } from '../types'
import type { GameletOrchestrationRuntime } from './gamelet/orchestration'

import { gameletKit, toolKit } from '@proj-airi/plugin-sdk-tamagotchi'

import { gameletPluginKitDescriptor } from './gamelet'
import { createGameletOrchestrationRuntime } from './gamelet/orchestration'
import { TamagotchiToolRegistry } from './tool/registry'
import { widgetPluginKitDescriptor } from './widget'

type GameletKitClient = ReturnType<typeof gameletKit.createClient>
type ToolKitClient = ReturnType<typeof toolKit.createClient>

function createHostGameletKit(options: { host: ExtensionHost, gamelets: GameletOrchestrationRuntime }): KitRef<GameletKitClient> {
  return {
    ...gameletKit,
    createClient: (runtime) => {
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
    createClient: (runtime) => {
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

function disposeHostKitLeases(leases: readonly HostSourceLease[]): void {
  // Later registrations can depend on earlier registrations. Reverse order removes dependent sources first.
  for (const lease of [...leases].reverse()) {
    lease.dispose()
  }
}

/**
 * Registers the built-in Kits on one Extension Host.
 *
 * Use when:
 * - The `modules:extension-host:built-in-kits` unit builds. Its `stop` hook calls `dispose`.
 *
 * Expects:
 * - `widgetsManager` is initialized before the Kits are registered
 *
 * Returns:
 * - The tool registry and `dispose`
 */
export function createBuiltInExtensionKits(options: {
  host: ExtensionHost
  widgetsManager: ExtensionHostGameletWidgetsManager
}): SetupExtensionHostOptions['kits'] & { dispose: () => void } {
  const { host } = options
  const gamelets = createGameletOrchestrationRuntime(options.widgetsManager)
  const tools = new TamagotchiToolRegistry()
  const toolKitRef = createHostToolKit({ tools })
  const hostSources: ReadonlyArray<() => HostSourceLease> = [
    () => host.registerKit(widgetPluginKitDescriptor),
    () => host.registerKit(gameletPluginKitDescriptor),
    () => host.registerKitApi(createHostGameletKit({ host, gamelets })),
    () => host.registerKitApi(toolKitRef),
  ]

  const leases: HostSourceLease[] = []
  try {
    for (const register of hostSources) {
      leases.push(register())
    }
  }
  catch (error) {
    disposeHostKitLeases(leases)
    throw error
  }

  return {
    tools,
    dispose() {
      // Remove registrations first. Consumers cannot acquire a Client after its runtime is disposed.
      disposeHostKitLeases(leases)
      gamelets.dispose()
      tools.clear()
    },
  }
}

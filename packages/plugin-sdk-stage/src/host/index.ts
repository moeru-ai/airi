import type { KitRef } from '@proj-airi/plugin-sdk'
import type { ExtensionHost, KitDescriptor } from '@proj-airi/plugin-sdk/plugin-host'

import type { GameletKitRuntime } from '../gamelet'
import type { ToolKitRuntime } from '../tools'

import { gameletKit } from '../gamelet'
import { StageToolRegistry, toolKit } from '../tools'

type GameletKitClient = ReturnType<typeof gameletKit.createClient>
type ToolKitClient = ReturnType<typeof toolKit.createClient>

/** The host descriptor shared by all stage gamelet implementations. */
export const stageGameletKitDescriptor = {
  kitId: 'kit.gamelet',
  version: '1.0.0',
  runtimes: ['electron', 'web'],
  capabilities: [
    { key: 'kit.gamelet.runtime', actions: ['announce', 'activate', 'update', 'withdraw', 'publish', 'subscribe'] },
  ],
} satisfies KitDescriptor

/** Platform-owned gamelet lifecycle operations. */
export interface StageGameletOrchestration extends NonNullable<GameletKitRuntime['gamelets']> {
  dispose?: () => void
}

function createGameletHostKit(input: { host: ExtensionHost, gamelets: StageGameletOrchestration }): KitRef<GameletKitClient> {
  return {
    ...gameletKit,
    createClient(runtime) {
      const gameletRuntime: GameletKitRuntime = {
        ...runtime,
        bindings: {
          bind: definition => input.host.bindExtensionKitModule(runtime.sessionId, definition, runtime.moduleId),
        },
        gamelets: input.gamelets,
      }
      return gameletKit.createClient(gameletRuntime)
    },
  }
}

function createToolHostKit(input: { tools: StageToolRegistry }): KitRef<ToolKitClient> {
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
          dispose: () => input.tools.unregisterOwnerScope(runtime.sessionId, runtime.moduleId),
        })
      }

      const toolRuntime: ToolKitRuntime = {
        ...runtime,
        tools: {
          register: (definition) => {
            ensureCleanup()
            input.tools.register({
              ownerSessionId: runtime.sessionId,
              ownerExtensionId: runtime.extensionId,
              ownerModuleId: runtime.moduleId,
              ...definition,
            })
          },
          registerToolsetPrompt: (definition) => {
            ensureCleanup()
            input.tools.registerToolsetPrompt({
              ownerSessionId: runtime.sessionId,
              ownerExtensionId: runtime.extensionId,
              ownerModuleId: runtime.moduleId,
              ...definition,
            })
          },
        },
      }
      return toolKit.createClient(toolRuntime)
    },
  }
}

/**
 * Installs the gamelet and tool kits that every AIRI stage shares.
 *
 * The caller owns platform rendering through `gamelets`. This function owns
 * extension binding attribution and removes registered tools during unload.
 */
export function installStageHostKits(input: {
  host: ExtensionHost
  gamelets: StageGameletOrchestration
  tools?: StageToolRegistry
}) {
  const tools = input.tools ?? new StageToolRegistry()
  input.host.registerKit(stageGameletKitDescriptor)
  input.host.registerKitApi(createGameletHostKit({ host: input.host, gamelets: input.gamelets }))
  input.host.registerKitApi(createToolHostKit({ tools }))
  return tools
}

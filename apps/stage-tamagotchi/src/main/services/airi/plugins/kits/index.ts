import type { KitRef } from '@proj-airi/plugin-sdk'
import type { ToolKitRuntime } from '@proj-airi/plugin-sdk-tamagotchi/tools'
import type { ExtensionHost, HostProvidedKitDeclaration, HostSourceLease, KitDescriptor } from '@proj-airi/plugin-sdk/plugin-host'

import type { SetupExtensionHostOptions } from '../types'
import type { GameletOrchestrationRuntime } from './gamelet/orchestration'

import { gameletKit, toolKit } from '@proj-airi/plugin-sdk-tamagotchi'
import { TamagotchiToolRegistry } from '@proj-airi/plugin-sdk-tamagotchi/tools'

import { gameletPluginKitDescriptor } from './gamelet'
import { createGameletOrchestrationRuntime } from './gamelet/orchestration'
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

type HostKitDeclarationSource
  = | Pick<KitDescriptor, 'kitId' | 'version'>
    | Pick<KitRef<unknown>, 'id' | 'version'>

interface BuiltInHostSource {
  readonly declaration: HostKitDeclarationSource
  readonly register: (host: ExtensionHost) => HostSourceLease
}

type BuiltInKitRuntimeState
  = | { readonly phase: 'created' }
    | {
      readonly phase: 'installed'
      readonly host: ExtensionHost
      readonly leases: readonly HostSourceLease[]
    }
    | { readonly phase: 'disposed' }

function disposeHostKitLeases(leases: readonly HostSourceLease[]): void {
  // Later registrations can depend on earlier registrations. Reverse order removes dependent sources first.
  for (const lease of [...leases].reverse()) {
    lease.dispose()
  }
}

/**
 * Collects stable Host Kit declarations from descriptors and runtime Kit references.
 *
 * The function merges matching declarations. It throws when one Kit ID has
 * different versions because the Planner cannot select one Host contract.
 *
 * @example
 * collectHostProvidedKitDeclarations([
 *   { kitId: 'kit.gamelet', version: '1.0.0' },
 *   { id: 'kit.gamelet', version: '1.0.0' },
 * ])
 * // => [{ id: 'kit.gamelet', version: '1.0.0' }]
 */
function collectHostProvidedKitDeclarations(
  sources: readonly HostKitDeclarationSource[],
): HostProvidedKitDeclaration[] {
  const versionByKitId = new Map<string, string>()
  for (const source of sources) {
    const id = 'id' in source ? source.id : source.kitId
    const currentVersion = versionByKitId.get(id)
    if (currentVersion && currentVersion !== source.version) {
      throw new Error(`Host Kit "${id}" has conflicting versions ${currentVersion} and ${source.version}.`)
    }
    versionByKitId.set(id, source.version)
  }

  return [...versionByKitId]
    .map(([id, version]) => ({ id, version }))
    .sort((left, right) => left.id.localeCompare(right.id))
}

/**
 * Creates the built-in kit runtime installed by the Electron extension host.
 *
 * Use when:
 * - Host bootstrap uses a Kit-layer interface instead of inline widget or gamelet details
 * - Built-in Kit registration stays outside the Host layer
 *
 * Expects:
 * - `widgetsManager` is initialized before host construction
 *
 * Returns:
 * - Helpers to register built-in kits on the host
 */
export function createBuiltInExtensionKitRuntime(options: SetupExtensionHostOptions): {
  registerHostKits: (host: ExtensionHost) => void
  hostProvidedKits: readonly HostProvidedKitDeclaration[]
  tools: TamagotchiToolRegistry
  dispose: () => void
} {
  const gamelets = createGameletOrchestrationRuntime(options.widgetsManager)
  const tools = new TamagotchiToolRegistry()
  const toolKitRef = createHostToolKit({ tools })
  let state: BuiltInKitRuntimeState = { phase: 'created' }
  const hostSources: readonly BuiltInHostSource[] = [
    {
      declaration: widgetPluginKitDescriptor,
      register: host => host.registerKit(widgetPluginKitDescriptor),
    },
    {
      declaration: gameletPluginKitDescriptor,
      register: host => host.registerKit(gameletPluginKitDescriptor),
    },
    {
      declaration: gameletKit,
      register: host => host.registerKitApi(createHostGameletKit({ host, gamelets })),
    },
    {
      declaration: toolKitRef,
      register: host => host.registerKitApi(toolKitRef),
    },
  ]
  const hostProvidedKits = collectHostProvidedKitDeclarations(hostSources.map(source => source.declaration))

  return {
    registerHostKits(host) {
      if (state.phase === 'disposed') {
        throw new Error('The built-in Kit runtime is disposed.')
      }
      if (state.phase === 'installed') {
        if (state.host !== host) {
          throw new Error('The built-in Kit runtime is installed on another Extension Host.')
        }
        return
      }
      const acceptedLeases: HostSourceLease[] = []
      try {
        for (const source of hostSources) {
          acceptedLeases.push(source.register(host))
        }
        state = {
          phase: 'installed',
          host,
          leases: Object.freeze([...acceptedLeases]),
        }
      }
      catch (error) {
        disposeHostKitLeases(acceptedLeases)
        throw error
      }
    },
    hostProvidedKits,
    tools,
    dispose() {
      if (state.phase === 'disposed') {
        return
      }
      const installed = state.phase === 'installed' ? state : undefined
      state = { phase: 'disposed' }
      if (installed) {
        // Remove registrations first. Consumers cannot acquire a Client after its runtime is disposed.
        disposeHostKitLeases(installed.leases)
      }
      gamelets.dispose()
      tools.clear()
    },
  }
}

import type { KitRef } from '@proj-airi/plugin-sdk'
import type { ToolKitRuntime } from '@proj-airi/plugin-sdk-tamagotchi/tools'
import type { ExtensionHost, KitRegistration } from '@proj-airi/plugin-sdk/plugin-host'

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

type BuiltInKitRuntimeState
  = | { readonly phase: 'created' }
    | {
      readonly phase: 'installed'
      readonly host: ExtensionHost
      readonly registrations: readonly KitRegistration[]
    }
    | { readonly phase: 'disposed' }

async function withdrawHostKits(registrations: readonly KitRegistration[]): Promise<void> {
  const errors: unknown[] = []
  // Later registrations can depend on earlier registrations. Reverse order removes dependent Kits first.
  for (const registration of [...registrations].reverse()) {
    try {
      await registration.withdraw()
    }
    catch (error) {
      errors.push(error)
    }
  }
  if (errors.length === 1)
    throw errors[0]
  if (errors.length > 1)
    throw new AggregateError(errors, 'Built-in Kit withdrawal failed.')
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
  tools: TamagotchiToolRegistry
  dispose: () => Promise<void>
} {
  const gamelets = createGameletOrchestrationRuntime(options.widgetsManager)
  const tools = new TamagotchiToolRegistry()
  const toolKitRef = createHostToolKit({ tools })
  let state: BuiltInKitRuntimeState = { phase: 'created' }
  // Each Kit registers its descriptor and its API in one call, so one registration owns both.
  const hostKits: readonly ((host: ExtensionHost) => KitRegistration)[] = [
    host => host.provideKit({ descriptor: widgetPluginKitDescriptor }),
    host => host.provideKit({ descriptor: gameletPluginKitDescriptor, api: createHostGameletKit({ host, gamelets }) }),
    host => host.provideKit({ api: toolKitRef }),
  ]

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
      const accepted: KitRegistration[] = []
      try {
        for (const provideKit of hostKits) {
          accepted.push(provideKit(host))
        }
        state = {
          phase: 'installed',
          host,
          registrations: Object.freeze([...accepted]),
        }
      }
      catch (error) {
        void withdrawHostKits(accepted).catch(() => undefined)
        throw error
      }
    },
    tools,
    async dispose() {
      if (state.phase === 'disposed') {
        return
      }
      const installed = state.phase === 'installed' ? state : undefined
      state = { phase: 'disposed' }
      try {
        if (installed) {
          // Remove registrations first. Consumers cannot acquire a Client after its runtime is disposed.
          await withdrawHostKits(installed.registrations)
        }
      }
      finally {
        gamelets.dispose()
        tools.clear()
      }
    },
  }
}

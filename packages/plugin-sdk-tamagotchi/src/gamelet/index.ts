import type { KitClientRuntime } from '@proj-airi/plugin-sdk'
import type { HostDataRecord } from '@proj-airi/plugin-sdk/plugin-host'

import { defineKit } from '@proj-airi/plugin-sdk'

export * from './events'

export interface GameletKitClient {
  iframe: (input: { assetPath?: string, src?: string, sandbox?: string }) => HostDataRecord
  mount: (definition: {
    /** Fully qualified host binding id used as the host-side module id. */
    bindingId?: string
    title: string
    ui: HostDataRecord
    init?: HostDataRecord
  }) => Promise<unknown>
  orchestration?: GameletKitRuntime['gamelets']
}

export interface GameletKitRuntime extends KitClientRuntime {
  bindings?: {
    bind: (input: {
      moduleId: string
      kitId: string
      kitModuleType: string
      runtime?: string
      config: HostDataRecord
    }) => Promise<unknown> | unknown
  }
  gamelets?: {
    open: (bindingId: string, payload?: HostDataRecord) => Promise<void> | void
    configure: (bindingId: string, payload: HostDataRecord) => Promise<void> | void
    request: <TResponse = HostDataRecord>(
      bindingId: string,
      payload: HostDataRecord,
      options?: { timeoutMs?: number },
    ) => Promise<TResponse> | TResponse
    close: (bindingId: string) => Promise<void> | void
    isOpen: (bindingId: string) => Promise<boolean> | boolean
  }
}

/**
 * Derives the host binding id used by the gamelet kit client.
 *
 * Before:
 * - `{ sessionId: "session-1", moduleId: undefined }`
 *
 * After:
 * - `"session-1:gamelet"`
 */
function createGameletBindingId(runtime: KitClientRuntime): string {
  return `${runtime.moduleId ?? runtime.sessionId}:gamelet`
}

export const gameletKit = defineKit<GameletKitClient>({
  id: 'kit.gamelet',
  version: '1.0.0',
  allowedExposePolicies: ['local-only', 'remote-observable'],
  defaultExposePolicy: 'local-only',
  createClient(runtime) {
    const gameletRuntime = runtime as GameletKitRuntime
    return {
      iframe(input) {
        return {
          mount: 'iframe',
          iframe: {
            ...input,
            sandbox: input.sandbox ?? 'allow-scripts allow-same-origin allow-forms allow-popups',
          },
        }
      },
      async mount(definition) {
        if (!gameletRuntime.bindings) {
          throw new Error('gameletKit requires a host binding runtime.')
        }

        return await gameletRuntime.bindings.bind({
          moduleId: definition.bindingId ?? createGameletBindingId(runtime),
          kitId: 'kit.gamelet',
          kitModuleType: 'gamelet',
          config: {
            title: definition.title,
            widget: definition.ui,
            config: {
              init: definition.init ?? {},
            },
          },
        })
      },
      orchestration: gameletRuntime.gamelets,
    }
  },
})

import type { KitClientRuntime } from '@proj-airi/plugin-sdk'
import type { HostDataRecord } from '@proj-airi/plugin-sdk/plugin-host'

import { defineKit } from '@proj-airi/plugin-sdk'

export * from './events'

export interface GameletKitClient {
  iframe: (input: { assetPath?: string, sandbox?: string, src?: string }) => HostDataRecord
  mount: (definition: {
    /** Fully qualified host binding id used as the host-side module id. */
    bindingId?: string
    init?: HostDataRecord
    title: string
    ui: HostDataRecord
  }) => Promise<unknown>
  orchestration?: GameletKitRuntime['gamelets']
}

export interface GameletKitRuntime extends KitClientRuntime {
  bindings?: {
    bind: (input: {
      config: HostDataRecord
      kitId: string
      kitModuleType: string
      moduleId: string
      runtime?: string
    }) => Promise<unknown> | unknown
  }
  gamelets?: {
    close: (bindingId: string) => Promise<void> | void
    configure: (bindingId: string, payload: HostDataRecord) => Promise<void> | void
    isOpen: (bindingId: string) => boolean | Promise<boolean>
    open: (bindingId: string, payload?: HostDataRecord) => Promise<void> | void
    request: <TResponse = HostDataRecord>(
      bindingId: string,
      payload: HostDataRecord,
      options?: { timeoutMs?: number },
    ) => Promise<TResponse> | TResponse
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
  allowedExposePolicies: ['local-only', 'remote-observable'],
  createClient(runtime) {
    const gameletRuntime = runtime as GameletKitRuntime
    return {
      iframe(input) {
        return {
          iframe: {
            ...input,
            sandbox: input.sandbox ?? 'allow-scripts allow-same-origin allow-forms allow-popups',
          },
          mount: 'iframe',
        }
      },
      async mount(definition) {
        if (!gameletRuntime.bindings) {
          throw new Error('gameletKit requires a host binding runtime.')
        }

        return await gameletRuntime.bindings.bind({
          config: {
            config: {
              init: definition.init ?? {},
            },
            title: definition.title,
            widget: definition.ui,
          },
          kitId: 'kit.gamelet',
          kitModuleType: 'gamelet',
          moduleId: definition.bindingId ?? createGameletBindingId(runtime),
        })
      },
      orchestration: gameletRuntime.gamelets,
    }
  },
  defaultExposePolicy: 'local-only',
  id: 'kit.gamelet',
  version: '1.0.0',
})

import type { KitClientRuntime } from '@proj-airi/plugin-sdk'
import type { HostDataRecord } from '@proj-airi/plugin-sdk/plugin-host'

import { defineKit } from '@proj-airi/plugin-sdk'

export * from './controller'
export * from './events'

/** Client methods exposed by the platform-neutral gamelet kit. */
export interface GameletKitClient {
  iframe: (input: { assetPath?: string, src?: string, sandbox?: string }) => HostDataRecord
  mount: (definition: {
    bindingId?: string
    title: string
    ui: HostDataRecord
    init?: HostDataRecord
  }) => Promise<unknown>
  orchestration?: GameletKitRuntime['gamelets']
}

/** Host runtime services required by {@link gameletKit}. */
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
    request: <TResponse = HostDataRecord>(bindingId: string, payload: HostDataRecord, options?: { timeoutMs?: number }) => Promise<TResponse> | TResponse
    close: (bindingId: string) => Promise<void> | void
    isOpen: (bindingId: string) => Promise<boolean> | boolean
  }
}

function createBindingId(runtime: KitClientRuntime): string {
  return `${runtime.moduleId ?? runtime.sessionId}:gamelet`
}

/** The gamelet kit shared by every AIRI stage host. */
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
          moduleId: definition.bindingId ?? createBindingId(runtime),
          kitId: 'kit.gamelet',
          kitModuleType: 'gamelet',
          config: {
            title: definition.title,
            widget: definition.ui,
            config: { init: definition.init ?? {} },
          },
        })
      },
      orchestration: gameletRuntime.gamelets,
    }
  },
})

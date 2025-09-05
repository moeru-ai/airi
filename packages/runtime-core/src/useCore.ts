import type { AiriPlugin, CoreClient, MessageChannel, ModelProvider } from '@proj-airi/core'
import type { InjectionKey } from 'vue'

import { ConfigService, createCoreClient } from '@proj-airi/core'
import { inject, shallowRef } from 'vue'

import { LocalStorageBackend } from './backends/local-storage'

const KEY: InjectionKey<{
  init: () => Promise<CoreClient>
}> = Symbol('@proj-airi/core')

interface CreateOpts {
  key?: string // localStorage key
  providers?: Record<string, ModelProvider>
  channel?: MessageChannel
  plugins?: AiriPlugin[]
}

export function createCore(opts: CreateOpts = {}) {
  const coreRef = shallowRef<CoreClient | null>(null)

  async function init() {
    if (coreRef.value)
      return coreRef.value
    const core = await createCoreClient({
      config: new ConfigService(new LocalStorageBackend(opts.key ?? 'airi.runtime')),
      providers: opts.providers,
      channel: opts.channel,
      plugins: opts.plugins,
    }).init()
    coreRef.value = core
    return core
  }

  // keep Vue plugin signature; mark `app` as used so TS noUnusedParameters
  // function install(app: App) { provide(KEY, { init, coreRef }) }

  return { init, coreRef }
}

export async function useCore() {
  const bag = inject(KEY)
  if (bag)
    return bag.init()

  const { init } = createCore()
  return init()
}

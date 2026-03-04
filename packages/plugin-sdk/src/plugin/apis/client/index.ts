import type { EventContext } from '@moeru/eventa'

import { createProviders } from './resources'

export function createApis(ctx: EventContext<any, any>) {
  return {
    providers: createProviders(ctx),
  }
}

export type PluginApis = ReturnType<typeof createApis>
export * from './resources'

import type { EventContext } from '@moeru/eventa'

import { createProviders, createResources } from './resources'

export function createApis(ctx: EventContext<any, any>) {
  return {
    providers: createProviders(ctx),
    resources: createResources(ctx),
  }
}

export type PluginApis = ReturnType<typeof createApis>
export * from './resources'

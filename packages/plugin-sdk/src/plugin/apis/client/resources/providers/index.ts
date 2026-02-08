import type { EventContext } from '@moeru/eventa'

import { defineInvoke } from '@moeru/eventa'

import { protocolListProviders } from '../../../protocol/resources/providers'

export function createProviders(ctx: EventContext<any, any>) {
  return {
    listProviders() {
      const func = defineInvoke(ctx, protocolListProviders)
      return func()
    },
  }
}

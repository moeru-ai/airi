import type { EventContext } from '@moeru/eventa'

import { defineInvoke } from '@moeru/eventa'

import { protocolCapabilityWait } from '../../../protocol/capabilities'
import { protocolListProviders, protocolListProvidersEventName } from '../../../protocol/resources/providers'

export function createProviders(ctx: EventContext<any, any>) {
  return {
    async listProviders() {
      const waitForCapability = defineInvoke(ctx, protocolCapabilityWait)
      await waitForCapability({
        key: protocolListProvidersEventName,
      })

      const func = defineInvoke(ctx, protocolListProviders)
      return await func()
    },
  }
}

import type { EventContext } from '@moeru/eventa'

import { defineInvoke } from '@moeru/eventa'

import { protocolCapabilityWait } from '../../../protocol/capabilities'
import { protocolResourceList, protocolResourceListEventName } from '../../../protocol/resources'

export function createProviders(ctx: EventContext<any, any>) {
  return {
    async listProviders() {
      const waitForCapability = defineInvoke(ctx, protocolCapabilityWait)
      await waitForCapability({
        key: protocolResourceListEventName,
      })

      const listResources = defineInvoke(ctx, protocolResourceList)
      const resources = await listResources({ kind: 'ai.provider', phase: 'Ready' })

      return resources.map((resource) => {
        const name = typeof resource.metadata?.name === 'string'
          ? resource.metadata.name
          : resource.id

        return { name }
      })
    },
  }
}

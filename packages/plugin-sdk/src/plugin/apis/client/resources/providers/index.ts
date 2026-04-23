import type { EventContext } from '@moeru/eventa'

import { defineInvoke } from '@moeru/eventa'

import { protocolCapabilityWait } from '../../../protocol/capabilities'
import { protocolListProviders, protocolListProvidersEventName } from '../../../protocol/resources/providers'

/**
 * Creates the provider resource client used by plugins to query available providers.
 *
 * Use when:
 * - A plugin needs to read the current provider list from the host
 *
 * Expects:
 * - The host exposes the providers capability and corresponding list RPC
 *
 * Returns:
 * - A client with `listProviders()` that waits for capability readiness before invoking
 */
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

import type { EventContext } from '@moeru/eventa'

import { createProviders } from './providers'

/**
 * Creates the low-level resource API groups exposed on `session.apis`.
 *
 * Use when:
 * - Building the plugin SDK API object for a specific session
 *
 * Expects:
 * - `ctx` is the Eventa context for the current plugin session
 *
 * Returns:
 * - The resource client groups currently supported by the SDK
 */
export function createResources(ctx: EventContext<any, any>) {
  return {
    providers: createProviders(ctx),
  }
}

export { createProviders } from './providers'

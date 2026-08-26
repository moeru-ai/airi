import type { DeliveryConfig, WebSocketEvent } from '@proj-airi/server-shared/types'

import type { RouteContext, RouteDecision, RouteMiddleware } from '../../middlewares'

import { getProtocolEventMetadata } from '@proj-airi/server-shared/types'

/**
 * Iterates event middlewares in declaration order until one returns a decision.
 *
 * Use when:
 * - The websocket runtime needs the first route decision from configured middleware
 *
 * Expects:
 * - Middleware functions are ordered by caller policy
 *
 * Returns:
 * - The first route decision, or `undefined` when no middleware decided
 */
export function forEachEventMiddlewares(input: {
  destinations?: RouteContext['destinations']
  event: WebSocketEvent
  fromPeer: RouteContext['fromPeer']
  middleware: RouteMiddleware[]
  peers: Map<string, RouteContext['fromPeer']>
}): RouteDecision | undefined {
  const context: RouteContext = {
    destinations: input.destinations,
    event: input.event,
    fromPeer: input.fromPeer,
    peers: input.peers,
  }

  for (const middleware of input.middleware) {
    const result = middleware(context)
    if (result) {
      return result
    }
  }
}

/**
 * Resolves the effective event delivery policy.
 *
 * Use when:
 * - Protocol defaults should be merged with route-level delivery overrides
 * - Routing needs to know whether the event should broadcast or target one consumer
 *
 * Expects:
 * - Route delivery to override protocol metadata field-by-field
 *
 * Returns:
 * - The merged broadcast/consumer delivery policy, or `undefined` when unrestricted
 */
export function resolveEventDelivery(event: WebSocketEvent): DeliveryConfig | undefined {
  const eventMetadata = getProtocolEventMetadata(event.type)
  const defaultDelivery = eventMetadata?.delivery
  const routeDelivery = event.route?.delivery

  if (!defaultDelivery && !routeDelivery) {
    return undefined
  }

  return {
    ...defaultDelivery,
    ...routeDelivery,
  }
}

import type { RouteTargetExpression, WebSocketEvent } from '@proj-airi/server-shared/types'

import type { AuthenticatedPeer } from '../types'

import { matchesDestinations, matchesLabelSelectors } from './route/match-expression'

export type RouteDecision
  = | { type: 'drop' }
    | { type: 'broadcast' }
    | { type: 'targets', targetIds: Set<string> }

export interface RoutingPolicy {
  allowPlugins?: string[]
  denyPlugins?: string[]
  allowLabels?: string[]
  denyLabels?: string[]
}

export interface RouteContext {
  event: WebSocketEvent
  fromPeer: AuthenticatedPeer
  peers: Map<string, AuthenticatedPeer>
  destinations?: Array<string | RouteTargetExpression>
}

export type RouteMiddleware = (context: RouteContext) => RouteDecision | void

function getPeerLabels(peer: AuthenticatedPeer) {
  return {
    ...peer.identity?.plugin?.labels,
    ...peer.identity?.labels,
  }
}

/**
 * Detects whether a peer should be treated as a trusted devtools sender.
 *
 * Use when:
 * - Checking whether route bypass is allowed for a peer
 * - Applying devtools-only routing affordances
 *
 * Expects:
 * - Peer labels to be sourced from authenticated identity metadata
 *
 * Returns:
 * - `true` when the peer declares a devtools label or uses a devtools module name
 */
export function isDevtoolsPeer(peer: AuthenticatedPeer) {
  const devtoolsLabel = getPeerLabels(peer).devtools
  const isDevtoolsLabel = devtoolsLabel === 'true' || devtoolsLabel === '1'
  return Boolean(isDevtoolsLabel || peer.name.includes('devtools'))
}

/**
 * Evaluates whether a peer is allowed by the active routing policy.
 *
 * Use when:
 * - Building a target list from the connected peer registry
 * - Enforcing allow/deny lists before broadcasting an event
 *
 * Expects:
 * - Unauthenticated peers must never be considered routable targets
 *
 * Returns:
 * - `true` when the peer is authenticated and satisfies all policy constraints
 */
export function peerMatchesPolicy(peer: AuthenticatedPeer, policy: RoutingPolicy) {
  if (!peer.authenticated) {
    return false
  }

  const pluginId = peer.identity?.plugin?.id ?? ''

  if (policy.allowPlugins?.length && !policy.allowPlugins.includes(pluginId)) {
    return false
  }

  if (policy.denyPlugins?.length && policy.denyPlugins.includes(pluginId)) {
    return false
  }

  const labels = getPeerLabels(peer)
  if (policy.allowLabels?.length && !matchesLabelSelectors(policy.allowLabels, labels)) {
    return false
  }

  if (policy.denyLabels?.length && matchesLabelSelectors(policy.denyLabels, labels)) {
    return false
  }

  return true
}

/**
 * Creates a routing middleware from a static allow/deny policy.
 *
 * Use when:
 * - Server-wide routing rules should be applied consistently
 * - Destination filtering should be derived from peer metadata instead of event payloads
 *
 * Expects:
 * - Route bypass authorization to be handled by the caller, not by the policy itself
 *
 * Returns:
 * - A middleware that narrows delivery to the peers allowed by the policy
 */
export function createPolicyMiddleware(policy: RoutingPolicy): RouteMiddleware {
  return ({ peers }) => {
    const targetIds = new Set<string>()
    for (const [id, peer] of peers.entries()) {
      if (peerMatchesPolicy(peer, policy)) {
        targetIds.add(id)
      }
    }

    return { type: 'targets', targetIds }
  }
}

/**
 * Resolves the destinations attached to an event.
 *
 * Use when:
 * - Route-level destinations should override payload-level destinations
 * - Delivery logic needs to distinguish between "broadcast" and "explicitly send nowhere"
 *
 * Expects:
 * - An explicit empty `route.destinations` array is a meaningful override
 *
 * Returns:
 * - The route destinations, payload destinations, or `undefined` when the event is unrestricted
 */
export function collectDestinations(event: WebSocketEvent | (Omit<WebSocketEvent, 'metadata'> & Partial<Pick<WebSocketEvent, 'metadata'>>)) {
  if (event.route && 'destinations' in event.route) {
    return event.route.destinations
  }

  const data = event.data as { destinations?: Array<string | RouteTargetExpression> } | undefined
  if (data?.destinations?.length) {
    return data.destinations
  }

  return undefined
}

export { matchesDestinations }

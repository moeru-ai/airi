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

export function isDevtoolsPeer(peer: AuthenticatedPeer) {
  const devtoolsLabel = peer.identity?.labels?.devtools
  const isDevtoolsLabel = devtoolsLabel === 'true' || devtoolsLabel === '1'
  return Boolean(isDevtoolsLabel || peer.name.includes('devtools'))
}

export function peerMatchesPolicy(peer: AuthenticatedPeer, policy: RoutingPolicy) {
  if (policy.allowPlugins?.length && !policy.allowPlugins.includes(peer.identity?.plugin ?? '')) {
    return false
  }

  if (policy.denyPlugins?.length && policy.denyPlugins.includes(peer.identity?.plugin ?? '')) {
    return false
  }

  const labels = peer.identity?.labels ?? {}
  if (policy.allowLabels?.length && !matchesLabelSelectors(policy.allowLabels, labels)) {
    return false
  }

  if (policy.denyLabels?.length && matchesLabelSelectors(policy.denyLabels, labels)) {
    return false
  }

  return true
}

export function createPolicyMiddleware(policy: RoutingPolicy): RouteMiddleware {
  return ({ event, peers }) => {
    if (event.route?.bypass) {
      return
    }

    const targetIds = new Set<string>()
    for (const [id, peer] of peers.entries()) {
      if (peerMatchesPolicy(peer, policy)) {
        targetIds.add(id)
      }
    }

    return { type: 'targets', targetIds }
  }
}

export function collectDestinations(event: WebSocketEvent | (Omit<WebSocketEvent, 'metadata'> & Partial<Pick<WebSocketEvent, 'metadata'>>)) {
  if (event.route?.destinations?.length) {
    return event.route.destinations
  }

  const data = event.data as { destinations?: Array<string | RouteTargetExpression> } | undefined
  if (data?.destinations?.length) {
    return data.destinations
  }

  return undefined
}

export { matchesDestinations }

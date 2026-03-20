import type { RouteMiddleware } from './route'

import { matchesDestinations } from './route'

function fnv1aHash(input: string) {
  let hash = 0x811C9DC5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function createAnycastMiddleware(): RouteMiddleware {
  return ({ event, fromPeer, peers, destinations }) => {
    if (event.route?.bypass) {
      return
    }

    if (event.route?.strategy !== 'anycast') {
      return
    }

    const candidates = Array.from(peers.entries())
      .filter(([id, peer]) => {
        if (id === fromPeer.peer.id) {
          return false
        }
        if (!peer.authenticated) {
          return false
        }
        if (peer.healthy === false) {
          return false
        }
        if (destinations && destinations.length > 0) {
          return matchesDestinations(destinations, peer)
        }
        return true
      })
      .sort(([a], [b]) => a.localeCompare(b))

    if (candidates.length === 0) {
      return
    }

    const key = event.metadata?.event?.id ?? `${event.type}`
    const idx = fnv1aHash(key) % candidates.length
    const [selectedId] = candidates[idx]
    return { type: 'targets', targetIds: new Set([selectedId]) }
  }
}

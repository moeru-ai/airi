export interface ChatWsUnauthenticatedPeerLimit {
  /** Releases a previously reserved unauthenticated connection slot. */
  release: () => void
  /** Reserves an unauthenticated connection slot when capacity remains. */
  tryAcquire: () => boolean
}

/**
 * Limits concurrent peers that have upgraded but have not authenticated yet.
 *
 * One instance owns only its local sockets, so the count protects the memory,
 * timer, and Eventa-context capacity of that process. Releasing more than once
 * is safe because close and error events can both arrive for one peer.
 */
export function createChatWsUnauthenticatedPeerLimit(maximumConnections: number): ChatWsUnauthenticatedPeerLimit {
  let activeConnections = 0

  return {
    release() {
      if (activeConnections > 0)
        activeConnections -= 1
    },
    tryAcquire() {
      if (activeConnections >= maximumConnections)
        return false

      activeConnections += 1
      return true
    },
  }
}

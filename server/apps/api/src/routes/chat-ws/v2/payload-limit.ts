interface PayloadReceiverSocket {
  _receiver: { _maxPayload: number }
}

function hasReceiverPayloadLimit(socket: unknown): socket is PayloadReceiverSocket {
  return typeof socket === 'object'
    && socket !== null
    && '_receiver' in socket
    && typeof socket._receiver === 'object'
    && socket._receiver !== null
    && '_maxPayload' in socket._receiver
    && typeof socket._receiver._maxPayload === 'number'
}

export interface ChatWsPayloadLimit {
  /** Limits frames while the peer has not authenticated. */
  restrict: (socket: unknown) => void
  /** Restores the transport limit after the peer authenticates. */
  restore: (socket: unknown) => void
}

/**
 * Owns the temporary frame limit for post-connect WebSocket authentication.
 *
 * The `ws` receiver is created before Hono runs the route hooks. Record its
 * configured limit per socket so authenticated chat traffic keeps the normal
 * capacity after the small authentication frame has been accepted.
 */
export function createChatWsPayloadLimit(unauthenticatedMaximum: number): ChatWsPayloadLimit {
  const originalLimits = new WeakMap<object, number>()

  return {
    restrict(socket) {
      if (!hasReceiverPayloadLimit(socket))
        return

      originalLimits.set(socket, socket._receiver._maxPayload)
      socket._receiver._maxPayload = unauthenticatedMaximum
    },
    restore(socket) {
      if (!hasReceiverPayloadLimit(socket))
        return

      const originalLimit = originalLimits.get(socket)
      if (originalLimit === undefined)
        return

      socket._receiver._maxPayload = originalLimit
      originalLimits.delete(socket)
    },
  }
}

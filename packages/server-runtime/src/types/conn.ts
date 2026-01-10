import type { MetadataEventSource } from '@proj-airi/server-shared/types'

export interface Peer {
  /**
   * Unique random [uuid v4](https://developer.mozilla.org/en-US/docs/Glossary/UUID) identifier for the peer.
   */
  get id(): string
  send: (data: unknown, options?: {
    compress?: boolean
  }) => number | void | undefined
  /**
   * WebSocket lifecycle state (mirrors WebSocket.readyState)
   */
  readyState?: number
}

export interface NamedPeer {
  name: string
  index?: number
  peer: Peer
}

export enum WebSocketReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3,
}

export interface AuthenticatedPeer extends NamedPeer {
  authenticated: boolean
  identity?: MetadataEventSource
  lastHeartbeatAt?: number
}

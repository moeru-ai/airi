// Use h3's Peer type instead
import type { Peer as H3Peer } from 'h3'

export type Peer = H3Peer

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
}

import type { Peer } from 'crossws'

export interface NamedPeer {
  name: string
  index?: number
  peer: Peer
}

export interface AuthenticatedPeer extends NamedPeer {
  authenticated: boolean
}

import type { Peer } from 'crossws'

export interface AuthenticatedPeer {
  peer: Peer
  authenticated: boolean
}

export interface Peer {
  /**
   * Unique random [uuid v4](https://developer.mozilla.org/en-US/docs/Glossary/UUID) identifier for the peer.
   */
  get id(): string
  send: (data: unknown, options?: {
    compress?: boolean
  }) => number | void | undefined
}

export interface NamedPeer {
  name: string
  index?: number
  peer: Peer
}

export interface AuthenticatedPeer extends NamedPeer {
  authenticated: boolean
}

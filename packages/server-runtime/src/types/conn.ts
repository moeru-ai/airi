import type { ExtensionIdentity, ExtensionModuleIdentity } from '@proj-airi/server-shared/types'

export enum WebSocketReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3,
}

export interface AuthenticatedPeer extends NamedPeer {
  authenticated: boolean
  extensionIdentity?: ExtensionIdentity
  extensionModules?: Map<string, RegisteredExtensionModule>
  healthy?: boolean
  identity?: ExtensionModuleIdentity
  lastHeartbeatAt?: number
  /**
   * REVIEW: Legacy field name kept during the better-ws migration.
   * The value now stores peer silence duration in milliseconds, not a miss count.
   * Rename this with the server-runtime peer state cleanup.
   */
  missedHeartbeats?: number
  /** Caller-supplied peer ids acknowledged during manual peer authentication. */
  peerIds?: Set<string>
}

export interface NamedPeer {
  index?: number
  name: string
  peer: Peer
}

export interface Peer {
  close?: () => void
  /**
   * Unique random [uuid v4](https://developer.mozilla.org/en-US/docs/Glossary/UUID) identifier for the peer.
   */
  get id(): string
  /**
   * WebSocket lifecycle state (mirrors WebSocket.readyState)
   */
  readyState?: number
  remoteAddress?: string
  request?: {
    headers?: Headers
    url?: string
  }
  send: (data: unknown, options?: {
    compress?: boolean
  }) => number | undefined | void
}

/**
 * Tracks one module announced by an extension over a websocket peer.
 */
export interface RegisteredExtensionModule {
  /** Module identity scoped to the owning extension session. */
  identity: ExtensionModuleIdentity
  /** Human-readable module name used by registry sync and legacy routing lookup. */
  name: string
}

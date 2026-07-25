import type { ExtensionIdentity, ExtensionModuleIdentity } from '@proj-airi/server-shared/types'

export interface Peer {
  /**
   * Unique random [uuid v4](https://developer.mozilla.org/en-US/docs/Glossary/UUID) identifier for the peer.
   */
  get id(): string
  send: (data: unknown, options?: {
    compress?: boolean
  }) => number | void | undefined
  close?: () => void
  /**
   * WebSocket lifecycle state (mirrors WebSocket.readyState)
   */
  readyState?: number
  request?: {
    url?: string
    headers?: Headers
  }
  remoteAddress?: string
}

export interface NamedPeer {
  name: string
  index?: number
  peer: Peer
}

/**
 * Tracks one module announced by an extension over a websocket peer.
 */
export interface RegisteredExtensionModule {
  /** Human-readable module name used by registry sync and legacy routing lookup. */
  name: string
  /** Module identity scoped to the owning extension session. */
  identity: ExtensionModuleIdentity
}

export enum WebSocketReadyState {
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3,
}

export interface AuthenticatedPeer extends NamedPeer {
  authenticated: boolean
  /** Caller-supplied peer ids acknowledged during manual peer authentication. */
  peerIds?: Set<string>
  identity?: ExtensionModuleIdentity
  extensionIdentity?: ExtensionIdentity
  extensionModules?: Map<string, RegisteredExtensionModule>
  lastHeartbeatAt?: number
  healthy?: boolean
  /**
   * REVIEW: Legacy field name kept during the better-ws migration.
   * The value now stores peer silence duration in milliseconds, not a miss count.
   * Rename this with the server-runtime peer state cleanup.
   */
  missedHeartbeats?: number
}

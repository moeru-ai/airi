import type { MetadataEventSource } from '@proj-airi/server-shared/types'

export interface Peer {
  get id(): string
  send: (data: unknown, options?: {
    compress?: boolean
  }) => number | void | undefined
  close?: () => void
  /**
   * WebSocket lifecycle state (mirrors WebSocket.readyState)
   */
  readyState?: number

  // Dynamic properties for different adapters
  [key: string]: any
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
  caller?: string
  purpose?: string
  identity?: MetadataEventSource
  lastHeartbeatAt?: number
  healthy?: boolean
  missedHeartbeats?: number
}

import type { WsCloseDetails, WsSendResult } from '../shared'

import { normalizeSendResult } from '../shared'

export interface PeerAdapter<TMessage> {
  /** Optional caller-owned stable peer id. */
  id?: string
  /** Sends one caller-owned message to the underlying connection. */
  send: (message: TMessage) => boolean | number | void
  /** Requests closing the underlying connection. */
  close?: (code?: number, reason?: string) => void
}

export interface PreviousPeer<TState = unknown> {
  /** Stable peer id that was replaced. */
  id: string
  /** Caller-owned state snapshot from the replaced peer. */
  state: TState | undefined
  /** Groups the replaced peer belonged to. */
  groups: string[]
  /** Last inbound activity timestamp known for the replaced peer. */
  lastSeenAt?: number
  /** Why the snapshot exists. */
  reason: 'replaced'
}

export interface Peer<TMessage, TState = unknown> {
  /** Stable id for this accepted peer. */
  readonly id: string
  /** Caller-owned mutable state associated with this peer. */
  state: TState | undefined
  /** Sends one message to this peer. */
  send: (message: TMessage) => WsSendResult
  /** Feeds one incoming adapter message into server handlers. */
  receive: (message: TMessage) => void
  /** Closes the peer and removes it from the server registry. */
  close: (code?: number, reason?: string) => void
  /** Adds this peer to a named group. */
  join: (group: string) => void
  /** Removes this peer from a named group. */
  leave: (group: string) => void
  /** Checks group membership. */
  isIn: (group: string) => boolean
}

export interface PeerHealthRecord {
  /** Whether the peer is currently considered healthy by server liveness policy. */
  healthy: boolean
  /** Last inbound activity timestamp known for this peer. */
  lastSeenAt: number
  /** Timestamp when the peer was first marked unhealthy. */
  unhealthyAt?: number
}

type PeerStateFactory<TState> = (previous?: PreviousPeer<TState>) => TState | undefined

export interface PeerManager<TMessage, TState = unknown> {
  readonly size: number
  get: (peerId: string) => Peer<TMessage, TState> | undefined
  has: (peerId: string) => boolean
  list: () => Array<Peer<TMessage, TState>>
  entries: () => IterableIterator<[string, Peer<TMessage, TState>]>
  accept: (
    adapter: PeerAdapter<TMessage>,
    options?: {
      state?: TState | ((previous?: PreviousPeer<TState>) => TState | undefined)
    },
  ) => { peer: Peer<TMessage, TState>, previous?: PreviousPeer<TState> }
  remove: (peerId: string, details?: WsCloseDetails) => void
  close: (peerId: string, code?: number, reason?: string) => void
  closeAll: () => void
  to: (group: string) => {
    send: (message: TMessage) => Array<WsSendResult & { peerId: string }>
  }
  broadcast: (message: TMessage) => Array<WsSendResult & { peerId: string }>
  markSeen: (peer: Peer<TMessage, TState>, now?: number) => void
  markUnhealthy: (peer: Peer<TMessage, TState>, now?: number) => void
  healthOf: (peerId: string) => Readonly<PeerHealthRecord> | undefined
}

let peerIdCounter = 0

/**
 * Creates the server-owned peer manager that tracks active peers, group
 * membership, stale peer handles, and per-peer liveness records.
 */
export function createPeers<TMessage, TState = unknown>(input: {
  onMessage: (peer: Peer<TMessage, TState>, message: TMessage) => void
  onSeen?: (peer: Peer<TMessage, TState>, health: PeerHealthRecord, wasHealthy: boolean) => void
  onRemove?: (peer: Peer<TMessage, TState>, details?: WsCloseDetails) => void
}): PeerManager<TMessage, TState> {
  const peers = new Map<string, Peer<TMessage, TState>>()
  const membershipsByPeer = new Map<string, Set<string>>()
  const peersByGroup = new Map<string, Set<string>>()
  const healthByPeer = new Map<string, PeerHealthRecord>()

  function isCurrentPeer(peer: Peer<TMessage, TState>) {
    return peers.get(peer.id) === peer
  }

  function snapshot(peerId: string): PreviousPeer<TState> | undefined {
    const previous = peers.get(peerId)
    if (!previous) {
      return undefined
    }

    return {
      id: peerId,
      state: previous.state,
      groups: [...(membershipsByPeer.get(peerId) ?? [])],
      lastSeenAt: healthByPeer.get(peerId)?.lastSeenAt,
      reason: 'replaced',
    }
  }

  function removePeerFromGroup(peerId: string, group: string) {
    const groupPeers = peersByGroup.get(group)
    if (!groupPeers) {
      return
    }

    groupPeers.delete(peerId)
    if (groupPeers.size === 0) {
      peersByGroup.delete(group)
    }
  }

  function remove(peerId: string, details?: WsCloseDetails) {
    const peer = peers.get(peerId)
    if (!peer) {
      return
    }

    peers.delete(peerId)
    healthByPeer.delete(peerId)

    const memberships = membershipsByPeer.get(peerId)
    if (!memberships) {
      return
    }

    for (const group of memberships) {
      removePeerFromGroup(peerId, group)
    }
    memberships.clear()
    membershipsByPeer.delete(peerId)
    input.onRemove?.(peer, details)
  }

  function removeCurrent(peer: Peer<TMessage, TState>, details?: WsCloseDetails) {
    if (!isCurrentPeer(peer)) {
      return
    }

    remove(peer.id, details)
  }

  function markSeen(peer: Peer<TMessage, TState>, now = Date.now()) {
    if (!isCurrentPeer(peer)) {
      return
    }

    const health = healthByPeer.get(peer.id)
    if (!health) {
      return
    }

    const wasHealthy = health.healthy
    health.healthy = true
    health.lastSeenAt = now
    delete health.unhealthyAt
    input.onSeen?.(peer, health, wasHealthy)
  }

  function markUnhealthy(peer: Peer<TMessage, TState>, now = Date.now()) {
    if (!isCurrentPeer(peer)) {
      return
    }

    const health = healthByPeer.get(peer.id)
    if (!health) {
      return
    }

    health.healthy = false
    health.unhealthyAt = now
  }

  const manager: PeerManager<TMessage, TState> = {
    get size() {
      return peers.size
    },
    get(peerId) {
      return peers.get(peerId)
    },
    has(peerId) {
      return peers.has(peerId)
    },
    list() {
      return [...peers.values()]
    },
    entries() {
      return peers.entries()
    },
    accept(adapter, options) {
      const id = adapter.id ?? `peer-${++peerIdCounter}`
      const previous = snapshot(id)
      if (previous) {
        remove(id)
      }

      const memberships = new Set<string>()
      membershipsByPeer.set(id, memberships)
      const nextState = options?.state

      const peer: Peer<TMessage, TState> = {
        id,
        // REVIEW:
        // Default previous.state inheritance is convenient for weak-network remote
        // plugin reconnects, but it may be wrong for protocols that require forced
        // state reinitialization on token rotation, identity switch, or multi-device
        // takeover. If those cases appear, replace this default with an explicit
        // state(previous, adapter) policy.
        state: typeof nextState === 'function'
          ? (nextState as PeerStateFactory<TState>)(previous)
          : nextState ?? previous?.state,
        send(message) {
          if (!isCurrentPeer(peer)) {
            return { ok: false, reason: 'closed' }
          }

          return normalizeSendResult(() => adapter.send(message))
        },
        receive(message) {
          if (!isCurrentPeer(peer)) {
            return
          }

          markSeen(peer)
          input.onMessage(peer, message)
        },
        close(code, reason) {
          if (!isCurrentPeer(peer)) {
            return
          }

          try {
            adapter.close?.(code, reason)
          }
          finally {
            removeCurrent(peer, { code, reason })
          }
        },
        join(group) {
          if (!isCurrentPeer(peer)) {
            return
          }

          memberships.add(group)
          let groupPeers = peersByGroup.get(group)
          if (!groupPeers) {
            groupPeers = new Set()
            peersByGroup.set(group, groupPeers)
          }
          groupPeers.add(id)
        },
        leave(group) {
          if (!isCurrentPeer(peer)) {
            return
          }

          memberships.delete(group)
          removePeerFromGroup(id, group)
        },
        isIn(group) {
          if (!isCurrentPeer(peer)) {
            return false
          }

          return memberships.has(group)
        },
      }

      peers.set(id, peer)
      healthByPeer.set(id, {
        healthy: true,
        lastSeenAt: Date.now(),
      })

      return previous ? { peer, previous } : { peer }
    },
    remove,
    close(peerId, code, reason) {
      peers.get(peerId)?.close(code, reason)
    },
    closeAll() {
      let firstError: unknown
      let nextPeer = peers.values().next().value
      while (nextPeer) {
        try {
          nextPeer.close()
        }
        catch (error) {
          firstError ??= error
        }
        nextPeer = peers.values().next().value
      }

      if (firstError) {
        throw firstError
      }
    },
    to(group) {
      return {
        send(message) {
          return [...(peersByGroup.get(group) ?? new Set<string>())]
            .map(peerId => peers.get(peerId))
            .filter(peer => typeof peer !== 'undefined')
            .map(peer => ({
              peerId: peer.id,
              ...peer.send(message),
            }))
        },
      }
    },
    broadcast(message) {
      return [...peers.values()].map(peer => ({
        peerId: peer.id,
        ...peer.send(message),
      }))
    },
    markSeen,
    markUnhealthy,
    healthOf(peerId) {
      const health = healthByPeer.get(peerId)
      return health ? { ...health } : undefined
    },
  }

  return manager
}

import type { Message as CrossWsMessage, Peer as CrossWsPeer, Hooks } from 'crossws'

import type { WsCloseDetails, WsSendResult } from '../shared'
import type {
  PeerHealthRecord,
  Peer as WsPeer,
  PeerAdapter as WsPeerAdapter,
  PeerManager as WsPeerManager,
  PreviousPeer as WsPreviousPeer,
} from './peers'

import { createEventWaitFor } from '../shared'
import { createPeers } from './peers'

export type {
  Peer as WsPeer,
  PeerAdapter as WsPeerAdapter,
  PeerManager as WsPeerManager,
  PreviousPeer as WsPreviousPeer,
} from './peers'

export interface WsServerMessageContext<TMessage, TState = unknown> {
  /** Server that received the message. */
  server: WsServer<TMessage, TState>
  /** Peer that sent the message. */
  peer: WsPeer<TMessage, TState>
  /** Incoming caller-owned message. */
  message: TMessage
}

export interface WsGroup<TMessage> {
  /** Sends one message to every peer currently in the group. */
  send: (message: TMessage) => Array<WsSendResult & { peerId: string }>
}

export interface ServerHeartbeatOptions<TMessage> {
  /** Reserved app-driven heartbeat transport policy; checkLiveness does not send pings. @default auto */
  mode?: 'auto' | 'native' | 'message'
  /** Reserved scheduler hint in milliseconds; callers must still invoke checkLiveness themselves. */
  interval?: number
  /** Keepalive timeout and peer liveness fallback in milliseconds. @default 60000 */
  timeout?: number
  /** Reserved protocol-neutral heartbeat message; checkLiveness never sends it automatically. */
  message?: TMessage | (() => TMessage)
  /** Detects inbound ping control messages that should not enter business handlers. */
  isPing?: (message: TMessage) => boolean
  /** Detects inbound pong control messages that should not enter business handlers. */
  isPong?: (message: TMessage) => boolean
  /** Legacy response predicate treated as a pong detector when isPong is absent. */
  isResponse?: (message: TMessage) => boolean
}

export interface WsPeerHealthChange<TMessage, TState = unknown> {
  /** Peer whose liveness state changed. */
  peer: WsPeer<TMessage, TState>
  /** Whether the peer is now considered healthy. */
  healthy: boolean
  /** Milliseconds of inbound silence recorded at the time of this change. */
  silentFor: number
}

export interface ProcedureWaitForOptions {
  /** Milliseconds before waitFor rejects. */
  timeout?: number
  /** Optional caller-owned abort signal. */
  signal?: AbortSignal
}

export interface ProcedureContext<TMessage, TState = unknown> {
  /** Peer that owns this procedure. */
  readonly peer: WsPeer<TMessage, TState>
  /** Active peer manager at procedure execution time. */
  readonly peers: WsPeerManager<TMessage, TState>
  /** Signal aborted when the procedure finishes or the peer closes. */
  readonly signal: AbortSignal
  /** Sends one message to the procedure peer. */
  send: (message: TMessage) => WsSendResult
  /** Waits for the next message from the procedure peer matching a predicate. */
  waitFor: (
    predicate: (message: TMessage) => boolean | Promise<boolean>,
    options?: ProcedureWaitForOptions,
  ) => Promise<TMessage>
}

export interface PeerOpenEvent<TMessage, TState = unknown> {
  /** Server that accepted the peer. */
  readonly server: WsServer<TMessage, TState>
  /** Active peer manager after the peer has been accepted. */
  readonly peers: WsPeerManager<TMessage, TState>
  /** Accepted peer. */
  readonly peer: WsPeer<TMessage, TState>
  /** Snapshot of the same-id peer that was replaced, when present. */
  readonly previous?: WsPreviousPeer<TState>
  /** Runs a scoped lifecycle procedure for this peer. */
  procedure: <T>(run: (ctx: ProcedureContext<TMessage, TState>) => Promise<T> | T) => Promise<T>
}

export interface PeerCloseEvent<TMessage, TState = unknown> {
  /** Server that removed the peer. */
  readonly server: WsServer<TMessage, TState>
  /** Active peer manager after the peer has been removed. */
  readonly peers: WsPeerManager<TMessage, TState>
  /** Removed peer id. */
  readonly peerId: string
  /** Runtime close details when an adapter provides them. */
  readonly details?: WsCloseDetails
}

export interface PeerControlMessageEvent<TMessage, TState = unknown> {
  /** Server that received the control message. */
  readonly server: WsServer<TMessage, TState>
  /** Active peer manager at control-message dispatch time. */
  readonly peers: WsPeerManager<TMessage, TState>
  /** Peer that sent the control message. */
  readonly peer: WsPeer<TMessage, TState>
  /** Incoming control message. */
  readonly message: TMessage
}

export interface WsServerPeerOptions {
  /** Milliseconds of inbound silence before a peer is marked unhealthy. */
  unhealthyTimeout?: number
  /** Milliseconds of inbound silence before a peer is closed and removed. */
  closeTimeout?: number
}

export interface WsServerOptions<TMessage> {
  /** Peer manager health policy. */
  peers?: WsServerPeerOptions
  /** Enables neutral server keepalive signal handling. @default false */
  heartbeat?: false | ServerHeartbeatOptions<TMessage>
}

export interface WsServer<TMessage, TState = unknown> {
  /** Active peers managed by the server peer manager. */
  readonly peers: WsPeerManager<TMessage, TState>
  /** Accepts a runtime peer adapter into the server registry. */
  accept: (adapter: WsPeerAdapter<TMessage>, options?: { state?: TState | ((previous?: WsPreviousPeer<TState>) => TState | undefined) }) => WsPeer<TMessage, TState>
  /** Removes one peer from the registry without closing the underlying connection. */
  remove: (peerId: string, details?: WsCloseDetails) => void
  /** Registers an incoming message handler. */
  onMessage: (handler: (context: WsServerMessageContext<TMessage, TState>) => void | Promise<void>) => () => void
  /** Registers a handler for accepted peers. */
  onPeerOpen: (handler: (event: PeerOpenEvent<TMessage, TState>) => void | Promise<void>) => () => void
  /** Registers a handler for removed peers. */
  onPeerClose: (handler: (event: PeerCloseEvent<TMessage, TState>) => void | Promise<void>) => () => void
  /** Registers a handler for inbound ping control messages. */
  onPing: (handler: (event: PeerControlMessageEvent<TMessage, TState>) => void | Promise<void>) => () => void
  /** Registers a handler for inbound pong control messages. */
  onPong: (handler: (event: PeerControlMessageEvent<TMessage, TState>) => void | Promise<void>) => () => void
  /** Registers a handler for server-side peer health transitions. */
  onPeerHealthChange: (handler: (event: WsPeerHealthChange<TMessage, TState>) => void | Promise<void>) => () => void
  /** Advances check-based inbound liveness tracking for active peers; it does not send heartbeat messages. */
  checkLiveness: (now?: number) => void
  /** Sends one message to all active peers. */
  broadcast: (message: TMessage) => Array<WsSendResult & { peerId: string }>
  /** Selects a named group for group sends. */
  to: (group: string) => WsGroup<TMessage>
  /** Removes all peers and clears runtime state. */
  close: () => void
}

export interface WsCrossWsHandlerOptions<TMessage, TState = unknown> {
  /** Reads one caller-owned message from a CrossWS message. @default message.text() */
  readMessage?: (message: CrossWsMessage, peer: CrossWsPeer) => TMessage
  /** Resolves the better-ws peer id from a CrossWS peer. @default peer.id */
  peerId?: (peer: CrossWsPeer) => string
  /** Creates initial better-ws peer state for a CrossWS peer. */
  state?: (peer: CrossWsPeer) => TState | undefined
  /** CrossWS send compression option for messages sent through better-ws peers. */
  compress?: boolean
  /** Optional lifecycle hook after a CrossWS peer is accepted. */
  open?: (context: { peer: WsPeer<TMessage, TState>, rawPeer: CrossWsPeer }) => void | Promise<void>
  /** Optional lifecycle hook after a CrossWS peer is removed. */
  close?: (context: { peer?: WsPeer<TMessage, TState>, rawPeer: CrossWsPeer, details?: WsCloseDetails }) => void | Promise<void>
  /** Optional lifecycle hook for CrossWS errors. */
  error?: (context: { peer?: WsPeer<TMessage, TState>, rawPeer: CrossWsPeer, error: unknown }) => void | Promise<void>
}

interface CrossWsPeerEntry<TMessage, TState> {
  peer: WsPeer<TMessage, TState>
  rawPeer: CrossWsPeer
}

/**
 * Creates a runtime-agnostic websocket server peer registry.
 *
 * Use when:
 * - A concrete server adapter needs shared peer management, message handlers, groups, and broadcast semantics
 * - Application protocols want to keep full control of message shape and serialization
 *
 * Expects:
 * - Runtime adapters call `accept(...)` on open, `peer.receive(...)` on message, and `peer.close(...)` on close
 *
 * Returns:
 * - A server runtime that tracks peers and dispatches caller-owned messages
 */
export function createServer<TMessage, TState = unknown>(
  options: WsServerOptions<TMessage> = {},
): WsServer<TMessage, TState> {
  let server: WsServer<TMessage, TState>
  const messageHandlers = new Set<(context: WsServerMessageContext<TMessage, TState>) => void | Promise<void>>()
  const peerOpenHandlers = new Set<(event: PeerOpenEvent<TMessage, TState>) => void | Promise<void>>()
  const peerCloseHandlers = new Set<(event: PeerCloseEvent<TMessage, TState>) => void | Promise<void>>()
  const pingHandlers = new Set<(event: PeerControlMessageEvent<TMessage, TState>) => void | Promise<void>>()
  const pongHandlers = new Set<(event: PeerControlMessageEvent<TMessage, TState>) => void | Promise<void>>()
  const healthChangeHandlers = new Set<(event: WsPeerHealthChange<TMessage, TState>) => void | Promise<void>>()
  const procedureControllers = new WeakMap<WsPeer<TMessage, TState>, Set<AbortController>>()
  const heartbeat = options.heartbeat === false ? undefined : options.heartbeat

  function createProcedure(peer: WsPeer<TMessage, TState>) {
    return async function procedure<T>(
      run: (ctx: ProcedureContext<TMessage, TState>) => Promise<T> | T,
    ): Promise<T> {
      const controller = new AbortController()

      const listeners = new Set<() => void>()
      let controllers = procedureControllers.get(peer)
      if (!controllers) {
        controllers = new Set()
        procedureControllers.set(peer, controllers)
      }

      controllers.add(controller)

      const ctx: ProcedureContext<TMessage, TState> = {
        peer,
        peers: server.peers,
        signal: controller.signal,
        send: message => peer.send(message),
        waitFor(predicate, waitOptions = {}) {
          const wait = createEventWaitFor<WsServerMessageContext<TMessage, TState>, TMessage>({
            match: async ({ peer: fromPeer, message }) => fromPeer === peer && await predicate(message),
            select: ({ message }) => message,
            timeout: waitOptions.timeout,
            signals: [controller.signal, waitOptions.signal],
            abortMessage: 'Procedure aborted.',
            timeoutMessage: 'Procedure waitFor timed out.',
          })

          const unsubscribe = server.onMessage(wait.emit)
          listeners.add(unsubscribe)

          void wait.promise.finally(() => {
            unsubscribe()
            listeners.delete(unsubscribe)
          }).catch(() => {})

          return wait.promise
        },
      }

      try {
        return await run(ctx)
      }
      finally {
        controller.abort()
        for (const unsubscribe of listeners) {
          unsubscribe()
        }

        listeners.clear()

        controllers.delete(controller)
        if (controllers.size === 0) {
          procedureControllers.delete(peer)
        }
      }
    }
  }

  function emitPeerOpen(peer: WsPeer<TMessage, TState>, previous?: WsPreviousPeer<TState>) {
    const event: PeerOpenEvent<TMessage, TState> = {
      server,
      peers: server.peers,
      peer,
      previous,
      procedure: createProcedure(peer),
    }

    for (const handler of peerOpenHandlers) {
      void handler(event)
    }
  }

  function abortPeerProcedures(peer: WsPeer<TMessage, TState>) {
    for (const controller of procedureControllers.get(peer) ?? []) {
      controller.abort()
    }
  }

  function emitPeerClose(peerId: string, details?: WsCloseDetails) {
    const event: PeerCloseEvent<TMessage, TState> = {
      server,
      peers: server.peers,
      peerId,
      details,
    }

    for (const handler of peerCloseHandlers) {
      void handler(event)
    }
  }

  function emitControlMessage(peer: WsPeer<TMessage, TState>, message: TMessage, handlers: Set<(event: PeerControlMessageEvent<TMessage, TState>) => void | Promise<void>>) {
    const event: PeerControlMessageEvent<TMessage, TState> = {
      server,
      peers: server.peers,
      peer,
      message,
    }

    for (const handler of handlers) {
      void handler(event)
    }
  }

  function emitHealthChange(peer: WsPeer<TMessage, TState>, health: PeerHealthRecord, silentFor: number) {
    const event: WsPeerHealthChange<TMessage, TState> = {
      peer,
      healthy: health.healthy,
      silentFor,
    }

    for (const handler of healthChangeHandlers) {
      void handler(event)
    }
  }

  const rawPeers = createPeers<TMessage, TState>({
    onMessage(peer, message) {
      const isPing = heartbeat?.isPing?.(message) ?? false
      const isPong = heartbeat?.isPong?.(message) ?? heartbeat?.isResponse?.(message) ?? false

      if (isPing || isPong) {
        emitControlMessage(peer, message, isPing ? pingHandlers : pongHandlers)

        return
      }

      for (const handler of messageHandlers) {
        void handler({ server, peer, message })
      }
    },
    onSeen(peer, health, wasHealthy) {
      if (!wasHealthy) {
        emitHealthChange(peer, health, 0)
      }
    },
    onRemove(peer, details) {
      abortPeerProcedures(peer)
      emitPeerClose(peer.id, details)
    },
  })

  const peers: WsPeerManager<TMessage, TState> = {
    get size() {
      return rawPeers.size
    },
    get: (peerId) => {
      return rawPeers.get(peerId)
    },
    has: (peerId) => {
      return rawPeers.has(peerId)
    },
    list: () => {
      return rawPeers.list()
    },
    entries: () => {
      return rawPeers.entries()
    },
    accept(adapter, options) {
      const result = rawPeers.accept(adapter, options)
      emitPeerOpen(result.peer, result.previous)
      return result
    },
    remove(peerId, details) {
      rawPeers.remove(peerId, details)
    },
    close(peerId, code, reason) {
      rawPeers.close(peerId, code, reason)
    },
    closeAll() {
      rawPeers.closeAll()
    },
    to: (group) => {
      return rawPeers.to(group)
    },
    broadcast: (message) => {
      return rawPeers.broadcast(message)
    },
    markSeen: (peer, now) => {
      return rawPeers.markSeen(peer, now)
    },
    markUnhealthy: (peer, now) => {
      return rawPeers.markUnhealthy(peer, now)
    },
    healthOf: (peerId) => {
      return rawPeers.healthOf(peerId)
    },
  }

  server = {
    peers,
    accept(adapter, options) {
      return peers.accept(adapter, options).peer
    },
    remove(peerId, details) {
      peers.remove(peerId, details)
    },
    onMessage(handler) {
      messageHandlers.add(handler)
      return () => messageHandlers.delete(handler)
    },
    onPeerOpen(handler) {
      peerOpenHandlers.add(handler)
      return () => peerOpenHandlers.delete(handler)
    },
    onPeerClose(handler) {
      peerCloseHandlers.add(handler)
      return () => peerCloseHandlers.delete(handler)
    },
    onPing(handler) {
      pingHandlers.add(handler)
      return () => pingHandlers.delete(handler)
    },
    onPong(handler) {
      pongHandlers.add(handler)
      return () => pongHandlers.delete(handler)
    },
    onPeerHealthChange(handler) {
      healthChangeHandlers.add(handler)
      return () => healthChangeHandlers.delete(handler)
    },
    checkLiveness(now = Date.now()) {
      if (!heartbeat && !options.peers) {
        return
      }

      const unhealthyTimeout = options.peers?.unhealthyTimeout ?? heartbeat?.timeout ?? 60_000
      const closeTimeout = options.peers?.closeTimeout ?? unhealthyTimeout * 2

      const activePeers = [...rawPeers.entries()]

      for (const [id, peer] of activePeers) {
        const health = rawPeers.healthOf(id)
        if (!health) {
          continue
        }

        const silentFor = now - health.lastSeenAt
        if (silentFor >= closeTimeout) {
          if (health.healthy) {
            rawPeers.markUnhealthy(peer, now)
            emitHealthChange(peer, { healthy: false, lastSeenAt: health.lastSeenAt, unhealthyAt: now }, silentFor)
          }

          peer.close()
          continue
        }

        if (silentFor >= unhealthyTimeout && health.healthy) {
          rawPeers.markUnhealthy(peer, now)
          emitHealthChange(peer, { healthy: false, lastSeenAt: health.lastSeenAt, unhealthyAt: now }, silentFor)
        }
      }
    },
    broadcast(message) {
      return rawPeers.broadcast(message)
    },
    to(group) {
      return rawPeers.to(group)
    },
    close() {
      try {
        peers.closeAll()
      }
      finally {
        messageHandlers.clear()
        peerOpenHandlers.clear()
        peerCloseHandlers.clear()
        pingHandlers.clear()
        pongHandlers.clear()
        healthChangeHandlers.clear()
      }
    },
  }

  return server
}

/**
 * Creates CrossWS hooks backed by a {@link WsServer} peer registry.
 *
 * Use when:
 * - A CrossWS-compatible runtime should feed raw messages into better-ws server primitives
 * - Message shape should stay controlled by the caller through `readMessage`
 *
 * Expects:
 * - CrossWS calls `open`, `message`, and `close` with stable peer ids
 * - The default message reader is only used for text protocols
 *
 * Returns:
 * - CrossWS hooks that can be passed to CrossWS adapters or H3 websocket handlers
 */
export function toCrossWsHooks<TMessage = string, TState = unknown>(
  server: WsServer<TMessage, TState>,
  options: WsCrossWsHandlerOptions<TMessage, TState> = {},
): Partial<Hooks> {
  const peers = new Map<string, CrossWsPeerEntry<TMessage, TState>>()
  const retiredRawPeers = new WeakSet<CrossWsPeer>()
  const peerId = options.peerId ?? ((peer: CrossWsPeer) => peer.id)
  const readMessage = options.readMessage ?? ((message: CrossWsMessage) => message.text() as TMessage)

  server.onPeerOpen(({ peer, previous }) => {
    if (!previous) {
      return
    }

    const existingEntry = peers.get(peer.id)
    if (existingEntry && existingEntry.peer !== peer) {
      retiredRawPeers.add(existingEntry.rawPeer)
      peers.delete(peer.id)
    }
  })

  function accept(rawPeer: CrossWsPeer, acceptOptions: { replaceCurrent?: boolean } = {}) {
    retiredRawPeers.delete(rawPeer)
    const id = peerId(rawPeer)

    const existingEntry = peers.get(id)
    const currentServerPeer = server.peers.get(id)

    if (existingEntry && currentServerPeer === existingEntry.peer && !acceptOptions.replaceCurrent) {
      return existingEntry.peer
    }

    if (existingEntry && currentServerPeer === existingEntry.peer) {
      retiredRawPeers.add(existingEntry.rawPeer)
      server.remove(id)
      peers.delete(id)
    }
    else if (existingEntry) {
      retiredRawPeers.add(existingEntry.rawPeer)
      peers.delete(id)
    }

    const peer = server.accept({
      id,
      send: message => rawPeer.send(message, { compress: options.compress }),
      close: (code, reason) => rawPeer.close(code, reason),
    }, {
      state: options.state?.(rawPeer),
    })

    peers.set(id, { peer, rawPeer })

    return peer
  }

  return {
    async open(rawPeer) {
      const peer = accept(rawPeer, { replaceCurrent: true })
      await options.open?.({ peer, rawPeer })
    },
    message(rawPeer, message) {
      if (retiredRawPeers.has(rawPeer)) {
        return
      }

      const id = peerId(rawPeer)
      const entry = peers.get(id)
      if (!entry) {
        if (server.peers.has(id)) {
          return
        }

        accept(rawPeer).receive(readMessage(message, rawPeer))
        return
      }

      if (entry.rawPeer !== rawPeer) {
        return
      }

      if (server.peers.get(entry.peer.id) !== entry.peer) {
        peers.delete(id)
        if (!server.peers.has(id)) {
          accept(rawPeer).receive(readMessage(message, rawPeer))
        }

        return
      }

      entry.peer.receive(readMessage(message, rawPeer))
    },
    async close(rawPeer, details) {
      if (retiredRawPeers.has(rawPeer)) {
        await options.close?.({ peer: undefined, rawPeer, details })
        return
      }

      const id = peerId(rawPeer)
      const entry = peers.get(id)

      const currentPeer = entry?.rawPeer === rawPeer && server.peers.get(id) === entry.peer ? entry.peer : undefined
      if (entry?.rawPeer === rawPeer) {
        peers.delete(id)
        if (currentPeer) {
          server.remove(id, details)
        }
      }

      await options.close?.({ peer: currentPeer, rawPeer, details })
    },
    async error(rawPeer, error) {
      const entry = peers.get(peerId(rawPeer))
      await options.error?.({ peer: entry?.rawPeer === rawPeer ? entry.peer : undefined, rawPeer, error })
    },
  }
}

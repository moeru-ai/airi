import type { EventContext, InvocableEventContext } from '@moeru/eventa'
import type { WSContext, WSEvents } from 'hono/ws'

import { and, createContext, defineEventa, defineInboundEventa, defineOutboundEventa, EventaFlowDirection, matchBy } from '@moeru/eventa'

// Re-implement the internal websocket payload helpers since they are not exported
// from @moeru/eventa's public API. These match the wire format used by the H3 and
// native adapters so that clients using any eventa adapter remain interoperable.

interface WebsocketPayload {
  id: string
  type: string
  payload: Record<string, unknown>
  timestamp: number
}

function generateWebsocketPayload(type: string, payload: Record<string, unknown>): WebsocketPayload {
  return {
    id: crypto.randomUUID(),
    type,
    payload,
    timestamp: Date.now(),
  }
}

function parseWebsocketPayload(data: string): WebsocketPayload {
  return JSON.parse(data)
}

// ---------------------------------------------------------------------------
// Lifecycle events
// ---------------------------------------------------------------------------

export const wsConnectedEvent = defineEventa('eventa:adapters:hono-ws:connected')
export const wsDisconnectedEvent = defineEventa('eventa:adapters:hono-ws:disconnected')
export const wsErrorEvent = defineEventa('eventa:adapters:hono-ws:error')

interface HonoWsRawEventOptions {
  raw?: {
    error?: Event
    message?: HonoWsMessageEvent
  }
}

type HonoWsMessageEvent = Parameters<NonNullable<WSEvents['onMessage']>>[0]

export type HonoWsEventContext = EventContext<any, HonoWsRawEventOptions>
export type HonoWsInvocableEventContext = InvocableEventContext<any, HonoWsRawEventOptions>

// ---------------------------------------------------------------------------
// Per-peer adapter
// ---------------------------------------------------------------------------

export interface CreatePeerHooksOptions {
  /** Called when a new peer connects and its EventContext is ready. */
  onContext?: (ctx: HonoWsInvocableEventContext) => void
}

export interface PeerHooksResult {
  hooks: WSEvents
}

/**
 * Create Hono WSEvents hooks that manage one eventa EventContext per peer.
 *
 * This is the Hono equivalent of the H3 adapter's `createPeerContext` /
 * `createPeerHooks`. Each time `onOpen` fires a fresh EventContext is created,
 * outbound events are serialised to `ws.send()`, and incoming messages are
 * routed into the context as inbound events.
 */
export function createPeerHooks(options: CreatePeerHooksOptions = {}): PeerHooksResult {
  let ctx: HonoWsInvocableEventContext | undefined
  let cleanup: (() => void) | undefined

  const hooks: WSEvents = {
    onOpen(_event, ws) {
      ctx = createContext<any, HonoWsRawEventOptions>()

      // Intercept outbound events and forward them over the WebSocket.
      // This mirrors the H3 adapter's pattern exactly.
      const offOutbound = ctx.on(
        and(
          matchBy((e: any) => e._flowDirection === EventaFlowDirection.Outbound || !e._flowDirection),
          matchBy('*'),
        ),
        (event: any) => {
          const data = JSON.stringify(
            generateWebsocketPayload(event.id, {
              ...defineOutboundEventa(event.type),
              ...event,
            }),
          )
          ws.send(data)
        },
      )

      cleanup = offOutbound

      // Emit lifecycle event
      ctx.emit(wsConnectedEvent, {}, { raw: {} })

      // Notify caller
      options.onContext?.(ctx)
    },

    onMessage(message) {
      if (!ctx)
        return

      try {
        const raw = typeof message.data === 'string' ? message.data : String(message.data)
        const { type, payload } = parseWebsocketPayload(raw)
        ctx.emit(defineInboundEventa(type), (payload as any).body, { raw: { message } })
      }
      catch (error) {
        console.error('Failed to parse WebSocket message:', error)
        ctx.emit(wsErrorEvent, { error }, { raw: { message } })
      }
    },

    onClose() {
      if (!ctx)
        return

      ctx.emit(wsDisconnectedEvent, {}, { raw: {} })
      cleanup?.()
      ctx = undefined
      cleanup = undefined
    },

    onError(event, _ws) {
      if (!ctx)
        return

      ctx.emit(wsErrorEvent, { error: event }, { raw: { error: event } })
    },
  }

  return { hooks }
}

// ---------------------------------------------------------------------------
// Global (broadcast) adapter
// ---------------------------------------------------------------------------

export interface GlobalHooksResult {
  hooks: WSEvents
  context: HonoWsEventContext
}

/**
 * Create a single shared EventContext that broadcasts outbound events to every
 * connected peer — the Hono equivalent of the H3 adapter's
 * `createGlobalContext`.
 */
export function createGlobalHooks(): GlobalHooksResult {
  const ctx = createContext<any, HonoWsRawEventOptions>()
  const peers = new Set<WSContext>()

  // Broadcast outbound events to all connected peers.
  ctx.on(
    and(
      matchBy((e: any) => e._flowDirection === EventaFlowDirection.Outbound || !e._flowDirection),
      matchBy('*'),
    ),
    (event: any) => {
      const data = JSON.stringify(
        generateWebsocketPayload(event.id, {
          ...defineOutboundEventa(event.type),
          ...event,
        }),
      )
      for (const peer of peers) {
        peer.send(data)
      }
    },
  )

  const hooks: WSEvents = {
    onOpen(_event, ws) {
      peers.add(ws)
      ctx.emit(wsConnectedEvent, {}, { raw: {} })
    },

    onMessage(message) {
      try {
        const raw = typeof message.data === 'string' ? message.data : String(message.data)
        const { type, payload } = parseWebsocketPayload(raw)
        ctx.emit(defineInboundEventa(type), (payload as any).body, { raw: { message } })
      }
      catch (error) {
        console.error('Failed to parse WebSocket message:', error)
        ctx.emit(wsErrorEvent, { error }, { raw: { message } })
      }
    },

    onClose(_event, ws) {
      peers.delete(ws)
      ctx.emit(wsDisconnectedEvent, {}, { raw: {} })
    },

    onError(event, _ws) {
      ctx.emit(wsErrorEvent, { error: event }, { raw: { error: event } })
    },
  }

  return { hooks, context: ctx }
}

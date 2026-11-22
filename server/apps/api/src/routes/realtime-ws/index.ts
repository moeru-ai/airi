import type { WSContext, WSEvents } from 'hono/ws'

import type { ChatWsAuthResolver } from '../chat-ws/v2/auth'
import type { RealtimeRelay, RelayConnection } from './relay'

import { Buffer } from 'node:buffer'

import { defineInvokeHandler } from '@moeru/eventa'
import { createPeerHooks, wsDisconnectedEvent } from '@moeru/eventa/adapters/websocket/hono'
import { authenticate, RELAY_EVENT_PREFIX, RELAY_MAX_FRAME_BYTES } from '@proj-airi/server-sdk-shared/realtime'
import { looseObject, pipe, safeParse, startsWith, string } from 'valibot'

import { WS_CLOSE_TRY_AGAIN_LATER, WS_CLOSE_UNAUTHORIZED } from '../../libs/ws-auth'
import { createChatWsV2Authentication } from '../chat-ws/v2/auth'
import { createChatWsUnauthenticatedPeerLimit } from '../chat-ws/v2/unauthenticated-peers'

/** Standard WebSocket close code for a frame that breaks the rules of the endpoint. Clients do not retry it. */
const WS_CLOSE_POLICY_VIOLATION = 1008

const MAX_UNAUTHENTICATED_CONNECTIONS = 100

/**
 * The frames that one connection can forward in each window.
 *
 * Call control needs a few frames for each call. The limit stops a client loop before it fills Redis Pub/Sub.
 */
const FORWARD_LIMIT = { frames: 200, windowMs: 10_000 }

/** The Eventa WebSocket adapter writes the event id of a frame to `type`. */
const AuthenticateFrameSchema = looseObject({ type: pipe(string(), startsWith('realtime:authenticate')) })
const RelayFrameSchema = looseObject({ type: pipe(string(), startsWith(RELAY_EVENT_PREFIX)) })

type FrameKind = 'authenticate' | 'relay' | 'invalid'

function classifyFrame(data: unknown): FrameKind {
  if (typeof data !== 'string' || Buffer.byteLength(data) > RELAY_MAX_FRAME_BYTES)
    return 'invalid'

  let frame: unknown
  try {
    frame = JSON.parse(data)
  }
  catch {
    return 'invalid'
  }

  if (safeParse(RelayFrameSchema, frame).success)
    return 'relay'
  if (safeParse(AuthenticateFrameSchema, frame).success)
    return 'authenticate'
  return 'invalid'
}

function isTerminableSocket(raw: unknown): raw is { terminate: () => void } {
  return typeof raw === 'object'
    && raw !== null
    && 'terminate' in raw
    && typeof raw.terminate === 'function'
}

export interface RealtimeWsOptions {
  relay: RealtimeRelay
  /** Returns the user id of an access token, or `null` for a token that is not valid. */
  resolveUserId: ChatWsAuthResolver
}

/**
 * Creates the `/ws/v1/realtime` handlers.
 *
 * Connection states:
 *
 * 1. Unauthenticated. The upgrade is anonymous. The only accepted frame is the `realtime:authenticate` invoke,
 *    which the Eventa adapter handles. Another frame closes the socket with 4001.
 * 2. Authenticated. The connection is in the relay of its user. The handler forwards each frame with an event id
 *    under `proj-airi:realtime:` to the other connections of that user, and does not read the body. The Eventa
 *    adapter does not see these frames. Another frame closes the socket with 1008.
 * 3. Closed. The connection leaves the relay.
 */
export function createRealtimeWsHandlers(options: RealtimeWsOptions) {
  // The upgrade is anonymous, so bound the peers that hold a timer and an Eventa context before they authenticate.
  const unauthenticatedPeers = createChatWsUnauthenticatedPeerLimit(MAX_UNAUTHENTICATED_CONNECTIONS)

  return function setupPeer(): WSEvents {
    let socket: WSContext | undefined
    let ownsUnauthenticatedSlot = false
    let connection: RelayConnection | undefined
    let windowStartedAt = 0
    let framesInWindow = 0

    function releaseUnauthenticatedSlot(): void {
      if (!ownsUnauthenticatedSlot)
        return

      ownsUnauthenticatedSlot = false
      unauthenticatedPeers.release()
    }

    function overForwardLimit(): boolean {
      const now = Date.now()
      if (now - windowStartedAt >= FORWARD_LIMIT.windowMs) {
        windowStartedAt = now
        framesInWindow = 0
      }
      framesInWindow += 1
      return framesInWindow > FORWARD_LIMIT.frames
    }

    const { hooks } = createPeerHooks({
      onContext: (ctx) => {
        const authentication = createChatWsV2Authentication({
          socket,
          resolveUserId: options.resolveUserId,
          onAuthenticated(userId) {
            releaseUnauthenticatedSlot()
            const peer = socket
            if (peer)
              connection = options.relay.join(userId, frame => peer.send(frame))
          },
        })
        const unregisterAuthenticate = defineInvokeHandler(ctx, authenticate, authentication.authenticate)

        ctx.on(wsDisconnectedEvent, () => {
          authentication.disconnect()
          unregisterAuthenticate()
        })
      },
    })

    function leave(): void {
      releaseUnauthenticatedSlot()
      connection?.leave()
      connection = undefined
    }

    return {
      ...hooks,
      onOpen(event, ws) {
        if (!unauthenticatedPeers.tryAcquire()) {
          // The slots are full. Do not wait for a hostile peer to answer a close frame.
          if (isTerminableSocket(ws.raw))
            ws.raw.terminate()
          else
            ws.close(WS_CLOSE_TRY_AGAIN_LATER, 'too many unauthenticated connections')
          return
        }

        ownsUnauthenticatedSlot = true
        socket = ws
        hooks.onOpen?.(event, ws)
      },
      onClose(event, ws) {
        leave()
        hooks.onClose?.(event, ws)
      },
      onError(event, ws) {
        leave()
        hooks.onError?.(event, ws)
      },
      onMessage(event, ws) {
        const kind = classifyFrame(event.data)

        if (!connection) {
          if (kind !== 'authenticate') {
            ws.close(WS_CLOSE_UNAUTHORIZED, 'unauthorized')
            return
          }
          hooks.onMessage?.(event, ws)
          return
        }

        // A second authenticate frame has a token in it. Do not forward it to the other devices.
        if (kind !== 'relay') {
          ws.close(WS_CLOSE_POLICY_VIOLATION, 'invalid frame')
          return
        }
        if (overForwardLimit()) {
          ws.close(WS_CLOSE_POLICY_VIOLATION, 'too many frames')
          return
        }

        connection.forward(event.data as string)
      },
    }
  }
}

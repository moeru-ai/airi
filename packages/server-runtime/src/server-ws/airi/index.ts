import type { DeliveryConfig, MessageHeartbeat, MetadataEventSource, WebSocketBaseEvent, WebSocketEvent } from '@proj-airi/server-shared/types'

import type {
  RouteContext,
  RouteDecision,
  RouteMiddleware,
} from '../../middlewares'
import type { Peer } from '../../types'

import { ServerErrorMessages } from '@proj-airi/server-shared'
import {
  getProtocolEventMetadata,
  MessageHeartbeatKind,
  WebSocketEventSource,
} from '@proj-airi/server-shared/types'
import { nanoid } from 'nanoid'
import { parse, stringify } from 'superjson'

import packageJSON from '../../../package.json'

import { createEventCodec, createGatewayLifecycle } from '../core'

const invalidAiriWebSocketEventFormatMessage = 'Invalid WebSocket event format.'

/**
 * Close details surfaced by the websocket runtime for AIRI peer shutdown logging.
 */
export interface AiriServerWsCloseDetails {
  /** WebSocket close code when the runtime reports one. */
  code?: number
  /** WebSocket close reason when the runtime reports one. */
  reason?: string
  /** Whether the runtime considers the close clean. */
  wasClean?: unknown
}

/**
 * Error thrown when a websocket message parses as JSON but is not an AIRI event envelope.
 *
 * Use when:
 * - The runtime must distinguish malformed event envelopes from invalid JSON text
 *
 * Expects:
 * - Callers convert this to the protocol `invalidEventFormat` response
 *
 * Returns:
 * - A typed error for invalid AIRI websocket event envelopes
 */
export class AiriWebSocketEventFormatError extends Error {
  constructor() {
    super(invalidAiriWebSocketEventFormatMessage)
    this.name = 'AiriWebSocketEventFormatError'
  }
}

/**
 * Creates the AIRI websocket gateway wrapper.
 *
 * Use when:
 * - `setupApp(...)` needs a gateway object to mount on `/ws`
 *
 * Expects:
 * - `handler` preserves the existing AIRI websocket lifecycle behavior
 *
 * Returns:
 * - A gateway object compatible with H3 `defineWebSocketHandler(...)`
 */
export function createGateway(input: {
  handler: {
    open: (peer: Peer) => void
    message: (peer: Peer, message: { text: () => string }) => void
    error: (peer: Peer, error: unknown) => void
    close: (peer: Peer, details?: AiriServerWsCloseDetails) => void
  }
  dispose?: () => void
}) {
  return createGatewayLifecycle({
    handler: input.handler,
    dispose: input.dispose,
  })
}

/**
 * Creates metadata for events emitted by the AIRI websocket runtime.
 *
 * Use when:
 * - The server sends protocol events to connected peers
 * - Response events should preserve parent event correlation
 *
 * Expects:
 * - `serverInstanceId` identifies the active server runtime instance
 *
 * Returns:
 * - AIRI protocol metadata with server source and event id
 */
export function createEventMetadata(
  serverInstanceId: string,
  parentId?: string,
): { source: MetadataEventSource, event: { id: string, parentId?: string } } {
  return {
    event: {
      id: nanoid(),
      parentId,
    },
    source: {
      kind: 'plugin',
      plugin: {
        id: WebSocketEventSource.Server,
        version: packageJSON.version,
      },
      id: serverInstanceId,
    },
  }
}

/**
 * Creates AIRI server response event factories.
 *
 * Use when:
 * - WebSocket handlers need stable response event shapes
 *
 * Expects:
 * - `serverInstanceId` identifies the current server runtime
 *
 * Returns:
 * - Factory methods for protocol responses emitted by the server
 */
export function createResponses(serverInstanceId: string) {
  return {
    authenticated(parentId?: string) {
      return {
        type: 'module:authenticated',
        data: { authenticated: true },
        metadata: createEventMetadata(serverInstanceId, parentId),
      } satisfies WebSocketEvent<Record<string, unknown>>
    },
    notAuthenticated(parentId?: string) {
      return {
        type: 'error',
        data: { message: ServerErrorMessages.notAuthenticated },
        metadata: createEventMetadata(serverInstanceId, parentId),
      } satisfies WebSocketEvent<Record<string, unknown>>
    },
    error(message: string, parentId?: string) {
      return {
        type: 'error',
        data: { message },
        metadata: createEventMetadata(serverInstanceId, parentId),
      } satisfies WebSocketEvent<Record<string, unknown>>
    },
    heartbeat(kind: MessageHeartbeatKind, message: MessageHeartbeat | string, parentId?: string) {
      return {
        type: 'transport:connection:heartbeat',
        data: { kind, message, at: Date.now() },
        metadata: createEventMetadata(serverInstanceId, parentId),
      } satisfies WebSocketEvent<Record<string, unknown>>
    },
  }
}

/**
 * Checks whether an error came from AIRI websocket event envelope validation.
 *
 * Use when:
 * - Message handlers need to map invalid envelopes to protocol errors
 *
 * Expects:
 * - Parser code throws {@link AiriWebSocketEventFormatError} for envelope failures
 *
 * Returns:
 * - `true` when the error should become `ServerErrorMessages.invalidEventFormat`
 */
export function isAiriWebSocketEventFormatError(error: unknown): error is AiriWebSocketEventFormatError {
  return error instanceof AiriWebSocketEventFormatError
}

/**
 * Detects raw websocket heartbeat control frames surfaced as text payloads.
 *
 * Use when:
 * - A websocket runtime forwards ping/pong frames through the normal message callback
 * - The runtime should ignore transport heartbeats instead of treating them as protocol JSON
 *
 * Expects:
 * - Raw text payloads such as `ping` and `pong`
 *
 * Returns:
 * - The heartbeat kind when the text is a control frame, otherwise `undefined`
 */
export function heartbeatFrameFrom(text: string): MessageHeartbeatKind | undefined {
  if (text === MessageHeartbeatKind.Ping || text === MessageHeartbeatKind.Pong) {
    return text
  }
}

/**
 * Parses one AIRI websocket protocol event.
 *
 * Use when:
 * - Reading text messages from WebSocket peers
 *
 * Expects:
 * - SDK clients may send `superjson.stringify(...)`
 * - External clients may send plain JSON
 *
 * Returns:
 * - A WebSocket event with a string `type`
 */
export function parseEvent(text: string): WebSocketEvent {
  // NOTICE:
  // SDK clients send events using superjson.stringify, so websocket runtime code must
  // use superjson.parse instead of message.json() or plain JSON.parse first.
  // JSON.parse on a superjson-encoded string returns the wrapper object
  // `{ json: {...}, meta: {...} }` with no protocol `type`, which breaks routing.
  // Keep this until all AIRI websocket clients share one non-wrapper wire format.
  let parsed: WebSocketEvent | undefined
  try {
    parsed = parse<WebSocketEvent>(text)
  }
  catch {
    parsed = undefined
  }

  const potentialEvent = (parsed && typeof parsed === 'object' && 'type' in parsed)
    ? parsed
    : JSON.parse(text)

  if (
    !potentialEvent
    || typeof potentialEvent !== 'object'
    || !('type' in potentialEvent)
    || typeof potentialEvent.type !== 'string'
    || !('data' in potentialEvent)
    || !potentialEvent.data
    || typeof potentialEvent.data !== 'object'
    || Array.isArray(potentialEvent.data)
  ) {
    throw new AiriWebSocketEventFormatError()
  }

  return potentialEvent as WebSocketEvent
}

/**
 * Serializes one AIRI websocket protocol event.
 *
 * Use when:
 * - Sending AIRI events through WebSocket peers
 *
 * Expects:
 * - `event` is already protocol-shaped
 *
 * Returns:
 * - SuperJSON text payload matching existing runtime behavior
 */
export function stringifyEvent(event: WebSocketBaseEvent<string, unknown> | string) {
  return typeof event === 'string' ? event : stringify(event)
}

/**
 * Resolves the effective event delivery policy.
 *
 * Use when:
 * - Protocol defaults should be merged with route-level delivery overrides
 * - Routing needs to know whether the event should broadcast or target one consumer
 *
 * Expects:
 * - Route delivery to override protocol metadata field-by-field
 *
 * Returns:
 * - The merged broadcast/consumer delivery policy, or `undefined` when unrestricted
 */
export function resolveEventDelivery(event: WebSocketEvent): DeliveryConfig | undefined {
  const eventMetadata = getProtocolEventMetadata(event.type)
  const defaultDelivery = eventMetadata?.delivery
  const routeDelivery = event.route?.delivery

  if (!defaultDelivery && !routeDelivery) {
    return undefined
  }

  return {
    ...defaultDelivery,
    ...routeDelivery,
  }
}

/**
 * Creates event serializer hooks used by server websocket adapters.
 *
 * Use when:
 * - A gateway wants protocol-specific parsing, stringifying, and control-frame detection
 *
 * Expects:
 * - Callers route raw control frames before protocol events
 *
 * Returns:
 * - A reusable `server-ws/core` codec configured for AIRI events
 */
export function createEventSerializer() {
  return createEventCodec<WebSocketEvent>({
    parse: parseEvent,
    stringify: stringifyEvent,
    detectControlFrame: heartbeatFrameFrom,
  })
}

/**
 * Iterates event middlewares in declaration order until one returns a decision.
 *
 * Use when:
 * - The websocket runtime needs the first route decision from configured middleware
 *
 * Expects:
 * - Middleware functions are ordered by caller policy
 *
 * Returns:
 * - The first route decision, or `undefined` when no middleware decided
 */
export function forEachEventMiddlewares(input: {
  event: WebSocketEvent
  fromPeer: RouteContext['fromPeer']
  peers: Map<string, RouteContext['fromPeer']>
  destinations?: RouteContext['destinations']
  middleware: RouteMiddleware[]
}): RouteDecision | undefined {
  const context: RouteContext = {
    event: input.event,
    fromPeer: input.fromPeer,
    peers: input.peers,
    destinations: input.destinations,
  }

  for (const middleware of input.middleware) {
    const result = middleware(context)
    if (result) {
      return result
    }
  }
}

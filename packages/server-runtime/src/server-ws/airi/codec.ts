import type { WebSocketBaseEvent, WebSocketEvent } from '@proj-airi/server-shared/types'

import { MessageHeartbeatKind } from '@proj-airi/server-shared/types'
import { parse, stringify } from 'superjson'
import { check, objectWithRest, pipe, safeParse, string, unknown } from 'valibot'

const invalidAiriWebSocketEventFormatMessage = 'Invalid WebSocket event format.'

const eventDataSchema = pipe(
  unknown(),
  check(
    value => Boolean(value) && typeof value === 'object' && !Array.isArray(value),
    'Expected event data to be a non-array object.',
  ),
)

const eventEnvelopeSchema = objectWithRest({
  type: string(),
  data: eventDataSchema,
}, unknown())

interface InvalidEventErrorOptions {
  cause?: unknown
  source?: unknown
}

/** Error thrown when parsed websocket text is not an AIRI event envelope. */
export class InvalidEventError extends Error {
  readonly source?: unknown

  constructor(options: InvalidEventErrorOptions = {}) {
    super(invalidAiriWebSocketEventFormatMessage, { cause: options.cause })
    this.name = 'InvalidEventError'
    this.source = options.source
  }
}

/** Checks whether an error came from AIRI websocket event envelope validation. */
export function isInvalidEventError(error: unknown): error is InvalidEventError {
  return error instanceof InvalidEventError
}

/** Detects raw ping/pong text frames that should not enter the event protocol. */
export function heartbeatFrameFrom(text: string): MessageHeartbeatKind | undefined {
  if (text === MessageHeartbeatKind.Ping || text === MessageHeartbeatKind.Pong) {
    return text
  }
}

/** Parses one AIRI websocket protocol event from SuperJSON or plain JSON text. */
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

  const result = safeParse(eventEnvelopeSchema, potentialEvent)
  if (!result.success) {
    throw new InvalidEventError({ cause: result.issues, source: potentialEvent })
  }

  return potentialEvent as WebSocketEvent
}

/** Serializes one AIRI websocket protocol event with the existing SuperJSON wire format. */
export function stringifyEvent(event: WebSocketBaseEvent<string, unknown> | string) {
  return typeof event === 'string' ? event : stringify(event)
}

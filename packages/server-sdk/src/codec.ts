import type { WebSocketBaseEvent, WebSocketEvent } from '@proj-airi/server-shared/types'

import { parse, stringify } from 'superjson'
import { check, objectWithRest, pipe, safeParse, string, unknown } from 'valibot'

const invalidMessage = 'Invalid AIRI websocket message.'

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

/** Options for websocket message validation failures. */
export interface InvalidMessageErrorOptions {
  /** Original parser or validator failure that made the websocket message unusable. */
  cause?: unknown
  /** Parsed candidate event when available; otherwise the original websocket text. */
  source?: unknown
}

/** Error thrown when websocket text cannot be parsed as an AIRI event envelope. */
export class InvalidMessageError extends Error {
  readonly source?: unknown

  constructor(options: InvalidMessageErrorOptions = {}) {
    super(invalidMessage, { cause: options.cause })
    this.name = 'InvalidMessageError'
    this.source = options.source
  }
}

/** Parses one AIRI websocket protocol event from SuperJSON or plain JSON text. */
export function parseEvent<C = undefined>(text: string): WebSocketEvent<C> {
  let superJsonParsed: WebSocketEvent<C> | undefined
  let superJsonError: unknown

  try {
    superJsonParsed = parse<WebSocketEvent<C>>(text)
  }
  catch (error) {
    superJsonError = error
  }

  const potentialEvent = superJsonParsed && typeof superJsonParsed === 'object' && 'type' in superJsonParsed
    ? superJsonParsed
    : parsePlainJson(text, superJsonError)

  const result = safeParse(eventEnvelopeSchema, potentialEvent)
  if (!result.success) {
    throw new InvalidMessageError({ cause: result.issues, source: potentialEvent })
  }

  return potentialEvent as WebSocketEvent<C>
}

/** Serializes one AIRI websocket protocol event with SuperJSON. */
export function stringifyEvent<C = undefined>(
  event: WebSocketBaseEvent<string, unknown> | WebSocketEvent<C>,
) {
  return stringify(event)
}

function parsePlainJson(text: string, superJsonError: unknown): unknown {
  try {
    return JSON.parse(text)
  }
  catch (jsonError) {
    throw new InvalidMessageError({
      cause: superJsonError ?? jsonError,
      source: text,
    })
  }
}

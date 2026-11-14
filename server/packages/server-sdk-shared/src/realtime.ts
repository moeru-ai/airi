import type { AuthenticateRequest, AuthenticateResponse } from './v2'

import { defineInvokeEventa } from '@moeru/eventa'

import * as v from 'valibot'

export type { AuthenticateRequest, AuthenticateResponse } from './v2'
export { parseAuthenticateRequest, parseAuthenticateResponse } from './v2'

/**
 * The relay forwards a frame only when its Eventa event id starts with this prefix.
 *
 * The device contracts in `@proj-airi/realtime-protocol` use it. The server does not read the rest of the frame.
 */
export const RELAY_EVENT_PREFIX = 'proj-airi:realtime:'

/**
 * The largest frame that `/ws/v1/realtime` accepts, in bytes.
 *
 * The relay copies each frame to every device of the account and through Redis Pub/Sub. Control events are small.
 * Audio and video use the media connection.
 */
export const RELAY_MAX_FRAME_BYTES = 16 * 1024

/** The first frame on `/ws/v1/realtime`. The server joins the connection to the relay of the token owner. */
export const authenticate = defineInvokeEventa<AuthenticateResponse, AuthenticateRequest>('realtime:authenticate')

/** Room and device names become parts of a media room name and a participant identity. */
const NameSchema = v.pipe(v.string(), v.regex(/^[\w-]{1,64}$/))

export const CallAccessParamsSchema = v.object({ callId: NameSchema })

export const CallAccessRequestSchema = v.object({ deviceId: NameSchema })

export type CallAccessRequest = v.InferOutput<typeof CallAccessRequestSchema>

export const CallAccessSchema = v.object({
  /** The WebSocket URL of the media server. */
  url: v.string(),
  /** A short-lived token that lets this device join `room` and no other room. */
  token: v.string(),
  room: v.string(),
})

/** What a device needs to join the media room of one call. */
export type CallAccess = v.InferOutput<typeof CallAccessSchema>

/** Parses the response of `POST /api/v1/realtime/calls/:callId/access` on the client. */
export function parseCallAccess(response: unknown): CallAccess {
  return v.parse(CallAccessSchema, response)
}

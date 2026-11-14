import { defineEventa, defineInvokeEventa } from '@moeru/eventa'

import * as v from 'valibot'

import { IdSchema } from './device'

export const CallInviteSchema = v.object({
  /** The caller generates this id. Both sides use it to request media access and to match `callEnded`. */
  callId: IdSchema,
  /** The device id of the caller. */
  from: IdSchema,
})

export type CallInvite = v.InferOutput<typeof CallInviteSchema>

export const CallInviteResultSchema = v.variant('status', [
  v.object({ status: v.literal('accepted') }),
  v.object({
    status: v.literal('rejected'),
    /**
     * - `busy`: The host is in another call.
     * - `unavailable`: The host cannot run a call now, for example Hearing has no provider.
     */
    reason: v.picklist(['busy', 'unavailable']),
  }),
])

export type CallInviteResult = v.InferOutput<typeof CallInviteResultSchema>

export const CallEndedSchema = v.object({
  callId: IdSchema,
  /** The device id of the side that ended the call. */
  from: IdSchema,
  /**
   * - `hangup`: The user ended the call.
   * - `failed`: The side could not continue, for example the media connection did not recover.
   */
  reason: v.picklist(['hangup', 'failed']),
})

export type CallEnded = v.InferOutput<typeof CallEndedSchema>

/** Parses a call invite from another device. */
export function parseCallInvite(body: unknown): CallInvite {
  return v.parse(CallInviteSchema, body)
}

/** Parses the answer to a call invite from another device. */
export function parseCallInviteResult(body: unknown): CallInviteResult {
  return v.parse(CallInviteResultSchema, body)
}

/** Parses a `call:ended` body from another device. */
export function parseCallEnded(body: unknown): CallEnded {
  return v.parse(CallEndedSchema, body)
}

/**
 * Returns the invoke that asks one host to join a call.
 *
 * Every device of the account receives every frame, and an Eventa invoke handler always answers. The host device id
 * is therefore part of the event id, so only the invited host has a handler.
 *
 * The host answers `accepted` after it starts to join the media room. The caller must apply its own timeout.
 */
export function callInvite(hostDeviceId: string) {
  return defineInvokeEventa<CallInviteResult, CallInvite>(`proj-airi:realtime:call:invite:${hostDeviceId}`)
}

/**
 * Either side sends this when it leaves the call. The other side then leaves the media room.
 *
 * A side that loses its connection cannot send it. Each side must also end the call when the other participant
 * leaves the media room.
 */
export const callEnded = defineEventa<CallEnded>('proj-airi:realtime:call:ended')

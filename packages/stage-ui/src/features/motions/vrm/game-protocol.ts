import { defineEventa } from '@moeru/eventa'

import * as v from 'valibot'

const identifier = v.pipe(v.string(), v.minLength(1), v.maxLength(256))
const sessionId = v.pipe(v.number(), v.safeInteger(), v.minValue(0))
const correlation = { modelId: identifier, ownerId: identifier, sessionId, requestId: identifier }
const runtimeCorrelation = { ...correlation, instanceId: identifier }

/** Only named game gestures cross renderers. Animation assets, URLs, and controller options stay on the host. */
export const gameMotionRequestSchema = v.variant('type', [
  v.strictObject({ ...correlation, type: v.literal('reserve') }),
  v.strictObject({ ...runtimeCorrelation, type: v.literal('heartbeat') }),
  v.strictObject({ ...runtimeCorrelation, type: v.literal('release-session') }),
  v.strictObject({ ...runtimeCorrelation, type: v.literal('release-lease'), leaseId: identifier }),
  v.strictObject({
    ...runtimeCorrelation,
    type: v.literal('play'),
    leaseId: identifier,
    intentName: v.picklist(['wave', 'point', 'bow', 'celebrate', 'think', 'rock', 'paper', 'scissors', 'throw', 'catch']),
  }),
])

/** A reserve result pins the loaded instance. Later responses must match that instance and every request correlation key. */
export const gameMotionResultSchema = v.strictObject({
  ...runtimeCorrelation,
  type: v.picklist(['reserve', 'heartbeat', 'play']),
  accepted: v.boolean(),
})

/** Emergency stop, manipulation, model replacement, and expiry revoke the whole matching session reservation. */
export const gameMotionRevokedSchema = v.strictObject({
  modelId: identifier,
  instanceId: identifier,
  ownerId: identifier,
  sessionId,
})

export type GameMotionRequest = v.InferOutput<typeof gameMotionRequestSchema>
export type GameMotionResult = v.InferOutput<typeof gameMotionResultSchema>
export type GameMotionRevoked = v.InferOutput<typeof gameMotionRevokedSchema>

export const gameMotionRequest = defineEventa<GameMotionRequest>('airi:vrm-motion:game-request')
export const gameMotionResult = defineEventa<GameMotionResult>('airi:vrm-motion:game-result')
export const gameMotionRevoked = defineEventa<GameMotionRevoked>('airi:vrm-motion:game-revoked')

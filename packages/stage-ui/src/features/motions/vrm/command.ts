import * as v from 'valibot'

const identifier = v.pipe(v.string(), v.minLength(1), v.maxLength(256))
const finiteNumber = v.pipe(v.number(), v.finite())
const correlation = { modelId: identifier, requestId: identifier }

/** Runtime boundary for commands received from another renderer. */
export const motionCommandSchema = v.variant('type', [
  v.object({ ...correlation, type: v.literal('stop') }),
  v.object({
    ...correlation,
    type: v.literal('play'),
    motionId: identifier,
    options: v.object({
      mode: v.optional(v.picklist(['replace', 'queue'])),
      loop: v.optional(v.boolean()),
      speed: v.optional(finiteNumber),
      duration: v.optional(finiteNumber),
      radius: v.optional(finiteNumber),
    }),
  }),
])

export const motionCorrelationSchema = v.object(correlation)
export type MotionCommand = v.InferOutput<typeof motionCommandSchema>

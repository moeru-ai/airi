import * as v from 'valibot'

/** The submitted text and fixed routing labels captured before provider execution. These labels are not user authentication. */
export const chatRequestSchema = v.strictObject({
  sessionId: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
  turnId: v.pipe(v.string(), v.minLength(1), v.maxLength(256)),
  text: v.pipe(v.string(), v.maxLength(1_048_576)),
})

export type ChatRequestInput = v.InferOutput<typeof chatRequestSchema>

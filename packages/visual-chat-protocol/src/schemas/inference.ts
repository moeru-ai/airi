import * as v from 'valibot'

export const InferencePrefillRequestSchema = v.object({
  wavPath: v.string(),
  imagePath: v.optional(v.string()),
  cnt: v.number(),
})

export const InferenceDecodeResponseSchema = v.object({
  text: v.string(),
  audioOutDir: v.string(),
  wavFiles: v.array(v.string()),
  listenDetected: v.boolean(),
})

export type InferencePrefillRequest = v.InferOutput<typeof InferencePrefillRequestSchema>
export type InferenceDecodeResponse = v.InferOutput<typeof InferenceDecodeResponseSchema>

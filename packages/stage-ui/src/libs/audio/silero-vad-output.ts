import { Tensor } from '@huggingface/transformers'

import * as v from 'valibot'

// TODO:
// Apply this schema in the stage-web and stage-ui VAD workers.
// They still read the model output as `any`.
export const sileroVadOutputSchema = v.object({
  stateN: v.instance(Tensor),
  output: v.instance(Tensor),
})

export type SileroVadOutput = v.InferOutput<typeof sileroVadOutputSchema>

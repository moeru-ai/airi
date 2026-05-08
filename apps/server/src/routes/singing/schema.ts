import { boolean, number, object, optional, picklist, string } from 'valibot'

/**
 * [singing] Valibot schemas for singing API request validation.
 */

export const SeparatorSchema = object({
  backend: picklist(['melband', 'bs_roformer']),
  model: optional(string()),
})

export const PitchSchema = object({
  backend: picklist(['rmvpe']),
})

export const RvcConverterSchema = object({
  backend: picklist(['rvc'] as const),
  voiceId: string(),
  f0UpKey: optional(number()),
  indexRate: optional(number()),
  filterRadius: optional(number()),
  protect: optional(number()),
  rmsMixRate: optional(number()),
})

export const SeedVcConverterSchema = object({
  backend: picklist(['seedvc'] as const),
  referenceUri: string(),
  checkpoint: optional(string()),
  diffusionSteps: optional(number()),
  f0Condition: optional(boolean()),
  autoF0Adjust: optional(boolean()),
  semiToneShift: optional(number()),
})

export const MixSchema = object({
  vocalGainDb: optional(number()),
  instGainDb: optional(number()),
  ducking: optional(boolean()),
  targetLufs: optional(number()),
  truePeakDb: optional(number()),
})

const CoverSchemaBase = {
  mode: picklist(['rvc']),
  separator: SeparatorSchema,
  pitch: PitchSchema,
  converter: RvcConverterSchema,
  mix: optional(MixSchema),
  autoCalibrate: optional(boolean()),
}

/** For JSON requests — inputUri is required */
export const CreateCoverJsonSchema = object({
  inputUri: string(),
  ...CoverSchemaBase,
})

/** For multipart uploads — inputUri is provided by the server after saving the file */
export const CreateCoverMultipartSchema = object({
  ...CoverSchemaBase,
})

export const CreateCoverReferenceSchema = object({
  inputUri: string(),
  referenceUri: string(),
  mode: picklist(['seedvc']),
  separator: SeparatorSchema,
  pitch: PitchSchema,
  converter: SeedVcConverterSchema,
  mix: optional(MixSchema),
})

export const CreateTrainSchema = object({
  voiceId: string(),
  datasetUri: string(),
  epochs: optional(number()),
  batchSize: optional(number()),
})

export const CreateTrainMultipartSchema = object({
  voiceId: string(),
  epochs: optional(number()),
  batchSize: optional(number()),
})

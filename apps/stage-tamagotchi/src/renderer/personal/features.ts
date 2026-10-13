import type { InferOutput } from 'valibot'

import { boolean, integer, minValue, number, object, parse, pipe } from 'valibot'

import featuresJson from './features.json'

const featuresSchema = object({
  memory: object({
    enabled: boolean(),
    maxFacts: pipe(number(), integer(), minValue(1)),
  }),
  reminders: object({
    enabled: boolean(),
  }),
})

/** The settings in `features.json`. Parsing fails the build-time import early if a field is missing. */
export type FeaturesConfig = InferOutput<typeof featuresSchema>

export const featuresConfig: FeaturesConfig = parse(featuresSchema, featuresJson)

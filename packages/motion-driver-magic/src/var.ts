import type { VarFitOptions } from './shared/var'
import type { GeneratorOptions, Model as MotionModel, TrainingSequence } from './types'

import { fitVarParameters, toVarGenerator } from './shared/var'

/** Controls for one VAR fit. */
export type FitOptions = VarFitOptions

/** Stable measurements from one VAR fit. */
export interface Diagnostics {
  /** Number of fixed-rate source frames used by the fit. */
  sourceFrameCount: number
  /** Number of varying, non-duplicate motion channels. */
  channelCount: number
  /** Number of intercept and lag terms in each channel equation. */
  featureCount: number
  /** Root mean square of the normalized one-step residuals. */
  residualRootMeanSquare: number
}

/** A reusable VAR model. */
export type VarModel = MotionModel<'var', undefined, Diagnostics>

/** Creates a ridge-regularized VAR model from a fixed-rate motion sequence. */
export function createVarModel(sequence: TrainingSequence, options: FitOptions): VarModel {
  const parameters = fitVarParameters(sequence, options)
  const diagnostics: Diagnostics = Object.freeze({
    sourceFrameCount: parameters.sourceFrameCount,
    channelCount: parameters.channelCount,
    featureCount: parameters.featureCount,
    residualRootMeanSquare: parameters.residualRootMeanSquare,
  })

  return Object.freeze({
    method: 'var',
    sampleRateHz: parameters.sampleRateHz,
    diagnostics,
    toGenerator: (generatorOptions: GeneratorOptions) => toVarGenerator(parameters, generatorOptions),
  })
}

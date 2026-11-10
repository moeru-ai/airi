import type { FitOptions as ArHmmFitOptions, ArHmmModel } from './ar-hmm'
import type { TrainingSequence } from './types'
import type { FitOptions as VarFitOptions, VarModel } from './var'

import { createArHmmModel } from './ar-hmm'
import { createVarModel } from './var'

/** Selects one MAGIC method and supplies its fit controls. */
export type FitOptions
  = | ({ method: 'ar-hmm' } & ArHmmFitOptions)
    | ({ method: 'var' } & VarFitOptions)

/** A fitted model from any MAGIC method. */
export type MagicModel = ArHmmModel | VarModel

/** Fits one MAGIC model from a fixed-rate motion sequence. */
export function fit(sequence: TrainingSequence, options: { method: 'ar-hmm' } & ArHmmFitOptions): ArHmmModel
export function fit(sequence: TrainingSequence, options: { method: 'var' } & VarFitOptions): VarModel
export function fit(sequence: TrainingSequence, options: FitOptions): MagicModel
export function fit(sequence: TrainingSequence, options: FitOptions): MagicModel {
  if (options.method === 'var') {
    return createVarModel(sequence, {
      order: options.order,
      ridge: options.ridge,
    })
  }

  return createArHmmModel(sequence, {
    stateCount: options.stateCount,
    order: options.order,
    ridge: options.ridge,
    iterations: options.iterations,
  })
}

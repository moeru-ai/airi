import { defineInvokeEventa } from '@moeru/eventa'

export interface NormalInferenceResult {
  png: string
  model: string
  revision: string
  steps: number
  seed: number
  seconds: number
  device: string
}

export const normalInferenceStatus = defineInvokeEventa<{ available: boolean, reason?: string }>('live2d:normal:local-status')
/** PNG data URL in, encoded PNG out. Neither side accepts file paths from the renderer. */
export const normalInference = defineInvokeEventa<NormalInferenceResult, { png: string }>('live2d:normal:infer')

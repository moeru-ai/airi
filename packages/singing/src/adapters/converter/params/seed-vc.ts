/**
 * Default Seed-VC inference parameters.
 * Field names aligned with Seed-VC CLI conventions.
 */
export interface SeedVcParams {
  diffusionSteps: number
  f0Condition: boolean
  autoF0Adjust: boolean
  semiToneShift: number
  checkpoint: string
}

export const DEFAULT_SEED_VC_PARAMS: SeedVcParams = {
  diffusionSteps: 40,
  f0Condition: true,
  autoF0Adjust: false,
  semiToneShift: 0,
  checkpoint: 'seed-uvit-whisper-base',
}

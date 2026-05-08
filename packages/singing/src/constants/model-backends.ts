/**
 * Available backend identifiers for each pipeline stage.
 * Used in job requests and manifests to specify which implementation to use.
 */
export enum SeparatorBackendId {
  MelBandRoFormer = 'melband',
  BSRoFormer = 'bs_roformer',
}

export enum PitchBackendId {
  RMVPE = 'rmvpe',
}

export enum ConverterBackendId {
  RVC = 'rvc',
  SeedVC = 'seedvc',
}

/** Default separator model for MelBand-RoFormer */
export const DEFAULT_MELBAND_MODEL = 'melband-roformer-kim-vocals'

/** Default separator model for BS-RoFormer (6-stem) */
export const DEFAULT_BS_ROFORMER_MODEL = 'BS-RoFormer-SW'

/** Default pitch extraction method */
export const DEFAULT_PITCH_METHOD = PitchBackendId.RMVPE

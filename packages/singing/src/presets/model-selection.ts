import { ConverterBackendId, DEFAULT_BS_ROFORMER_MODEL, DEFAULT_MELBAND_MODEL, SeparatorBackendId } from '../constants/model-backends'

/**
 * Helper to select the appropriate separator model based on use case.
 */
export function selectSeparatorModel(
  backend: SeparatorBackendId,
  customModel?: string,
): string {
  if (customModel)
    return customModel
  switch (backend) {
    case SeparatorBackendId.MelBandRoFormer:
      return DEFAULT_MELBAND_MODEL
    case SeparatorBackendId.BSRoFormer:
      return DEFAULT_BS_ROFORMER_MODEL
    default:
      return DEFAULT_MELBAND_MODEL
  }
}

/**
 * Check if the given converter backend requires a reference audio.
 */
export function requiresReferenceAudio(backend: ConverterBackendId): boolean {
  return backend === ConverterBackendId.SeedVC
}

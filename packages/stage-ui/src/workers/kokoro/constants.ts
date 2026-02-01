/**
 * Kokoro TTS Constants
 * Centralized constants for Kokoro TTS to avoid duplication
 */

/**
 * Platform types for Kokoro models
 */
export type KokoroPlatform = 'webgpu' | 'wasm'

/**
 * Kokoro model definition
 */
export interface KokoroModel {
  /** Model identifier/quantization string */
  id: string
  /** Human-readable name */
  name: string
  /** Platform required to run this model */
  platform: KokoroPlatform
  /** Quantization value to pass to loadModel */
  quantization: string
  /** i18n key for model description */
  descriptionKey: string
}

/**
 * Available Kokoro models with their platform requirements
 */
export const KOKORO_MODELS = [
  {
    id: 'fp32-webgpu',
    name: 'FP32 (WebGPU)',
    platform: 'webgpu',
    quantization: 'fp32',
    descriptionKey: 'settings.pages.providers.provider.kokoro-local.models.fp32-webgpu.description',
  },
  {
    id: 'fp32',
    name: 'FP32 (WASM)',
    platform: 'wasm',
    quantization: 'fp32',
    descriptionKey: 'settings.pages.providers.provider.kokoro-local.models.fp32.description',
  },
  {
    id: 'fp16',
    name: 'FP16 (WASM)',
    platform: 'wasm',
    quantization: 'fp16',
    descriptionKey: 'settings.pages.providers.provider.kokoro-local.models.fp16.description',
  },
  {
    id: 'q8',
    name: 'Q8 (WASM)',
    platform: 'wasm',
    quantization: 'q8',
    descriptionKey: 'settings.pages.providers.provider.kokoro-local.models.q8.description',
  },
  {
    id: 'q4',
    name: 'Q4 (WASM)',
    platform: 'wasm',
    quantization: 'q4',
    descriptionKey: 'settings.pages.providers.provider.kokoro-local.models.q4.description',
  },
  {
    id: 'q4f16',
    name: 'Q4F16 (WASM)',
    platform: 'wasm',
    quantization: 'q4f16',
    descriptionKey: 'settings.pages.providers.provider.kokoro-local.models.q4f16.description',
  },
] as const

/**
 * Type for Kokoro quantization options
 */
export type KokoroQuantization = typeof KOKORO_MODELS[number]['id']

/**
 * Convert Kokoro models to ModelInfo array
 * @param hasWebGPU - Whether WebGPU is available (filters out WebGPU models if false)
 * @param t - Optional translation function for i18n support
 * @returns Array of ModelInfo objects
 */
export function kokoroModelsToModelInfo(hasWebGPU: boolean, t?: (key: string) => string) {
  return KOKORO_MODELS
    .filter(model => hasWebGPU || model.platform !== 'webgpu')
    .map(model => ({
      id: model.id,
      name: model.name,
      provider: 'kokoro-local',
      description: t ? t(model.descriptionKey) : model.descriptionKey,
    }))
}

/**
 * Get the default model based on WebGPU availability
 * @param hasWebGPU - Whether WebGPU is available
 * @returns The default model to use
 */
export function getDefaultKokoroModel(hasWebGPU: boolean): KokoroQuantization {
  return hasWebGPU ? 'fp32-webgpu' : 'q4f16'
}

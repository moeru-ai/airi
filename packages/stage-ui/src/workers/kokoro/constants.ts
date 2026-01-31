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
  /** Model description */
  description: string
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
    description: 'Full precision model using WebGPU - Recommended for supported devices',
  },
  {
    id: 'fp32',
    name: 'FP32 (WASM)',
    platform: 'wasm',
    quantization: 'fp32',
    description: 'Full precision model - Highest quality but largest size',
  },
  {
    id: 'fp16',
    name: 'FP16',
    platform: 'wasm',
    quantization: 'fp16',
    description: 'Half precision - Good balance of quality and size',
  },
  {
    id: 'q8',
    name: 'Q8',
    platform: 'wasm',
    quantization: 'q8',
    description: '8-bit quantized - Good quality with reduced size',
  },
  {
    id: 'q4',
    name: 'Q4',
    platform: 'wasm',
    quantization: 'q4',
    description: '4-bit quantized - Smallest size, lower quality',
  },
  {
    id: 'q4f16',
    name: 'Q4F16',
    platform: 'wasm',
    quantization: 'q4f16',
    description: '4-bit with FP16 - Recommended for most devices',
  },
] as const

/**
 * Type for Kokoro quantization options
 */
export type KokoroQuantization = typeof KOKORO_MODELS[number]['id']

/**
 * Convert Kokoro models to ModelInfo array
 * @param hasWebGPU - Whether WebGPU is available (filters out WebGPU models if false)
 * @returns Array of ModelInfo objects
 */
export function kokoroModelsToModelInfo(hasWebGPU: boolean) {
  return KOKORO_MODELS
    .filter(model => hasWebGPU || model.platform !== 'webgpu')
    .map(model => ({
      id: model.id,
      name: model.name,
      provider: 'kokoro-local',
      description: model.description,
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

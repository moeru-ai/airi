/**
 * Kokoro TTS Constants
 * Centralized constants for Kokoro TTS to avoid duplication
 */

/**
 * Default voice for Kokoro TTS
 */
export const KOKORO_DEFAULT_VOICE = 'af_bella'

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
  /** Platform required to run this model */
  platform: KokoroPlatform
}

/**
 * Available Kokoro models with their platform requirements
 */
export const KOKORO_MODELS = [
  { id: 'fp32-webgpu', platform: 'webgpu' },
  { id: 'fp32', platform: 'wasm' },
  { id: 'fp16', platform: 'wasm' },
  { id: 'q8', platform: 'wasm' },
  { id: 'q4', platform: 'wasm' },
  { id: 'q4f16', platform: 'wasm' },
] as const

/**
 * Type for Kokoro quantization options
 */
export type KokoroQuantization = typeof KOKORO_MODELS[number]['id']

/**
 * Timeout duration for Kokoro TTS generation in milliseconds (2 minutes)
 */
export const GENERATION_TIMEOUT_MS = 120000

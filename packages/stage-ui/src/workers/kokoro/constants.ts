/**
 * Kokoro TTS Constants
 * Centralized constants for Kokoro TTS to avoid duplication
 */

import type { WebGPUCapabilities } from '@proj-airi/stage-shared/webgpu'

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
 * Available Kokoro models with their platform requirements.
 *
 * Ordering is the dropdown order: WebGPU group first (the faster device, holds
 * the default), then the WASM group; within each group, lightest/fastest
 * quantization first (q4) up to full precision (fp32).
 */
export const KOKORO_MODELS = [
  // WebGPU group. kokoro-js recommends dtype="fp32" for webgpu, but the lighter
  // int8 / int4 weights synthesize faster (which helps stay under the generate
  // inactivity timeout) and run on baseline WebGPU compute — no `shader-f16`
  // feature required (unlike fp16-webgpu).
  {
    id: 'q4-webgpu',
    name: 'Q4 (WebGPU)',
    platform: 'webgpu',
    quantization: 'q4',
    descriptionKey: 'settings.pages.providers.provider.kokoro-local.models.q4-webgpu.description',
  },
  {
    id: 'q8-webgpu',
    name: 'Q8 (WebGPU)',
    platform: 'webgpu',
    quantization: 'q8',
    descriptionKey: 'settings.pages.providers.provider.kokoro-local.models.q8-webgpu.description',
  },
  {
    id: 'fp16-webgpu',
    name: 'FP16 (WebGPU)',
    platform: 'webgpu',
    quantization: 'fp16',
    descriptionKey: 'settings.pages.providers.provider.kokoro-local.models.fp16-webgpu.description',
  },
  {
    id: 'fp32-webgpu',
    name: 'FP32 (WebGPU)',
    platform: 'webgpu',
    quantization: 'fp32',
    descriptionKey: 'settings.pages.providers.provider.kokoro-local.models.fp32-webgpu.description',
  },
  // WASM group, same lightest → full-precision ordering. q4f16 (4-bit weights,
  // fp16 compute) sits just above pure q4.
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
  {
    id: 'q8',
    name: 'Q8 (WASM)',
    platform: 'wasm',
    quantization: 'q8',
    descriptionKey: 'settings.pages.providers.provider.kokoro-local.models.q8.description',
  },
  {
    id: 'fp16',
    name: 'FP16 (WASM)',
    platform: 'wasm',
    quantization: 'fp16',
    descriptionKey: 'settings.pages.providers.provider.kokoro-local.models.fp16.description',
  },
  {
    id: 'fp32',
    name: 'FP32 (WASM)',
    platform: 'wasm',
    quantization: 'fp32',
    descriptionKey: 'settings.pages.providers.provider.kokoro-local.models.fp32.description',
  },
] as const

/**
 * Type for Kokoro quantization options
 */
export type KokoroQuantization = typeof KOKORO_MODELS[number]['id']

/**
 * Resolve `hasWebGPU` from cached capabilities, falling back to a `navigator.gpu`
 * presence probe when detection has not been awaited yet (cold cache). The probe
 * cannot tell apart fp16/quantization sub-features, so those default to false
 * until the real detection result is cached.
 */
function hasWebGPUFrom(caps: WebGPUCapabilities | null): boolean {
  return caps?.supported ?? (typeof navigator !== 'undefined' && !!navigator.gpu)
}

/**
 * Convert Kokoro models to ModelInfo array, filtered by what the current WebGPU
 * device can actually run.
 *
 * Use when:
 * - Populating the Kokoro model dropdown / provider `listModels` result.
 *
 * Expects:
 * - `caps` is the result of `getCachedWebGPUCapabilities()` (or `null` if
 *   detection has not run — treated as a cold-cache `navigator.gpu` probe).
 *
 * Returns:
 * - ModelInfo objects for every model whose device + quantization the adapter
 *   supports: `webgpu` models require WebGPU; `fp16-webgpu` additionally needs
 *   `fp16Supported` (the `shader-f16` feature). The int8 / int4 webgpu variants
 *   need only baseline WebGPU compute, so the `webgpu` device gate covers them.
 */
export function kokoroModelsToModelInfo(caps: WebGPUCapabilities | null, t?: (key: string) => string) {
  const hasWebGPU = hasWebGPUFrom(caps)
  return KOKORO_MODELS
    .filter((model) => {
      if (model.platform === 'webgpu' && !hasWebGPU)
        return false
      // fp16 (and the fp16-compute q4f16) need the `shader-f16` feature; the
      // int8 / int4 webgpu variants run on baseline WebGPU compute (no extra gate).
      if (model.id === 'fp16-webgpu' && !caps?.fp16Supported)
        return false
      return true
    })
    .map(model => ({
      id: model.id,
      name: model.name,
      provider: 'kokoro-local',
      description: t ? t(model.descriptionKey) : model.descriptionKey,
    }))
}

/**
 * Get the default model based on WebGPU availability.
 *
 * @param caps - Cached WebGPU capabilities (or `null` before detection has run).
 * @returns The default model id to use.
 */
export function getDefaultKokoroModel(caps: WebGPUCapabilities | null): KokoroQuantization {
  // On WebGPU prefer fp16 when the `shader-f16` feature is present, else fp32 —
  // the precise/robust path kokoro-js recommends for webgpu. The lighter q4/q8
  // webgpu variants are offered as opt-in options, not the default.
  if (hasWebGPUFrom(caps))
    return caps?.fp16Supported ? 'fp16-webgpu' : 'fp32-webgpu'
  return 'q4f16'
}

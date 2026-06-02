/**
 * web-rwkv (RWKV) in-browser inference constants.
 *
 * Mirrors the shape of `workers/kokoro/constants.ts`: a static catalog of
 * selectable models plus pure helpers that turn that catalog into the
 * provider-facing `ModelInfo[]` and pick a sensible default. None of this
 * touches the worker/main wire contract, so it is unaffected by the
 * inference-worker migration in PR #1917 (which only rewrites the transport
 * between the inference adapters and their worker entry points).
 *
 * Package: `@cryscan/web-rwkv-wasm` - a pure-WebGPU RWKV implementation. The
 * compute path is WebGPU-only (there is no WASM/CPU fallback for inference),
 * so every model here requires `navigator.gpu`.
 */

/**
 * Quantization strategy for a web-rwkv session.
 *
 * web-rwkv quantizes *by layer count from layer 0* (`Session.from_reader`
 * takes `quant` / `quant_nf4` / `quant_sf4` = the number of Int8 / NF4 / SF4
 * layers). The concrete layer counts depend on the loaded model's
 * `info().num_layer`, which is only known after the weights are read, so the
 * catalog records the *intent* and the worker resolves it to layer counts at
 * load time.
 *
 * - `'fp16'`: full f16, no quantization (`0, 0, 0`).
 * - `'int8'`: quantize all layers to Int8 - roughly half the VRAM of f16.
 * - `'nf4'`: quantize all layers to NF4 - smallest footprint, lowest fidelity.
 */
export type RwkvQuantization = 'fp16' | 'int8' | 'nf4'

/**
 * A selectable RWKV checkpoint.
 */
export interface RwkvModel {
  /** Stable model identifier used as the provider model id. */
  id: string
  /** Human-readable name shown in the model picker. */
  name: string
  /** RWKV architecture version of the checkpoint. */
  version: 'v4' | 'v5' | 'v6' | 'v7'
  /** Approximate parameter count, for display only (e.g. `'0.1B'`). */
  params: string
  /** URL of the f16 `safetensors` weights to fetch. */
  modelUrl: string
  /** Quantization applied when creating the session. */
  quantization: RwkvQuantization
  /** i18n key for the model description. */
  descriptionKey: string
}

/**
 * Shared RWKV "World" tokenizer vocabulary.
 *
 * All RWKV World checkpoints share the same trie tokenizer vocab; web-rwkv's
 * `Tokenizer` is constructed from this JSON string. This is the same
 * `rwkv_vocab_v20230424.json` that powers the official `web-rwkv-puzzles`
 * demos.
 */
export const RWKV_VOCAB_URL = 'https://raw.githubusercontent.com/cryscan/web-rwkv-puzzles/main/assets/rwkv_vocab_v20230424.json'

// NOTICE:
// `quantization` here only reduces *VRAM*, not *download size*. web-rwkv reads
// f16 `safetensors` and quantizes on-device at load time (`Session.from_reader`,
// see workers/rwkv/engine.ts), so an `int8`/`nf4` entry still downloads the full
// f16 weights below (~3 GB for 1.5B, ~5.9 GB for 2.9B) before quantizing in the GPU.
// The catalog records the *intent*; the worker resolves layer counts at load.
//
// These are the RWKV-7 "G1" reasoning-tuned checkpoints (the series the model
// authors recommend for chat over the base World models), in web-rwkv-ready f16
// safetensors. The lineup mixes the latest sub-iteration available per size
// (g1d/g1/g1g) — exact checkpoint dates are encoded in the URLs. Prompting must
// follow the G1x chat templates (see workers/rwkv/prompt.ts).
// Source/context: mollysama/rwkv-mobile-models `WebRWKV/` (web-rwkv-prepared)
// and https://github.com/BlinkDL/RWKV-LM/blob/main/RWKV-v7/RWKV7-G1x-templates.txt.
export const RWKV_MODELS = [
  // NOTICE:
  // Model ids are intentionally dot-free (`100m`, not `0.1b`). The
  // `descriptionKey` derived from the id is a vue-i18n message path, and
  // vue-i18n splits paths on `.`, so a dot in the id would resolve to a wrong
  // nested key. Human-readable sizes live in `name`/`params` instead.
  {
    id: 'rwkv7-g1-100m-fp16',
    name: 'RWKV-7 G1 0.1B (FP16)',
    version: 'v7',
    params: '0.1B',
    modelUrl: 'https://huggingface.co/mollysama/rwkv-mobile-models/resolve/main/WebRWKV/rwkv7-g1d-0.1b-20260129-ctx8192.st',
    quantization: 'fp16',
    descriptionKey: 'settings.pages.providers.provider.rwkv-local.models.rwkv7-g1-100m-fp16.description',
  },
  {
    id: 'rwkv7-g1-400m-fp16',
    name: 'RWKV-7 G1 0.4B (FP16)',
    version: 'v7',
    params: '0.4B',
    modelUrl: 'https://huggingface.co/mollysama/rwkv-mobile-models/resolve/main/WebRWKV/rwkv7-g1-0.4b-20250324-ctx4096.st',
    quantization: 'fp16',
    descriptionKey: 'settings.pages.providers.provider.rwkv-local.models.rwkv7-g1-400m-fp16.description',
  },
  {
    id: 'rwkv7-g1-1b5-int8',
    name: 'RWKV-7 G1 1.5B (Int8)',
    version: 'v7',
    params: '1.5B',
    modelUrl: 'https://huggingface.co/mollysama/rwkv-mobile-models/resolve/main/WebRWKV/rwkv7-g1g-1.5b-20260526-ctx8192.st',
    quantization: 'int8',
    descriptionKey: 'settings.pages.providers.provider.rwkv-local.models.rwkv7-g1-1b5-int8.description',
  },
  {
    id: 'rwkv7-g1-2b9-nf4',
    name: 'RWKV-7 G1 2.9B (NF4)',
    version: 'v7',
    params: '2.9B',
    modelUrl: 'https://huggingface.co/mollysama/rwkv-mobile-models/resolve/main/WebRWKV/rwkv7-g1g-2.9b-20260526-ctx8192.st',
    quantization: 'nf4',
    descriptionKey: 'settings.pages.providers.provider.rwkv-local.models.rwkv7-g1-2b9-nf4.description',
  },
] as const satisfies readonly RwkvModel[]

/** Union of valid RWKV model ids. */
export type RwkvModelId = typeof RWKV_MODELS[number]['id']

/**
 * Convert the RWKV catalog to provider-facing `ModelInfo`.
 *
 * Before:
 * - `RWKV_MODELS` entries (catalog rows with i18n description keys)
 *
 * After:
 * - `ModelInfo[]` with translated descriptions, scoped to the `rwkv-local`
 *   provider. When WebGPU is unavailable the list is empty, because web-rwkv
 *   has no non-WebGPU compute path.
 *
 * @param hasWebGPU - Whether `navigator.gpu` is usable; gates the whole list.
 * @param t - Optional translator; falls back to the raw i18n key when absent.
 */
export function rwkvModelsToModelInfo(hasWebGPU: boolean, t?: (key: string) => string) {
  if (!hasWebGPU)
    return []

  return RWKV_MODELS.map(model => ({
    id: model.id,
    name: model.name,
    provider: 'rwkv-local',
    description: t ? t(model.descriptionKey) : model.descriptionKey,
  }))
}

/**
 * Pick the default model for the current device.
 *
 * Prefers the smallest f16 checkpoint so the first run downloads and compiles
 * quickly; returns `undefined` when WebGPU is unavailable (nothing is runnable).
 *
 * @param hasWebGPU - Whether `navigator.gpu` is usable.
 */
export function getDefaultRwkvModel(hasWebGPU: boolean): RwkvModelId | undefined {
  if (!hasWebGPU)
    return undefined

  return 'rwkv7-g1-100m-fp16'
}

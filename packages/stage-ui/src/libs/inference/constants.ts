/**
 * Centralized constants for the inference pipeline.
 *
 * Model IDs, timeout values, and retry parameters shared across
 * all adapters and workers.
 */

// ---------------------------------------------------------------------------
// Model IDs
// ---------------------------------------------------------------------------

/** HuggingFace model repository identifiers */
export const MODEL_IDS = {
  KOKORO: 'onnx-community/Kokoro-82M-v1.0-ONNX',
  WHISPER: 'onnx-community/whisper-large-v3-turbo',
  BG_REMOVAL: 'Xenova/modnet',
} as const

/** Short model identifiers used in adapter state tracking and logging */
export const MODEL_NAMES = {
  KOKORO: 'kokoro-82m',
  WHISPER: 'whisper-large-v3-turbo',
  BG_REMOVAL: 'modnet',
  WEB_RWKV: 'web-rwkv',
} as const

/**
 * Whisper models the local transcription provider offers. The `id` is the
 * Hugging Face repo passed straight to the worker's load request, so no id↔repo
 * mapping is needed. Larger = more accurate but slower / bigger download.
 */
export const WHISPER_MODELS = [
  { id: 'onnx-community/whisper-large-v3-turbo', name: 'Whisper Large V3 Turbo', description: 'Most accurate. ~800 MB download on first use.' },
  { id: 'onnx-community/whisper-small', name: 'Whisper Small', description: 'Faster and lighter (~480 MB), good accuracy. Multilingual.' },
] as const

/** Default Whisper model id (matches {@link MODEL_IDS}.WHISPER). */
export const DEFAULT_WHISPER_MODEL: typeof WHISPER_MODELS[number]['id'] = 'onnx-community/whisper-large-v3-turbo'

/**
 * Local web-rwkv (WebGPU RWKV) chat models. `id` is the model's `.safetensors`
 * URL in web-rwkv layout (RWKV-native tensor names). bf16/f32 weights are cast
 * to f16 at load (web-rwkv's loader only reads f16). Hosted on Hugging Face,
 * which supports HTTP Range so large models can stream tensor-by-tensor.
 */
export const WEB_RWKV_MODELS = [
  {
    id: 'https://huggingface.co/DanielClough/rwkv7-g1-safetensors/resolve/main/rwkv7-g1d-0.1b-20260129-ctx8192.safetensors',
    name: 'base-extra-small',
    description: 'RWKV-7 G1 0.1B (ctx8192). Tiny "World" chat model (~190 MB) — fastest, lowest quality. Downloads on first use; bf16→f16 at load.',
  },
  {
    id: 'https://huggingface.co/DanielClough/rwkv7-g1-safetensors/resolve/main/rwkv7-g1d-1.5b-20260212-ctx8192.safetensors',
    name: 'base-small',
    description: 'RWKV-7 G1 1.5B (ctx8192). Mid-size chat model (~2.9 GB) — better quality, larger first-use download and VRAM footprint.',
  },
  {
    id: 'https://huggingface.co/DanielClough/rwkv7-g1-safetensors/resolve/main/rwkv7-g1d-2.9b-20260131-ctx8192.safetensors',
    name: 'base-medium',
    description: 'RWKV-7 G1 2.9B (ctx8192). Best quality of the presets (~5.6 GB) — largest first-use download and VRAM footprint.',
  },
] as const

/**
 * Default web-rwkv model URL — the lightweight `base-extra-small` (0.1B).
 *
 * Kept to the smallest model on purpose: this is the fallback the background
 * preloader auto-downloads when web-rwkv is enabled without an explicit choice,
 * so it must stay cheap. Larger presets (`base-small`, `base-medium`) are offered
 * as picks, not the default.
 */
export const DEFAULT_WEB_RWKV_MODEL: string = WEB_RWKV_MODELS[0].id

/**
 * Default RWKV World tokenizer vocab URL (rwkv_vocab_v20230424).
 *
 * Pinned to a specific commit so the file cannot shift under a running app.
 * Content verified identical to the previously bundled copy (same JSON after
 * whitespace normalization; normalized SHA-256:
 * da91c22aab04108e5fbb4ef26a01443368b2b74c1a08d42b8d2d4c55f86f529d).
 */
export const DEFAULT_VOCAB_URL = 'https://raw.githubusercontent.com/koute/rwkv_tokenizer/bb653af4509940408b7322dae2d57454ea8b3bcf/rwkv_vocab_v20230424.json'

/**
 * Default sampling parameters for web-rwkv generation.
 *
 * Shared by the provider (to fill any field an incoming request omits) and the
 * settings UI (per-field placeholders + the reset action), so the two never drift.
 *
 * These are the community RWKV-7 "G1" recommendations, fed straight to the wasm
 * `NucleusSampler` with no OpenAI-style transform. The sampler applies the
 * penalties and top-p, then reshapes by temperature (RWKV's native order), so the
 * values mean exactly what the RWKV recipe intends. `topK` is applied in the worker
 * (the wasm sampler has no native top-k); `0` disables it, leaving pure nucleus
 * (top-p) sampling.
 */
export const WEB_RWKV_SAMPLING_DEFAULTS = {
  /** Sampling temperature; lower = more deterministic. */
  temperature: 0.6,
  /** Nucleus (top-p) cumulative-probability cutoff. */
  topP: 0.7,
  /** Top-k truncation applied (in the worker) before top-p; `0` disables it. */
  topK: 0,
  /** Hard cap on generated tokens. */
  maxTokens: 512,
  /** Presence penalty (penalize any token already seen). */
  presencePenalty: 2.0,
  /** Repetition count penalty (penalize by occurrence count). */
  countPenalty: 0.2,
  /** Per-step decay applied to accumulated occurrence penalties. */
  penaltyDecay: 0.99,
} as const

// ---------------------------------------------------------------------------
// Timeouts (ms)
// ---------------------------------------------------------------------------

export const TIMEOUTS = {
  /** Kokoro model load timeout (absolute; download/compile may be slow) */
  KOKORO_LOAD: 120_000,
  /**
   * Time-to-first-segment budget for Kokoro generation, armed at stream start.
   * Covers warmup + synthesizing the first sentence (slow on the fp32/CPU path),
   * so a working-but-slow first segment is not mistaken for a wedged worker.
   * See {@link createIdleTimeout}.
   */
  KOKORO_GENERATE_FIRST_CHUNK: 30_000,
  /**
   * Inter-segment inactivity budget for Kokoro generation, used after the first
   * segment proves the worker alive. A mid-stream wedge is caught within this
   * gap and the worker is restarted.
   *
   * Tighter than the first-chunk budget: once the model is warm, per-sentence
   * segments arrive in well under a second on WebGPU (and a few seconds on the
   * slow WASM/CPU path), so a 5s silence reliably means a wedged worker rather
   * than slow-but-progressing synthesis. Raise it if very long sentences on slow
   * CPU/WASM hardware trip false-positive restarts.
   */
  KOKORO_GENERATE_IDLE: 5_000,

  /** Whisper model load timeout (absolute; larger model, allow more time) */
  WHISPER_LOAD: 180_000,
  /**
   * Time-to-first-output budget for Whisper transcription, armed at stream
   * start. Covers encoding the audio + the first decoded token, so a slow
   * initial encode is not mistaken for a wedged worker.
   */
  WHISPER_TRANSCRIBE_FIRST_CHUNK: 30_000,
  /**
   * Inter-token inactivity budget for Whisper transcription, used after the
   * first progress item. Whisper streams tokens frequently, so a mid-stream
   * wedge is caught quickly.
   */
  WHISPER_TRANSCRIBE_IDLE: 10_000,

  /** Background removal model load timeout (absolute) */
  BG_REMOVAL_LOAD: 120_000,
  /** Background removal per-image processing timeout (absolute; unary op) */
  BG_REMOVAL_PROCESS: 60_000,

  /**
   * Time-to-first-progress budget for web-rwkv model load, armed when the load
   * stream opens. Covers the initial HTTP probe + safetensors header fetch before
   * the first tensor conversion progress event.
   * See {@link createIdleTimeout}.
   */
  WEB_RWKV_LOAD_FIRST_PART: 60_000,
  /**
   * Inter-part inactivity budget for web-rwkv model load, used after the first
   * progress event proves the download is active. Sized to accommodate large
   * (~128 MiB) coalesced Range chunks on slow connections — a 10 Mbps link takes
   * ~100s per chunk, so a 2-min silence reliably indicates a stalled CDN or
   * network failure rather than slow-but-active transfer.
   * See {@link createIdleTimeout}.
   */
  WEB_RWKV_LOAD_IDLE: 120_000,
  /**
   * Time-to-first-token budget for web-rwkv generation, armed at stream start.
   * Covers prompt ingestion (a long chat history processed token-by-token) before
   * the first output token, so a working-but-slow prefill is not mistaken for a wedge.
   */
  WEB_RWKV_GENERATE_FIRST_CHUNK: 60_000,
  /**
   * Inter-token inactivity budget for web-rwkv generation, used after the first
   * token proves the worker alive. RWKV streams tokens steadily, so a mid-stream
   * wedge is caught within this gap.
   */
  WEB_RWKV_GENERATE_IDLE: 15_000,
} as const

// ---------------------------------------------------------------------------
// Restart / Retry
// ---------------------------------------------------------------------------

/** Maximum number of automatic worker restarts before giving up */
export const MAX_RESTARTS = 3

/** Base delay in ms between restart attempts (multiplied by attempt number) */
export const RESTART_DELAY_MS = 1_000

// ---------------------------------------------------------------------------
// Device loss resilience
// ---------------------------------------------------------------------------

/**
 * Number of WebGPU device-loss events an adapter tolerates before proactively
 * promoting subsequent loads to WASM. A single device loss may be transient
 * (driver reset, GPU process crash), but repeated losses indicate the WebGPU
 * path is unreliable on this device and WASM is safer.
 */
export const DEVICE_LOSS_WASM_THRESHOLD = 2

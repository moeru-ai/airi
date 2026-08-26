/**
 * Reactive inference model status composable.
 *
 * Provides a centralised, reactive view of all inference models
 * (Kokoro TTS, Whisper ASR, background removal, etc.) so UI
 * components can display loading progress and state without
 * coupling to individual adapters.
 */

import type { ErrorPayload, ProgressPayload } from '../libs/inference/protocol'

import { computed, reactive } from 'vue'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InferenceModelState
  = | 'compiling'
    | 'downloading'
    | 'error'
    | 'idle'
    | 'ready'
    | 'running'
    | 'warming-up'

export interface InferenceModelStatus {
  device: 'cpu' | 'unknown' | 'wasm' | 'webgpu'
  error?: ErrorPayload
  modelId: string
  progress?: ProgressPayload
  state: InferenceModelState
}

// ---------------------------------------------------------------------------
// Shared state (module-scoped singleton)
// ---------------------------------------------------------------------------

const statusMap = reactive(new Map<string, InferenceModelStatus>())

// ---------------------------------------------------------------------------
// Mutation API (used by adapters)
// ---------------------------------------------------------------------------

/**
 * Remove a model from the status map (e.g. when unloaded).
 */
export function removeInferenceStatus(modelId: string): void {
  statusMap.delete(modelId)
}

/**
 * Update the status of an inference model.
 * Called by adapters to push state changes into the shared status map.
 */
export function updateInferenceStatus(
  modelId: string,
  update: Partial<Omit<InferenceModelStatus, 'modelId'>>,
): void {
  const existing = statusMap.get(modelId)
  if (existing) {
    Object.assign(existing, update)
  }
  else {
    statusMap.set(modelId, {
      device: 'unknown',
      modelId,
      state: 'idle',
      ...update,
    })
  }
}

// ---------------------------------------------------------------------------
// Composable (used by UI components)
// ---------------------------------------------------------------------------

export function useInferenceStatus() {
  const models = computed<InferenceModelStatus[]>(() =>
    Array.from(statusMap.values()),
  )

  const isAnyLoading = computed(() =>
    models.value.some(m =>
      m.state === 'downloading'
      || m.state === 'compiling'
      || m.state === 'warming-up',
    ),
  )

  const totalProgress = computed(() => {
    const loadingModels = models.value.filter(m =>
      m.state === 'downloading'
      || m.state === 'compiling'
      || m.state === 'warming-up',
    )
    if (loadingModels.length === 0)
      return 100

    const sum = loadingModels.reduce((acc, m) => {
      const p = m.progress?.percent ?? 0
      return acc + (p >= 0 ? p : 0)
    }, 0)

    return Math.round(sum / loadingModels.length)
  })

  return {
    isAnyLoading,
    models,
    totalProgress,
  }
}

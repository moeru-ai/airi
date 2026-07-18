/**
 * Model preloading composable.
 *
 * Allows the app to preload inference models during idle time,
 * so they're ready before the user first needs them.
 * Uses `setTimeout` to defer loading and avoid blocking the main
 * thread during app startup.
 *
 * Cancellation uses an AbortController so the signal can be forwarded
 * to adapter methods that accept `options.signal` — a cancelled preload
 * aborts any in-flight model load instead of just ignoring the result.
 */

import { onUnmounted, ref } from 'vue'

export interface PreloadTask {
  /** Human-readable model name for logging */
  modelId: string
  /**
   * The async function that loads the model. Receives an `AbortSignal`
   * that will fire if the preload is cancelled; loaders should forward
   * it to adapter methods (e.g. `adapter.loadModel(q, d, { signal })`).
   */
  loader: (signal: AbortSignal) => Promise<void>
}

export interface UseModelPreloadOptions {
  /** Delay in ms before starting preloads (default: 2000) */
  delayMs?: number
}

export function useModelPreload(options: UseModelPreloadOptions = {}) {
  const { delayMs = 2000 } = options

  const preloading = ref(false)
  const preloadedModels = ref<string[]>([])
  const failedModels = ref<string[]>([])

  let abortController: AbortController | null = null
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  /**
   * Schedule models for preloading. Models are loaded sequentially
   * in the given order after an idle delay.
   */
  function schedulePreload(tasks: PreloadTask[]): void {
    if (tasks.length === 0)
      return

    // Fresh controller per scheduling — abort any prior in-flight preload first
    if (abortController && !abortController.signal.aborted)
      abortController.abort(new Error('Preload superseded by new schedule'))
    abortController = new AbortController()
    const signal = abortController.signal

    timeoutId = setTimeout(async () => {
      if (signal.aborted)
        return

      preloading.value = true

      for (const task of tasks) {
        if (signal.aborted)
          break

        try {
          // eslint-disable-next-line no-console
          console.debug(`[Preload] Loading ${task.modelId}...`)
          await task.loader(signal)
          preloadedModels.value.push(task.modelId)
          // eslint-disable-next-line no-console
          console.debug(`[Preload] ${task.modelId} ready`)
        }
        catch (error) {
          // AbortError is expected when the preload is cancelled — don't
          // treat it as a failure.
          if ((error as Error)?.name === 'AbortError') {
            // eslint-disable-next-line no-console
            console.debug(`[Preload] ${task.modelId} aborted`)
            break
          }
          // Preload failures are non-fatal — model will load on first use
          console.warn(`[Preload] ${task.modelId} failed:`, error)
          failedModels.value.push(task.modelId)
        }
      }

      preloading.value = false
    }, delayMs)
  }

  function cancelPreload(): void {
    if (abortController && !abortController.signal.aborted)
      abortController.abort(new Error('Preload cancelled'))
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId)
      timeoutId = undefined
    }
    preloading.value = false
  }

  onUnmounted(() => {
    cancelPreload()
  })

  return {
    /** Whether a preload is currently in progress */
    preloading,
    /** Model IDs that have been successfully preloaded */
    preloadedModels,
    /** Model IDs that failed to preload (non-fatal) */
    failedModels,
    /** Schedule models for idle-time preloading */
    schedulePreload,
    /** Cancel any pending or in-progress preloads */
    cancelPreload,
  }
}

/**
 * Model preloading composable.
 *
 * Allows the app to preload inference models during idle time,
 * so they're ready before the user first needs them.
 * Uses `setTimeout` to defer loading and avoid blocking the main
 * thread during app startup.
 */

import { onUnmounted, ref } from 'vue'

export interface PreloadTask {
  /** Human-readable model name for logging */
  modelId: string
  /** The async function that loads the model */
  loader: () => Promise<void>
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

  let cancelled = false
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  /**
   * Schedule models for preloading. Models are loaded sequentially
   * in the given order after an idle delay.
   */
  function schedulePreload(tasks: PreloadTask[]): void {
    if (tasks.length === 0)
      return

    cancelled = false

    timeoutId = setTimeout(async () => {
      if (cancelled)
        return

      preloading.value = true

      for (const task of tasks) {
        if (cancelled)
          break

        try {
          // eslint-disable-next-line no-console
          console.debug(`[Preload] Loading ${task.modelId}...`)
          await task.loader()
          preloadedModels.value.push(task.modelId)
          // eslint-disable-next-line no-console
          console.debug(`[Preload] ${task.modelId} ready`)
        }
        catch (error) {
          // Preload failures are non-fatal — model will load on first use
          console.warn(`[Preload] ${task.modelId} failed:`, error)
          failedModels.value.push(task.modelId)
        }
      }

      preloading.value = false
    }, delayMs)
  }

  function cancelPreload(): void {
    cancelled = true
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

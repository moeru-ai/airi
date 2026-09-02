import { useDebounceFn } from '@vueuse/core'

/** Keeps asynchronous provider validations from committing stale draft results. */
export function createLatestValidationGuard() {
  let currentRun = 0

  return {
    begin() {
      const run = ++currentRun
      return () => run === currentRun
    },
    invalidate() {
      currentRun++
    },
  }
}

/** Creates lifecycle-aware debounced validation work for a provider editor. */
export function createDebouncedValidationRunner(validate: () => void | Promise<void>, delay: number) {
  const run = useDebounceFn(validate, delay)
  return { run, cancel: run.cancel }
}

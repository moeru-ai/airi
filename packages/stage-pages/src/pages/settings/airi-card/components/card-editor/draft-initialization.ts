/**
 * Tracks the current editor initialization while Vue flushes draft changes.
 *
 * A stale completion must not replace the baseline of a newer draft.
 */
export function createDraftInitializationCoordinator() {
  let generation = 0
  let initializing = false

  return {
    begin(): number {
      generation += 1
      initializing = true
      return generation
    },
    isCurrent(token: number): boolean {
      return initializing && token === generation
    },
    finish(token: number): boolean {
      if (!initializing || token !== generation)
        return false

      initializing = false
      return true
    },
  }
}

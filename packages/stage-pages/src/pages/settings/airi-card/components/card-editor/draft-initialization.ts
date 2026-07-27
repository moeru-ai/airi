interface DraftWatcherEffect {
  generation: number
  startedDuringInitialization: boolean
}

/**
 * Coordinates editor initialization with asynchronous field watchers.
 *
 * Each initialization invalidates effects captured by an older draft. Effects
 * caused by initialization itself also remain ineligible after their awaited
 * provider request completes, so they cannot overwrite persisted card values.
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
    captureWatcherEffect(): DraftWatcherEffect {
      return {
        generation,
        startedDuringInitialization: initializing,
      }
    },
    canApplyWatcherEffect(effect: DraftWatcherEffect): boolean {
      return !initializing
        && !effect.startedDuringInitialization
        && effect.generation === generation
    },
  }
}

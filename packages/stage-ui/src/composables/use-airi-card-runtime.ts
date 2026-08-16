import { usePiniaSynced } from '../libs/pinia'
import { useAiriCardStore } from '../stores/modules/airi-card'

/** Controls the leader-owned AIRI Card runtime for one renderer. */
export interface AiriCardRuntime {
  /** Stops leadership tracking for this renderer. */
  dispose: () => void
  /** Initializes card state and enables runtime settings in the leader. */
  initialize: () => Promise<void>
}

/**
 * Keeps AIRI Card runtime watchers installed in the current leader.
 *
 * A follower forwards its first initialization to the leader. If that
 * follower later becomes the leader, it must initialize its local watcher.
 */
export function useAiriCardRuntime(): AiriCardRuntime {
  const cardStore = useAiriCardStore()
  const syncedPinia = usePiniaSynced()
  let runtimeStarted = false

  const stopLeadershipListener = syncedPinia.onLeadershipChange((isLeader) => {
    if (!runtimeStarted)
      return

    if (isLeader)
      void cardStore.initialize()
    else
      cardStore.disposeRuntime()
  })

  return {
    async initialize() {
      runtimeStarted = true
      await cardStore.initialize()
    },
    dispose() {
      runtimeStarted = false
      cardStore.disposeRuntime()
      stopLeadershipListener()
    },
  }
}

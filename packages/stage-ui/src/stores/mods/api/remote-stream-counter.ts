/**
 * Tracks how many remote stream handlers are currently processing.
 * Used so orchestrator hooks can skip broadcasting when any remote stream is active,
 * avoiding race conditions when multiple events are processed concurrently.
 */
export function createRemoteStreamCounter(): {
  enter: () => void
  leave: () => void
  isProcessing: () => boolean
} {
  let count = 0
  return {
    enter() {
      count++
    },
    leave() {
      count--
    },
    isProcessing() {
      return count > 0
    },
  }
}

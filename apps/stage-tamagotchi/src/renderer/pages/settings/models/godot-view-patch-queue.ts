import type { StageViewPatch, StageViewVec3 } from '@proj-airi/stage-shared/godot-stage'

/**
 * Queue responsible for user-driven Godot view patch delivery.
 */
export interface GodotViewPatchQueue {
  /** Drops pending trailing work and prevents future sends. */
  dispose: () => void
  /** Adds a patch to the delivery queue. */
  enqueue: (patch: StageViewPatch) => void
  /** Clears runtime-session-local queue state while allowing future sends. */
  reset: () => void
}

/**
 * Options for creating a Godot view patch queue.
 */
export interface GodotViewPatchQueueOptions {
  /** Sends one merged patch to the host bridge. */
  applyPatch: (patch: StageViewPatch) => Promise<void>
  /** Minimum interval between patch sends while the user is dragging. */
  intervalMs: number
  /** Receives unexpected apply errors when the caller does not handle them internally. */
  onError?: (error: unknown) => void
}

function mergeVec3Patch(
  current: Partial<StageViewVec3> | undefined,
  next: Partial<StageViewVec3> | undefined,
) {
  if (!next)
    return current

  return {
    ...current,
    ...next,
  }
}

/**
 * Merges two Godot stage view-state patches.
 *
 * Use when:
 * - Several UI updates arrive before the next throttled bridge send
 * - The latest field value should replace older queued values
 *
 * Expects:
 * - Patch payloads have already passed component-level construction
 *
 * Returns:
 * - A patch containing the newest value for each touched model and camera field
 */
export function mergeGodotViewPatch(
  current: StageViewPatch | undefined,
  next: StageViewPatch,
): StageViewPatch {
  return {
    camera: current?.camera || next.camera
      ? {
          ...current?.camera,
          ...next.camera,
          position: mergeVec3Patch(current?.camera?.position, next.camera?.position),
        }
      : undefined,
  }
}

/**
 * Creates a leading-and-trailing queue for Godot view-state patches.
 *
 * Use when:
 * - Slider and drag input should update Godot immediately
 * - Continuous input should be coalesced before crossing the Electron/Godot bridge
 *
 * Expects:
 * - `applyPatch` owns bridge errors and may be asynchronous
 * - `intervalMs` is a positive throttle interval
 *
 * Returns:
 * - A small queue API that sends the first patch immediately and later sends the latest
 *   merged patch after the throttle interval or after the current send finishes
 */
export function createGodotViewPatchQueue(
  options: GodotViewPatchQueueOptions,
): GodotViewPatchQueue {
  let disposed = false
  let generation = 0
  let hasSentPatch = false
  let inFlight = false
  let lastSentAt = 0
  let pendingPatch: StageViewPatch | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  function clearTimer() {
    if (!timer)
      return

    clearTimeout(timer)
    timer = undefined
  }

  function schedule() {
    if (disposed || inFlight || !pendingPatch || timer)
      return

    const waitMs = hasSentPatch
      ? Math.max(0, options.intervalMs - (Date.now() - lastSentAt))
      : 0

    if (waitMs <= 0) {
      void sendPendingPatch()
      return
    }

    timer = setTimeout(() => {
      timer = undefined
      void sendPendingPatch()
    }, waitMs)
  }

  async function sendPendingPatch() {
    if (disposed || inFlight)
      return

    const sendGeneration = generation
    const patch = pendingPatch
    pendingPatch = undefined

    if (!patch)
      return

    inFlight = true
    hasSentPatch = true
    lastSentAt = Date.now()

    try {
      await options.applyPatch(patch)
    }
    catch (error) {
      if (generation === sendGeneration)
        options.onError?.(error)
    }
    finally {
      if (!disposed && generation === sendGeneration) {
        inFlight = false
        schedule()
      }
    }
  }

  function reset() {
    generation += 1
    inFlight = false
    pendingPatch = undefined
    hasSentPatch = false
    lastSentAt = 0
    clearTimer()
  }

  return {
    dispose() {
      disposed = true
      reset()
    },
    enqueue(patch) {
      if (disposed)
        return

      pendingPatch = mergeGodotViewPatch(pendingPatch, patch)
      schedule()
    },
    reset,
  }
}

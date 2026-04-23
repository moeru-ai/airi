/**
 * GPU resource coordinator.
 *
 * Bookkeeping layer that tracks estimated GPU memory allocation
 * across inference models. Advisory — does not own the actual
 * GPUDevice (workers manage their own via transformers.js).
 *
 * Emits memory pressure events when allocation nears the budget
 * so consumers can decide to unload LRU models or fall back to WASM.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MemoryPressureLevel = 'warning' | 'critical'

export interface AllocationToken {
  modelId: string
  bytes: number
  allocatedAt: number
  lastUsedAt: number
}

export interface GPUResourceUsage {
  /** Total bytes currently allocated (sum of all tokens) */
  allocated: number
  /** Estimated budget in bytes */
  budget: number
  /** Currently loaded model IDs */
  models: string[]
}

export interface GPUResourceCoordinator {
  /**
   * Request an allocation for a model.
   * Returns the token. May trigger memory pressure events if over budget.
   */
  requestAllocation: (modelId: string, estimatedBytes: number) => AllocationToken

  /** Release a previously allocated token */
  release: (token: AllocationToken) => void

  /** Mark a model as recently used (updates LRU ordering) */
  touch: (modelId: string) => void

  /** Get current resource usage */
  getUsage: () => GPUResourceUsage

  /**
   * Get the least-recently-used model ID, or null if none loaded.
   * Useful for deciding which model to unload under pressure.
   */
  getLRUModel: () => string | null

  /**
   * Subscribe to memory pressure events.
   * Returns an unsubscribe function.
   */
  onMemoryPressure: (handler: (level: MemoryPressureLevel) => void) => () => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WARNING_THRESHOLD = 0.80
const CRITICAL_THRESHOLD = 0.95
const BUDGET_SAFETY_FACTOR = 0.70

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createGPUResourceCoordinator(
  estimatedVRAM: number,
): GPUResourceCoordinator {
  const budget = estimatedVRAM > 0 ? estimatedVRAM * BUDGET_SAFETY_FACTOR : Number.POSITIVE_INFINITY
  const allocations = new Map<string, AllocationToken>()
  const pressureHandlers = new Set<(level: MemoryPressureLevel) => void>()

  function getAllocated(): number {
    let total = 0
    for (const token of allocations.values())
      total += token.bytes
    return total
  }

  function checkPressure(): void {
    if (budget === Number.POSITIVE_INFINITY)
      return

    const ratio = getAllocated() / budget
    if (ratio >= CRITICAL_THRESHOLD) {
      for (const handler of pressureHandlers)
        handler('critical')
    }
    else if (ratio >= WARNING_THRESHOLD) {
      for (const handler of pressureHandlers)
        handler('warning')
    }
  }

  function requestAllocation(modelId: string, estimatedBytes: number): AllocationToken {
    // If model already allocated, update the byte estimate
    const existing = allocations.get(modelId)
    if (existing) {
      existing.bytes = estimatedBytes
      existing.lastUsedAt = Date.now()
      checkPressure()
      return existing
    }

    const token: AllocationToken = {
      modelId,
      bytes: estimatedBytes,
      allocatedAt: Date.now(),
      lastUsedAt: Date.now(),
    }
    allocations.set(modelId, token)
    checkPressure()
    return token
  }

  function release(token: AllocationToken): void {
    allocations.delete(token.modelId)
  }

  function touch(modelId: string): void {
    const token = allocations.get(modelId)
    if (token)
      token.lastUsedAt = Date.now()
  }

  function getUsage(): GPUResourceUsage {
    return {
      allocated: getAllocated(),
      budget: budget === Number.POSITIVE_INFINITY ? 0 : budget,
      models: Array.from(allocations.keys()),
    }
  }

  function getLRUModel(): string | null {
    let oldest: AllocationToken | null = null
    for (const token of allocations.values()) {
      if (!oldest || token.lastUsedAt < oldest.lastUsedAt)
        oldest = token
    }
    return oldest?.modelId ?? null
  }

  function onMemoryPressure(handler: (level: MemoryPressureLevel) => void): () => void {
    pressureHandlers.add(handler)
    return () => pressureHandlers.delete(handler)
  }

  return {
    requestAllocation,
    release,
    touch,
    getUsage,
    getLRUModel,
    onMemoryPressure,
  }
}

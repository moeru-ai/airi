/**
 * Singing pipeline metrics interface.
 * Used for observability: stage durations, job counts, error rates.
 */
export interface SingingMetrics {
  recordStageDuration: (stage: string, durationMs: number) => void
  incrementJobCount: (status: string) => void
  recordError: (stage: string, errorCode: string) => void
}

/**
 * Create a no-op metrics collector.
 */
export function createNoopMetrics(): SingingMetrics {
  const noop = () => {}
  return { recordStageDuration: noop, incrementJobCount: noop, recordError: noop }
}

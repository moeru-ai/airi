import type { DatabaseMetrics } from '..'

interface PoolStats {
  idleCount: number
  options: { max?: number }
  totalCount: number
  waitingCount: number
}

/**
 * Observe the local pg pool. The standard pg metric has no configured limit,
 * so it cannot show how close this process is to its own pool capacity.
 */
export function registerDbPoolGauge(
  gauge: DatabaseMetrics['poolConnections'],
  pool: PoolStats,
) {
  gauge.addCallback((result) => {
    const total = pool.totalCount
    const idle = pool.idleCount
    const used = total - idle
    const counts = {
      max: pool.options.max ?? 10,
      total,
      used,
      idle,
      waiting: pool.waitingCount,
    }

    for (const [pool_state, value] of Object.entries(counts))
      result.observe(value, { pool_state })
  })
}

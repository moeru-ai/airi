import type { ObservableGauge } from '@opentelemetry/api'

// The admin endpoint caches DB aggregates for 60 seconds. Two minutes keeps a
// continuously refreshed dashboard stable across cache rollover and several
// 15-second OTel collections, while still bounding stale replica dominance.
export const USER_METRICS_SNAPSHOT_MAX_AGE_MS = 2 * 60_000

export interface UserMetricsSnapshot {
  totalUsers: number
  activeSessions: number
  distinctActiveUsers: number
}

export interface UserMetricsSnapshotRecorder {
  record: (snapshot: UserMetricsSnapshot, refreshedAt: number) => void
}

type ObservableGaugeRegistration = Pick<ObservableGauge, 'addCallback'>

export interface UserMetricsSnapshotGauges {
  totalUsers: ObservableGaugeRegistration
  activeSessions: ObservableGaugeRegistration
  distinctActiveUsers: ObservableGaugeRegistration
}

/**
 * Export the latest explicitly refreshed user-metrics snapshot without doing
 * I/O from OTel's periodic collection callbacks. Until a request records the
 * first snapshot, or after the last database refresh becomes stale, the
 * gauges intentionally emit no points.
 */
export function registerUserMetricsSnapshotGauges(
  gauges: UserMetricsSnapshotGauges,
): UserMetricsSnapshotRecorder {
  let latest: { snapshot: UserMetricsSnapshot, refreshedAt: number } | undefined

  function readFreshSnapshot(): UserMetricsSnapshot | undefined {
    if (!latest)
      return undefined

    if (Date.now() - latest.refreshedAt >= USER_METRICS_SNAPSHOT_MAX_AGE_MS) {
      latest = undefined
      return undefined
    }

    return latest.snapshot
  }

  gauges.totalUsers.addCallback((result) => {
    const snapshot = readFreshSnapshot()
    if (snapshot)
      result.observe(snapshot.totalUsers)
  })

  gauges.activeSessions.addCallback((result) => {
    const snapshot = readFreshSnapshot()
    if (snapshot)
      result.observe(snapshot.activeSessions)
  })

  gauges.distinctActiveUsers.addCallback((result) => {
    const snapshot = readFreshSnapshot()
    if (snapshot)
      result.observe(snapshot.distinctActiveUsers)
  })

  return {
    record(snapshot, refreshedAt) {
      latest = { snapshot, refreshedAt }
    },
  }
}

export function createDiscardingUserMetricsSnapshotRecorder(): UserMetricsSnapshotRecorder {
  return { record() {} }
}

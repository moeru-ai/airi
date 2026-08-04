import type { ObservableGauge } from '@opentelemetry/api'

const ROLLING_WINDOWS = ['24h', '7d', '30d'] as const

type RollingWindow = (typeof ROLLING_WINDOWS)[number]

export interface UserMetricsSnapshot {
  totalUsers: number
  activeSessions: number
  distinctActiveUsers: number
  rollingActiveUsers: Record<RollingWindow, number>
}

export interface UserMetricsSnapshotRecorder {
  record: (snapshot: UserMetricsSnapshot) => void
}

type ObservableGaugeRegistration = Pick<ObservableGauge, 'addCallback'>

export interface UserMetricsSnapshotGauges {
  totalUsers: ObservableGaugeRegistration
  activeSessions: ObservableGaugeRegistration
  distinctActiveUsers: ObservableGaugeRegistration
  rollingActiveUsers: ObservableGaugeRegistration
}

/**
 * Export the latest explicitly refreshed user-metrics snapshot without doing
 * I/O from OTel's periodic collection callbacks. Until a request records the
 * first snapshot, the gauges intentionally emit no points.
 */
export function registerUserMetricsSnapshotGauges(
  gauges: UserMetricsSnapshotGauges,
): UserMetricsSnapshotRecorder {
  let latest: UserMetricsSnapshot | undefined

  gauges.totalUsers.addCallback((result) => {
    if (latest)
      result.observe(latest.totalUsers)
  })

  gauges.activeSessions.addCallback((result) => {
    if (latest)
      result.observe(latest.activeSessions)
  })

  gauges.distinctActiveUsers.addCallback((result) => {
    if (latest)
      result.observe(latest.distinctActiveUsers)
  })

  gauges.rollingActiveUsers.addCallback((result) => {
    if (!latest)
      return

    for (const window of ROLLING_WINDOWS)
      result.observe(latest.rollingActiveUsers[window], { window })
  })

  return {
    record(snapshot) {
      latest = snapshot
    },
  }
}

export function createDiscardingUserMetricsSnapshotRecorder(): UserMetricsSnapshotRecorder {
  return { record() {} }
}

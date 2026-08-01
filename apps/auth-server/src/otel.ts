import type { Counter, Histogram, ObservableGauge } from '@opentelemetry/api'

import type { AuthDatabase } from './db'

import { useLogger } from '@guiiai/logg'
import { metrics, trace } from '@opentelemetry/api'
import { logs, SeverityNumber } from '@opentelemetry/api-logs'
import { session as sessionTable, user as userTable } from '@proj-airi/auth-shared'
import { count, countDistinct, gt, sql } from 'drizzle-orm'

const logger = useLogger('otel')

export interface AuthMetrics {
  attempts: Counter
  failures: Counter
  userRegistered: Counter
  userLogin: Counter
  totalUsers: ObservableGauge
  activeSessions: ObservableGauge
  distinctActiveUsers: ObservableGauge
  rollingActiveUsers: ObservableGauge
}

export interface EmailMetrics {
  send: Counter
  failures: Counter
  duration: Histogram
}

export interface RateLimitMetrics {
  blocked: Counter
}

export interface ObservabilityMetrics {
  metricReadErrors: Counter
}

export interface AuthOtelInstance {
  auth: AuthMetrics
  email: EmailMetrics
  rateLimit: RateLimitMetrics
  observability: ObservabilityMetrics
}

/** Builds the metric handles owned by the standalone auth process. */
export function initAuthOtel(env: { OTEL_EXPORTER_OTLP_ENDPOINT?: string, OTEL_SERVICE_NAME: string }): AuthOtelInstance | null {
  if (!env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    logger.log('OpenTelemetry disabled (set OTEL_EXPORTER_OTLP_ENDPOINT to enable)')
    return null
  }

  const meter = metrics.getMeter(env.OTEL_SERVICE_NAME)
  const auth: AuthMetrics = {
    attempts: meter.createCounter('auth.attempts', { description: 'Number of authentication attempts' }),
    failures: meter.createCounter('auth.failures', { description: 'Number of failed authentication attempts' }),
    userRegistered: meter.createCounter('user.registered', { description: 'Number of new user registrations' }),
    userLogin: meter.createCounter('user.login', { description: 'Number of user sign-ins' }),
    totalUsers: meter.createObservableGauge('user.total', { description: 'Total registered users sourced from PostgreSQL' }),
    activeSessions: meter.createObservableGauge('user.active_sessions', { description: 'Active Better Auth sessions sourced from PostgreSQL' }),
    distinctActiveUsers: meter.createObservableGauge('user.distinct_active', { description: 'Distinct users with a non-expired session' }),
    rollingActiveUsers: meter.createObservableGauge('user.active_rolling', { description: 'Rolling-window distinct active users' }),
  }
  const email: EmailMetrics = {
    send: meter.createCounter('airi.email.send', { description: 'Transactional emails accepted by Resend' }),
    failures: meter.createCounter('airi.email.failures', { description: 'Transactional email send failures' }),
    duration: meter.createHistogram('airi.email.duration', { description: 'Email provider call duration', unit: 's' }),
  }
  const rateLimit: RateLimitMetrics = {
    blocked: meter.createCounter('airi.rate_limit.blocked', { description: 'Requests blocked by the auth rate limiter' }),
  }
  const observability: ObservabilityMetrics = {
    metricReadErrors: meter.createCounter('airi.observability.read_errors', { description: 'Failures reading auth metric source data' }),
  }

  for (const counter of [
    auth.attempts,
    auth.failures,
    auth.userRegistered,
    auth.userLogin,
    email.send,
    email.failures,
    rateLimit.blocked,
    observability.metricReadErrors,
  ]) counter.add(0)

  return { auth, email, rateLimit, observability }
}

const severityMap: Record<string, SeverityNumber> = {
  debug: SeverityNumber.DEBUG,
  verbose: SeverityNumber.TRACE,
  log: SeverityNumber.INFO,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
}

/** Emits a log record through the auth process's global OTel provider. */
export function emitOtelLog(
  level: string,
  context: string,
  message: string,
  attributes?: Record<string, string | number | boolean>,
): void {
  const spanContext = trace.getActiveSpan()?.spanContext()
  logs.getLogger(context).emit({
    severityNumber: severityMap[level.toLowerCase()] ?? SeverityNumber.INFO,
    severityText: level.toUpperCase(),
    body: message,
    attributes: {
      ...attributes,
      ...(spanContext && { trace_id: spanContext.traceId, span_id: spanContext.spanId }),
    },
  })
}

type GaugeResult = Parameters<Parameters<ObservableGauge['addCallback']>[0]>[0]

interface DatabaseGaugeOptions<T> {
  gauge: ObservableGauge
  ttlMs: number
  read: () => Promise<T>
  observe: (result: GaugeResult, value: T) => void
  onReadError: (error: unknown) => void
}

/**
 * Owns the cache, refresh coalescing, and failure policy shared by DB gauges.
 * Failed reads deliberately skip observation so metric staleness exposes the
 * outage instead of publishing a cached value forever.
 */
function registerDatabaseGauge<T>(options: DatabaseGaugeOptions<T>): void {
  let cached: { at: number, value: T } | undefined
  let refreshInFlight: Promise<boolean> | null = null

  async function refresh(): Promise<boolean> {
    try {
      const value = await options.read()
      cached = { at: Date.now(), value }
      return true
    }
    catch (error) {
      options.onReadError(error)
      return false
    }
  }

  options.gauge.addCallback(async (result) => {
    if (cached && Date.now() - cached.at < options.ttlMs) {
      options.observe(result, cached.value)
      return
    }

    if (!refreshInFlight) {
      refreshInFlight = refresh().finally(() => {
        refreshInFlight = null
      })
    }

    const refreshed = await refreshInFlight
    if (refreshed && cached)
      options.observe(result, cached.value)
  })
}

/** Registers the cluster-wide total user count gauge. */
export function registerTotalUsersGauge(
  gauge: AuthMetrics['totalUsers'],
  db: AuthDatabase,
  metricReadErrors: ObservabilityMetrics['metricReadErrors'],
): void {
  const log = useLogger('total-users-gauge').useGlobalConfig()
  registerDatabaseGauge({
    gauge,
    ttlMs: 60_000,
    read: async () => {
      const rows = await db.select({ count: count() }).from(userTable)
      return Number(rows[0]?.count ?? 0)
    },
    observe: (result, value) => result.observe(value),
    onReadError: (error) => {
      log.withError(error).warn('Failed to read total users for gauge')
      metricReadErrors.add(1, { metric: 'user.total' })
    },
  })
}

/** Registers the cluster-wide count of non-expired Better Auth sessions. */
export function registerActiveSessionsGauge(
  gauge: AuthMetrics['activeSessions'],
  db: AuthDatabase,
  metricReadErrors: ObservabilityMetrics['metricReadErrors'],
): void {
  const log = useLogger('active-sessions-gauge').useGlobalConfig()
  registerDatabaseGauge({
    gauge,
    ttlMs: 10_000,
    read: async () => {
      // Better Auth validates expiry against the app clock, so the metric must
      // use the same clock rather than PostgreSQL NOW().
      const rows = await db
        .select({ count: count() })
        .from(sessionTable)
        .where(gt(sessionTable.expiresAt, new Date()))
      return Number(rows[0]?.count ?? 0)
    },
    observe: (result, value) => result.observe(value),
    onReadError: (error) => {
      log.withError(error).warn('Failed to read active sessions for gauge')
      metricReadErrors.add(1, { metric: 'user.active_sessions' })
    },
  })
}

/** Registers distinct users with at least one non-expired session. */
export function registerDistinctActiveUsersGauge(
  gauge: AuthMetrics['distinctActiveUsers'],
  db: AuthDatabase,
  metricReadErrors: ObservabilityMetrics['metricReadErrors'],
): void {
  const log = useLogger('distinct-active-users-gauge').useGlobalConfig()
  registerDatabaseGauge({
    gauge,
    ttlMs: 10_000,
    read: async () => {
      const rows = await db
        .select({ count: countDistinct(sessionTable.userId) })
        .from(sessionTable)
        .where(gt(sessionTable.expiresAt, new Date()))
      return Number(rows[0]?.count ?? 0)
    },
    observe: (result, value) => result.observe(value),
    onReadError: (error) => {
      log.withError(error).warn('Failed to read distinct active users for gauge')
      metricReadErrors.add(1, { metric: 'user.distinct_active' })
    },
  })
}

const rollingWindows = [
  { label: '24h', ms: 24 * 60 * 60 * 1000 },
  { label: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
] as const

type RollingWindow = (typeof rollingWindows)[number]['label']
type RollingCounts = Record<RollingWindow, number>

/** Registers rolling DAU, WAU, and MAU from the user's last-seen timestamp. */
export function registerRollingActiveUsersGauge(
  gauge: AuthMetrics['rollingActiveUsers'],
  db: AuthDatabase,
  metricReadErrors: ObservabilityMetrics['metricReadErrors'],
): void {
  const log = useLogger('rolling-active-users-gauge').useGlobalConfig()
  registerDatabaseGauge<RollingCounts>({
    gauge,
    ttlMs: 60_000,
    read: async () => {
      // Anchor every cutoff to one instant so the three windows cannot drift
      // across a collection cycle.
      const now = Date.now()
      const rows = await db
        .select({
          dau: sql<number>`count(*) filter (where ${userTable.lastSeenAt} > ${new Date(now - rollingWindows[0].ms)})`,
          wau: sql<number>`count(*) filter (where ${userTable.lastSeenAt} > ${new Date(now - rollingWindows[1].ms)})`,
          mau: sql<number>`count(*) filter (where ${userTable.lastSeenAt} > ${new Date(now - rollingWindows[2].ms)})`,
        })
        .from(userTable)
      return {
        '24h': Number(rows[0]?.dau ?? 0),
        '7d': Number(rows[0]?.wau ?? 0),
        '30d': Number(rows[0]?.mau ?? 0),
      }
    },
    observe: (result, value) => {
      for (const window of rollingWindows)
        result.observe(value[window.label], { window: window.label })
    },
    onReadError: (error) => {
      log.withError(error).warn('Failed to read rolling active users for gauge')
      metricReadErrors.add(1, { metric: 'user.active_rolling' })
    },
  })
}

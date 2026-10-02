import type { Counter, Histogram } from '@opentelemetry/api'

import { useLogger } from '@guiiai/logg'
import { metrics, trace } from '@opentelemetry/api'
import { logs, SeverityNumber } from '@opentelemetry/api-logs'

const logger = useLogger('otel')

export interface AuthMetrics {
  attempts: Counter
  failures: Counter
  userRegistered: Counter
  userLogin: Counter
}

export interface EmailMetrics {
  send: Counter
  failures: Counter
  duration: Histogram
}

export interface RateLimitMetrics {
  blocked: Counter
}

export interface AuthOtelInstance {
  auth: AuthMetrics
  email: EmailMetrics
  rateLimit: RateLimitMetrics
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
  }
  const email: EmailMetrics = {
    send: meter.createCounter('airi.email.send', { description: 'Transactional emails accepted by Resend' }),
    failures: meter.createCounter('airi.email.failures', { description: 'Transactional email send failures' }),
    duration: meter.createHistogram('airi.email.duration', { description: 'Email provider call duration', unit: 's' }),
  }
  const rateLimit: RateLimitMetrics = {
    blocked: meter.createCounter('airi.rate_limit.blocked', { description: 'Requests blocked by the auth rate limiter' }),
  }
  for (const counter of [
    auth.attempts,
    auth.failures,
    auth.userRegistered,
    auth.userLogin,
    email.send,
    email.failures,
    rateLimit.blocked,
  ]) counter.add(0)

  return { auth, email, rateLimit }
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

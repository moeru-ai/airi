import type { Counter, Histogram } from '@opentelemetry/api'

import { useLogger } from '@guiiai/logg'
import { metrics, trace } from '@opentelemetry/api'
import { logs, SeverityNumber } from '@opentelemetry/api-logs'

const logger = useLogger('otel')

export interface AuthMetrics {
  attempts: Counter
  failures: Counter
  userLogin: Counter
  userRegistered: Counter
}

export interface AuthOtelInstance {
  auth: AuthMetrics
  email: EmailMetrics
  rateLimit: RateLimitMetrics
}

export interface EmailMetrics {
  duration: Histogram
  failures: Counter
  send: Counter
}

export interface RateLimitMetrics {
  blocked: Counter
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
    userLogin: meter.createCounter('user.login', { description: 'Number of user sign-ins' }),
    userRegistered: meter.createCounter('user.registered', { description: 'Number of new user registrations' }),
  }
  const email: EmailMetrics = {
    duration: meter.createHistogram('airi.email.duration', { description: 'Email provider call duration', unit: 's' }),
    failures: meter.createCounter('airi.email.failures', { description: 'Transactional email send failures' }),
    send: meter.createCounter('airi.email.send', { description: 'Transactional emails accepted by Resend' }),
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
  error: SeverityNumber.ERROR,
  info: SeverityNumber.INFO,
  log: SeverityNumber.INFO,
  verbose: SeverityNumber.TRACE,
  warn: SeverityNumber.WARN,
}

/** Emits a log record through the auth process's global OTel provider. */
export function emitOtelLog(
  level: string,
  context: string,
  message: string,
  attributes?: Record<string, boolean | number | string>,
): void {
  const spanContext = trace.getActiveSpan()?.spanContext()
  logs.getLogger(context).emit({
    attributes: {
      ...attributes,
      ...(spanContext && { span_id: spanContext.spanId, trace_id: spanContext.traceId }),
    },
    body: message,
    severityNumber: severityMap[level.toLowerCase()] ?? SeverityNumber.INFO,
    severityText: level.toUpperCase(),
  })
}

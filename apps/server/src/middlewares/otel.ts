import type { MiddlewareHandler } from 'hono'

import type { HttpMetrics } from '../libs/otel'
import type { HonoEnv } from '../types/hono'

import { context, SpanStatusCode, trace } from '@opentelemetry/api'

import { errorMessageFromUnknown } from '../utils/error-message'

const tracer = trace.getTracer('airi-server-hono')

/**
 * Hono middleware that creates spans for each request and records
 * active request counts.
 *
 * NOTICE: Request duration is intentionally NOT recorded here. The
 * Node HTTP instrumentation already emits `http.server.request.duration`,
 * and recording the same metric here would double-count every request in
 * Grafana panels that read the histogram `_count` series as request rate.
 */
export function otelMiddleware(http: HttpMetrics): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    const method = c.req.method
    const path = c.req.path

    http.activeRequests.add(1, { 'http.request.method': method, 'http.route': path })

    const span = tracer.startSpan(`${method} ${path}`, {
      attributes: {
        'http.request.method': method,
        'http.route': path,
        'url.full': c.req.url,
      },
    })

    try {
      await context.with(trace.setSpan(context.active(), span), () => next())

      const status = c.res.status
      span.setAttribute('http.response.status_code', status)

      if (status >= 500) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: `HTTP ${status}` })
      }
    }
    catch (err) {
      const errorMessage = errorMessageFromUnknown(err)
      span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage })
      span.recordException(err instanceof Error ? err : new Error(errorMessage))
      throw err
    }
    finally {
      http.activeRequests.add(-1, { 'http.request.method': method, 'http.route': path })
      span.end()
    }
  }
}

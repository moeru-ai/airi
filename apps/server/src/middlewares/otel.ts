import type { MiddlewareHandler } from 'hono'

import type { HonoEnv } from '../types/hono'

import { context, SpanStatusCode, trace } from '@opentelemetry/api'

const tracer = trace.getTracer('airi-server-hono')

/**
 * Hono middleware that creates spans for each request and records
 * custom HTTP metrics (duration, active requests, status codes).
 */
export function otelMiddleware(otelMetrics: {
  httpRequestDuration: { record: (value: number, attributes?: Record<string, string | number>) => void }
  httpActiveRequests: { add: (value: number, attributes?: Record<string, string>) => void }
}): MiddlewareHandler<HonoEnv> {
  return async (c, next) => {
    const startTime = performance.now()
    const method = c.req.method
    const path = c.req.path

    otelMetrics.httpActiveRequests.add(1, { 'http.request.method': method, 'http.route': path })

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

      otelMetrics.httpRequestDuration.record(performance.now() - startTime, {
        'http.request.method': method,
        'http.route': path,
        'http.response.status_code': status,
      })
    }
    catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : 'Unknown error' })
      span.recordException(err instanceof Error ? err : new Error(String(err)))
      throw err
    }
    finally {
      otelMetrics.httpActiveRequests.add(-1, { 'http.request.method': method, 'http.route': path })
      span.end()
    }
  }
}

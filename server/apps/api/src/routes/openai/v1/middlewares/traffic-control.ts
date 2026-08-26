import type { RateLimitMetrics } from '../../../../otel'
import type { GatewayMiddleware, V1GatewayContext, V1GatewayOperationName } from '../gateway'

interface GatewayRateLimitClassification {
  key: string
  keyType: RateLimitKeyType
  model?: string
}

interface GatewayRateLimitOptions<Name extends V1GatewayOperationName> {
  classify: (context: V1GatewayContext<Name>) => GatewayRateLimitClassification
  max: number
  metrics?: null | RateLimitMetrics
  routeLabel: string
  windowSec: number
}

interface RateLimitBucket {
  count: number
  resetAt: number
}

type RateLimitKeyType = 'ip' | 'model' | 'user'

export function chatCompletionsRateLimit(input: {
  metrics?: null | RateLimitMetrics
}): GatewayMiddleware<'chat.completions'> {
  return createGatewayRateLimiter({
    classify: context => ({
      key: context.input.userId,
      keyType: 'user',
      model: typeof context.input.body.model === 'string' ? context.input.body.model : 'auto',
    }),
    max: 60,
    metrics: input.metrics,
    routeLabel: 'openai.completions',
    windowSec: 60,
  })
}

function createGatewayRateLimiter<Name extends V1GatewayOperationName>(opts: GatewayRateLimitOptions<Name>): GatewayMiddleware<Name> {
  const buckets = new Map<string, RateLimitBucket>()

  return async function limitGatewayOperation(context, next) {
    const now = Date.now()
    const classification = opts.classify(context)
    const bucketKey = `${opts.routeLabel}:${classification.keyType}:${classification.key}`
    const existing = buckets.get(bucketKey)
    const bucket = existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + opts.windowSec * 1000 }

    if (bucket.count >= opts.max) {
      opts.metrics?.blocked.add(1, {
        key_type: classification.keyType,
        limit: String(opts.max),
        route: opts.routeLabel,
      })
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
      return Response.json(
        { error: 'TOO_MANY_REQUESTS', message: 'Too many requests' },
        {
          headers: {
            'RateLimit-Limit': String(opts.max),
            'RateLimit-Remaining': '0',
            'RateLimit-Reset': String(retryAfterSec),
            'Retry-After': String(retryAfterSec),
          },
          status: 429,
        },
      )
    }

    bucket.count += 1
    buckets.set(bucketKey, bucket)
    return next()
  }
}

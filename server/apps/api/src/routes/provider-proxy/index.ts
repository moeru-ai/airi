import type { RateLimitMetrics } from '../../otel'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'

import { rateLimiter } from '../../middlewares/rate-limit'
import { createBadGatewayError, createUnauthorizedError } from '../../utils/error'

const OPENCODE_GO_UPSTREAM_BASE_URL = 'https://opencode.ai/zen/go/v1/'
const FORWARDED_RESPONSE_HEADERS = [
  'content-type',
  'retry-after',
  'x-request-id',
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
]

interface ProviderProxyRoutesOptions {
  fetch: typeof globalThis.fetch
  rateLimitMetrics?: RateLimitMetrics | null
  trustedProxy?: 'railway'
}

function authorizationHeaders(requestHeaders: Headers) {
  const authorization = requestHeaders.get('authorization')?.trim()
  if (!authorization?.startsWith('Bearer ') || authorization.length === 'Bearer '.length)
    throw createUnauthorizedError('OpenCode Go API key is required.')

  const headers = new Headers({ Authorization: authorization })
  const accept = requestHeaders.get('accept')
  if (accept)
    headers.set('Accept', accept)

  return headers
}

function responseHeaders(upstreamHeaders: Headers) {
  const headers = new Headers()
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstreamHeaders.get(name)
    if (value)
      headers.set(name, value)
  }
  return headers
}

async function forwardRequest(
  fetchImpl: typeof globalThis.fetch,
  request: Request,
  upstreamPath: 'models' | 'chat/completions',
) {
  const upstreamUrl = new URL(upstreamPath, OPENCODE_GO_UPSTREAM_BASE_URL)
  upstreamUrl.search = new URL(request.url).search

  const headers = authorizationHeaders(request.headers)
  const body = request.method === 'POST' ? await request.arrayBuffer() : undefined
  if (body)
    headers.set('Content-Type', 'application/json')

  let response: Response
  try {
    response = await fetchImpl(upstreamUrl, {
      method: request.method,
      headers,
      body,
      signal: request.signal,
    })
  }
  catch (error) {
    const proxyError = createBadGatewayError('OpenCode Go is unavailable.')
    proxyError.cause = error
    throw proxyError
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders(response.headers),
  })
}

/**
 * Creates the fixed-target proxy for OpenCode Go browser requests.
 *
 * The proxy accepts only model-list and chat-completion requests. It forwards
 * the caller's OpenCode key without storing it or accepting a target URL.
 */
export function createProviderProxyRoutes(options: ProviderProxyRoutesOptions) {
  const app = new Hono<HonoEnv>()

  app.use('*', rateLimiter({
    max: 120,
    windowSec: 60,
    metrics: options.rateLimitMetrics,
    routeLabel: 'provider-proxy.opencode-go',
    trustedProxy: options.trustedProxy,
  }))
  app.use('*', bodyLimit({ maxSize: 1024 * 1024 }))

  app.get('/opencode-go/models', c => forwardRequest(options.fetch, c.req.raw, 'models'))
  app.post('/opencode-go/chat/completions', c => forwardRequest(options.fetch, c.req.raw, 'chat/completions'))

  return app
}

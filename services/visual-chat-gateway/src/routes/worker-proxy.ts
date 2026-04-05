import { createError, createRouter, defineEventHandler, getHeader, readRawBody } from 'h3'

import { requireGatewayAccess } from '../auth'
import { gatewayEnv } from '../gateway-env'

const SAFE_RESPONSE_HEADERS = new Set([
  'cache-control',
  'content-length',
  'content-type',
  'transfer-encoding',
])
const TRAILING_SLASH_PATTERN = /\/$/

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function buildSafeHeaders(response: Response): Headers {
  const headers = new Headers()
  response.headers.forEach((value, key) => {
    if (SAFE_RESPONSE_HEADERS.has(key.toLowerCase()))
      headers.set(key, value)
  })
  return headers
}

function workerUrlFor(path: string): string {
  return `${gatewayEnv.workerUrl.replace(TRAILING_SLASH_PATTERN, '')}${path}`
}

async function proxyToWorker(path: string, init?: RequestInit): Promise<Response> {
  try {
    const upstream = await fetch(workerUrlFor(path), init)
    return new Response(upstream.body, {
      status: upstream.status,
      headers: buildSafeHeaders(upstream),
    })
  }
  catch (error) {
    throw createError({
      statusCode: 502,
      statusMessage: `Worker proxy failed: ${errorMessage(error)}`,
    })
  }
}

export function createWorkerProxyRoutes() {
  const router = createRouter()

  router.get('/api/worker/health', defineEventHandler(async (event) => {
    requireGatewayAccess(event)
    return proxyToWorker('/health')
  }))

  router.post('/api/worker/infer-stream', defineEventHandler(async (event) => {
    requireGatewayAccess(event)
    const body = await readRawBody(event, 'utf8')
    return proxyToWorker('/infer-stream', {
      method: 'POST',
      headers: {
        'Content-Type': getHeader(event, 'content-type') || 'application/json',
      },
      body,
    })
  }))

  return router
}

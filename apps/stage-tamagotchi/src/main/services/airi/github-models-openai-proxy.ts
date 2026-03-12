import { createServer } from 'node:http'
import { Readable } from 'node:stream'

interface GitHubCatalogModel {
  id?: string
  name?: string
}

const upstreamInferenceBaseUrl = process.env.AIRI_GITHUB_MODELS_PROXY_UPSTREAM_BASE_URL?.trim() || 'https://models.github.ai/inference'
const upstreamCatalogUrl = process.env.AIRI_GITHUB_MODELS_PROXY_CATALOG_URL?.trim() || 'https://models.github.ai/catalog/models'
const listenHost = process.env.AIRI_GITHUB_MODELS_PROXY_HOST?.trim() || '127.0.0.1'
const listenPort = Number(process.env.AIRI_GITHUB_MODELS_PROXY_PORT || '4318')
const envApiKey = process.env.AIRI_GITHUB_MODELS_PROXY_API_KEY?.trim() || process.env.GITHUB_TOKEN?.trim() || ''

function setCorsHeaders(headers: Headers) {
  headers.set('access-control-allow-origin', '*')
  headers.set('access-control-allow-methods', 'GET,POST,OPTIONS')
  headers.set('access-control-allow-headers', 'authorization,content-type,accept')
  headers.set('access-control-expose-headers', 'content-type')
}

function normalizeCatalogModels(payload: unknown): GitHubCatalogModel[] {
  if (Array.isArray(payload)) {
    return payload as GitHubCatalogModel[]
  }

  if (payload && typeof payload === 'object') {
    const record = payload as { items?: unknown, models?: unknown }
    if (Array.isArray(record.items)) {
      return record.items as GitHubCatalogModel[]
    }
    if (Array.isArray(record.models)) {
      return record.models as GitHubCatalogModel[]
    }
  }

  return []
}

function resolveAuthorizationHeader(request: Request) {
  return request.headers.get('authorization')?.trim() || (envApiKey ? `Bearer ${envApiKey}` : '')
}

function buildUpstreamHeaders(request: Request, authorization: string) {
  const headers = new Headers()
  headers.set('accept', request.headers.get('accept') || 'application/json')
  if (request.headers.get('content-type')) {
    headers.set('content-type', request.headers.get('content-type')!)
  }
  if (authorization) {
    headers.set('authorization', authorization)
  }
  return headers
}

function createJsonResponse(body: unknown, status = 200) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
  })
  setCorsHeaders(headers)
  return new Response(JSON.stringify(body), {
    status,
    headers,
  })
}

async function proxyRequest(request: Request, upstreamUrl: string) {
  const authorization = resolveAuthorizationHeader(request)
  if (!authorization) {
    return createJsonResponse({
      error: {
        message: 'Missing Authorization header for GitHub Models proxy.',
        type: 'invalid_request_error',
      },
    }, 401)
  }

  const body = request.method === 'GET' || request.method === 'HEAD'
    ? undefined
    : await request.arrayBuffer()

  const upstreamResponse = await fetch(upstreamUrl, {
    method: request.method,
    headers: buildUpstreamHeaders(request, authorization),
    body,
    ...(body ? { duplex: 'half' as const } : {}),
  })

  const headers = new Headers(upstreamResponse.headers)
  setCorsHeaders(headers)
  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    statusText: upstreamResponse.statusText,
    headers,
  })
}

async function handleModelsRequest(request: Request) {
  const authorization = resolveAuthorizationHeader(request)
  if (!authorization) {
    return createJsonResponse({
      error: {
        message: 'Missing Authorization header for GitHub Models proxy.',
        type: 'invalid_request_error',
      },
    }, 401)
  }

  const upstreamResponse = await fetch(upstreamCatalogUrl, {
    headers: buildUpstreamHeaders(request, authorization),
  })
  if (!upstreamResponse.ok) {
    const detail = (await upstreamResponse.text()).trim() || upstreamResponse.statusText || 'Unknown error.'
    return createJsonResponse({
      error: {
        message: `GitHub Models catalog request failed: ${detail}`,
        type: 'upstream_error',
      },
    }, upstreamResponse.status)
  }

  const models = normalizeCatalogModels(await upstreamResponse.json())
  return createJsonResponse({
    object: 'list',
    data: models
      .filter(model => typeof model.id === 'string' && model.id.length > 0)
      .map(model => ({
        id: model.id,
        object: 'model',
        created: 0,
        owned_by: 'github-models',
        name: model.name || model.id,
      })),
  })
}

async function handleRequest(request: Request) {
  const url = new URL(request.url)
  if (request.method === 'OPTIONS') {
    const headers = new Headers()
    setCorsHeaders(headers)
    return new Response(null, { status: 204, headers })
  }

  if (url.pathname === '/health' || url.pathname === '/v1/health') {
    return createJsonResponse({
      ok: true,
      upstreamInferenceBaseUrl,
      upstreamCatalogUrl,
    })
  }

  if (url.pathname === '/models' || url.pathname === '/v1/models') {
    return await handleModelsRequest(request)
  }

  if (url.pathname === '/chat/completions' || url.pathname === '/v1/chat/completions') {
    return await proxyRequest(request, `${upstreamInferenceBaseUrl.replace(/\/$/, '')}/chat/completions`)
  }

  return createJsonResponse({
    error: {
      message: `Unsupported proxy route: ${url.pathname}`,
      type: 'invalid_request_error',
    },
  }, 404)
}

const server = createServer(async (incomingRequest, outgoingResponse) => {
  try {
    const request = new Request(`http://${listenHost}:${listenPort}${incomingRequest.url || '/'}`, {
      method: incomingRequest.method,
      headers: incomingRequest.headers as Record<string, string>,
      body: incomingRequest.method === 'GET' || incomingRequest.method === 'HEAD'
        ? undefined
        : Readable.toWeb(incomingRequest) as ReadableStream,
      ...(incomingRequest.method === 'GET' || incomingRequest.method === 'HEAD' ? {} : { duplex: 'half' as const }),
    })

    const response = await handleRequest(request)
    outgoingResponse.writeHead(response.status, Object.fromEntries(response.headers.entries()))

    if (!response.body) {
      outgoingResponse.end()
      return
    }

    Readable.fromWeb(response.body as ReadableStream).pipe(outgoingResponse)
  }
  catch (error) {
    outgoingResponse.writeHead(500, {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
    })
    outgoingResponse.end(JSON.stringify({
      error: {
        message: error instanceof Error ? error.message : String(error),
        type: 'proxy_error',
      },
    }))
  }
})

server.listen(listenPort, listenHost, () => {
  console.info(`github-models-openai-proxy listening on http://${listenHost}:${listenPort}/v1/`)
})

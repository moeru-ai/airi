import type { createContext as createMainEventaContext } from '@moeru/eventa/adapters/electron/main'

import { defineStreamInvokeHandler } from '@moeru/eventa'
import { openAICompatibleFetch } from '@proj-airi/stage-shared'
import { object, optional, record, safeParse, string } from 'valibot'

const bridgeRequestSchema = object({
  url: string(),
  baseUrl: string(),
  method: optional(string()),
  headers: optional(record(string(), string())),
  body: optional(string()),
})

function normalizeRequestMethod(method: string | undefined): string {
  return (method ?? 'GET').toUpperCase()
}

function normalizePathname(pathname: string): string {
  return pathname.replace(/\/+$/, '')
}

function isAllowedBridgePath(url: URL, method: string): boolean {
  const pathname = normalizePathname(url.pathname)
  if ((method === 'GET' || method === 'HEAD') && pathname.endsWith('/models'))
    return true

  return method === 'POST' && pathname.endsWith('/chat/completions')
}

function isWithinBaseUrl(url: URL, baseUrl: URL): boolean {
  if (url.origin !== baseUrl.origin)
    return false

  const basePathname = baseUrl.pathname.endsWith('/') ? baseUrl.pathname : `${baseUrl.pathname}/`
  return url.pathname.startsWith(basePathname)
}

function parseBridgePayload(payload: unknown) {
  const result = safeParse(bridgeRequestSchema, payload)
  if (!result.success)
    throw new Error('Invalid OpenAI-compatible fetch bridge payload.')

  return result.output
}

function assertOpenAICompatibleBridgeScope(url: URL, baseUrl: URL, method: string) {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('OpenAI-compatible fetch only supports http and https URLs.')
  }
  if (baseUrl.protocol !== 'http:' && baseUrl.protocol !== 'https:') {
    throw new Error('OpenAI-compatible fetch only supports http and https base URLs.')
  }
  if (!isWithinBaseUrl(url, baseUrl)) {
    throw new Error('OpenAI-compatible fetch bridge only supports requests within the configured provider base URL.')
  }
  if (!isAllowedBridgePath(url, method)) {
    throw new Error('OpenAI-compatible fetch bridge only supports model listing and chat completions requests.')
  }
}

export function setupOpenAICompatibleFetchBridge(params: {
  context: ReturnType<typeof createMainEventaContext>['context']
}) {
  defineStreamInvokeHandler(params.context, openAICompatibleFetch, async function* (payload, options) {
    const request = parseBridgePayload(payload)
    const url = new URL(request.url)
    const baseUrl = new URL(request.baseUrl)
    const method = normalizeRequestMethod(request.method)
    assertOpenAICompatibleBridgeScope(url, baseUrl, method)

    const response = await fetch(url, {
      method,
      headers: request.headers,
      body: request.body,
      signal: options?.abortController?.signal,
    })

    yield {
      type: 'head' as const,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
    }

    if (!response.body)
      return

    const reader = response.body.getReader()
    let completed = false
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          completed = true
          return
        }

        yield { type: 'chunk' as const, chunk: value }
      }
    }
    finally {
      if (!completed) {
        try {
          await reader.cancel()
        }
        catch {}
      }
      reader.releaseLock()
    }
  })
}

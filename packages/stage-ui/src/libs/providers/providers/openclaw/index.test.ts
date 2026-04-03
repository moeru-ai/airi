import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { providerOpenClaw } from './index'
import {
  buildOpenClawSessionHeaders,
  normalizeOpenClawTarget,
  resolveOpenClawApiBaseUrl,
} from './shared'

describe('providerOpenClaw shared helpers', () => {
  it('normalizes base URLs to the /v1 API path', () => {
    expect(resolveOpenClawApiBaseUrl('http://localhost:18789')).toBe('http://localhost:18789/v1')
    expect(resolveOpenClawApiBaseUrl('http://localhost:18789/v1')).toBe('http://localhost:18789/v1')
  })

  it('normalizes agent target formats', () => {
    expect(normalizeOpenClawTarget('planner', 'default')).toBe('openclaw/planner')
    expect(normalizeOpenClawTarget('openclaw:planner', 'default')).toBe('openclaw/planner')
    expect(normalizeOpenClawTarget('agent:planner', 'default')).toBe('openclaw/planner')
  })

  it('builds stable session headers', () => {
    expect(buildOpenClawSessionHeaders({
      activeSessionId: 'session-1',
      sessionStrategy: 'auto',
    })).toEqual({
      'x-openclaw-session-key': 'session-1',
    })

    expect(buildOpenClawSessionHeaders({
      sessionStrategy: 'manual',
      sessionKey: 'team-room-1',
    })).toEqual({
      'x-openclaw-session-key': 'team-room-1',
    })
  })
})

describe('providerOpenClaw.createProvider', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('rewrites chat completions requests to OpenClaw targets and preserves session continuity', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    globalThis.fetch = fetchMock as typeof globalThis.fetch

    const provider = providerOpenClaw.createProvider({
      apiKey: 'test-key',
      baseUrl: 'http://localhost:18789',
      agentId: 'default',
      sessionStrategy: 'auto',
      apiMode: 'chat_completions',
    }) as any

    await provider.chat('planner').fetch('http://localhost:18789/v1/chat/completions', {
      method: 'POST',
      headers: {
        'x-openclaw-session-key': 'session-1',
      },
      body: JSON.stringify({
        model: 'planner',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:18789/v1/chat/completions')
    expect((init.headers as Headers).get('authorization')).toBe('Bearer test-key')
    expect((init.headers as Headers).get('x-openclaw-scopes')).toBe('operator.write')

    const body = JSON.parse(String(init.body))
    expect(body.model).toBe('openclaw/planner')
    expect(body.user).toBe('session-1')
  })

  it('rewrites non-streaming responses mode requests and maps the payload back to chat completions format', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'resp-1',
      output_text: 'hello from responses',
      status: 'completed',
      model: 'openclaw/default',
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    globalThis.fetch = fetchMock as typeof globalThis.fetch

    const provider = providerOpenClaw.createProvider({
      apiKey: 'test-key',
      baseUrl: 'http://localhost:18789',
      agentId: 'default',
      sessionStrategy: 'manual',
      sessionKey: 'team-room-1',
      apiMode: 'responses',
    }) as any

    const response = await provider.chat('openclaw/default').fetch('http://localhost:18789/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: 'openclaw/default',
        stream: false,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:18789/v1/responses')
    expect((init.headers as Headers).get('x-openclaw-scopes')).toBe('operator.write')

    const body = JSON.parse(String(init.body))
    expect(body.model).toBe('openclaw/default')
    expect(body.user).toBe('team-room-1')

    const payload = await response.json() as any
    expect(payload.choices[0].message.content).toBe('hello from responses')
  })

  it('returns a placeholder error response for streaming responses mode', async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock as typeof globalThis.fetch

    const provider = providerOpenClaw.createProvider({
      apiKey: 'test-key',
      baseUrl: 'http://localhost:18789',
      agentId: 'default',
      sessionStrategy: 'auto',
      apiMode: 'responses',
    }) as any

    const response = await provider.chat('openclaw/default').fetch('http://localhost:18789/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: 'openclaw/default',
        stream: true,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(response.status).toBe(501)
  })

  it('lists OpenClaw agent targets through extraMethods.listModels', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [
        { id: 'openclaw/default' },
        { id: 'openclaw/planner', description: 'Planner agent' },
      ],
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    globalThis.fetch = fetchMock as typeof globalThis.fetch

    const config = {
      apiKey: 'test-key',
      baseUrl: 'http://localhost:18789',
      agentId: 'default',
      sessionStrategy: 'auto',
      apiMode: 'chat_completions',
    } as const
    const provider = providerOpenClaw.createProvider(config) as any
    const models = await providerOpenClaw.extraMethods?.listModels?.(config, provider)

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.headers).toMatchObject({
      'Authorization': 'Bearer test-key',
      'X-OpenClaw-Scopes': 'operator.write',
    })

    expect(models).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'openclaw/default', name: 'Default Agent' }),
      expect.objectContaining({ id: 'openclaw/planner', description: 'Planner agent' }),
    ]))
  })

  it('validates required config fields and manual session key requirements', async () => {
    const validatorFactory = providerOpenClaw.validators?.validateConfig?.[0]
    expect(validatorFactory).toBeDefined()

    const validator = validatorFactory!({ t: input => input })
    const invalid = await validator.validator({
      apiKey: '',
      baseUrl: 'http://localhost:18789',
      agentId: 'default',
      sessionStrategy: 'manual',
      sessionKey: '',
      apiMode: 'chat_completions',
    } as any, { t: input => input })

    expect(invalid.valid).toBe(false)
    expect(invalid.reason).toContain('API key is required.')
    expect(invalid.reason).toContain('Session key is required when session strategy is manual.')
  })

  it('surfaces model listing failures when the endpoint is unauthorized', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('Unauthorized', { status: 401 }))
    globalThis.fetch = fetchMock as typeof globalThis.fetch

    const config = {
      apiKey: 'bad-key',
      baseUrl: 'http://localhost:18789',
      agentId: 'default',
      sessionStrategy: 'auto',
      apiMode: 'chat_completions',
    } as const
    const provider = providerOpenClaw.createProvider(config) as any

    await expect(providerOpenClaw.extraMethods?.listModels?.(config, provider)).rejects.toThrow('Failed to list OpenClaw models: HTTP 401')
  })
})

import type { AgentTraceService } from '../../services/domain/agent-trace'
import type { HonoEnv } from '../../types/hono'

import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { createAgentTraceRoutes } from '.'
import { ApiError } from '../../utils/error'

function createApp(signedIn: boolean) {
  const service = { ingest: vi.fn(async () => ({ accepted: 1, droppedSpans: 0, droppedAttributes: 0 })), deleteAllForUser: vi.fn() } satisfies AgentTraceService
  const app = new Hono<HonoEnv>()
  app.onError((error, context) => error instanceof ApiError ? context.json({ error: error.errorCode }, error.statusCode as 400) : context.json({ error: 'INTERNAL' }, 500))
  app.use('*', async (context, next) => {
    if (signedIn)
      context.set('user', { id: 'user-1', name: 'Test', email: 'test@example.com', emailVerified: true, createdAt: new Date(), updatedAt: new Date() })
    await next()
  })
  app.route('/', createAgentTraceRoutes(service, null))
  const post = (body: string) => app.request('/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
  return { post, service }
}

const valid = { resource: { appSurface: 'web' }, spans: [{ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), name: 'Interaction turn', startTimeUnixMs: 1, status: 'ok' }] }

describe('agent trace routes', () => {
  it('stores a valid upload for the signed-in user', async () => {
    const { post, service } = createApp(true)
    const response = await post(JSON.stringify(valid))
    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({ accepted: 1, droppedSpans: 0, droppedAttributes: 0 })
    expect(service.ingest).toHaveBeenCalledWith('user-1', expect.objectContaining({ spans: [expect.objectContaining({ attributes: {} })] }))
  })

  it('rejects a request without a user, malformed JSON, and a span with an invalid ID', async () => {
    expect((await createApp(false).post(JSON.stringify(valid))).status).toBe(401)
    const { post, service } = createApp(true)
    expect((await post('{"spans":')).status).toBe(400)
    expect((await post(JSON.stringify({ ...valid, spans: [{ ...valid.spans[0], traceId: 'not-hex' }] }))).status).toBe(400)
    expect((await post(JSON.stringify({ ...valid, spans: [] }))).status).toBe(400)
    expect(service.ingest).not.toHaveBeenCalled()
  })
})

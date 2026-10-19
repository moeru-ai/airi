import type { RequestLogService } from '../../services/domain/request-log'
import type { HonoEnv } from '../../types/hono'

import { useLogger } from '@guiiai/logg'
import { createErrorHandler } from '@proj-airi/http-error-shared'
import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { createLlmRequestRoutes } from '.'

function createTestApp(service: Pick<RequestLogService, 'getRequest' | 'listRequests'>) {
  return new Hono<HonoEnv>()
    .onError(createErrorHandler(useLogger('test')))
    .use('*', async (c, next) => {
      c.set('user', { id: 'user-1' } as HonoEnv['Variables']['user'])
      await next()
    })
    .route('/api/v1/llm-requests', createLlmRequestRoutes(service as RequestLogService))
}

describe('llm request routes', () => {
  it('returns the shared error body for an invalid request ID', async () => {
    const service = { getRequest: vi.fn(), listRequests: vi.fn() }

    const response = await createTestApp(service).request(`/api/v1/llm-requests/${'x'.repeat(129)}`)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'INVALID_REQUEST_ID', message: 'Invalid request ID' })
    expect(service.getRequest).not.toHaveBeenCalled()
  })

  it('returns the shared error body when the request does not belong to the user', async () => {
    const service = { getRequest: vi.fn(async () => ({ request: undefined, attempts: [] })), listRequests: vi.fn() }

    const response = await createTestApp(service).request('/api/v1/llm-requests/req-1')

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'NOT_FOUND', message: 'LLM request not found' })
    expect(service.getRequest).toHaveBeenCalledWith('user-1', 'req-1')
  })
})

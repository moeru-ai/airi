import type { AdminRouterConfigService } from '../../../../services/domain/admin/router-config'
import type { HonoEnv } from '../../../../types/hono'

import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'

import { createAdminRouterConfigRoutes } from '.'
import { ApiError } from '../../../../utils/error'

function createTestApp(service: AdminRouterConfigService) {
  return new Hono<HonoEnv>()
    .use('*', async (c, next) => {
      c.set('user', { id: 'admin-1', email: 'admin@example.com', role: 'admin' } as HonoEnv['Variables']['user'])
      await next()
    })
    .route('/api/admin/config/router', createAdminRouterConfigRoutes(service))
    .onError((err, c) => {
      if (err instanceof ApiError)
        return c.json({ error: err.errorCode, message: err.message, details: err.details }, err.statusCode)
      return c.json({ error: 'internal', message: (err as Error).message }, 500)
    })
}

describe('admin router config route', () => {
  it('accepts Bedrock bearer tokens longer than ordinary provider keys', async () => {
    const service: AdminRouterConfigService = {
      apply: vi.fn(async () => ({
        applied: [],
        invalidatedKeys: [],
        preview: {},
      })),
      current: vi.fn(),
    }
    const app = createTestApp(service)
    const body = {
      mode: 'merge',
      slices: [{
        kind: 'bedrock',
        modelName: 'chat-bedrock',
        overrideModel: 'us.amazon.nova-pro-v1:0',
        baseURL: 'https://bedrock-mantle.us-east-1.api.aws/v1',
        plaintextKey: `bedrock-api-key-${'x'.repeat(2180)}`,
      }],
      dryRun: false,
    }

    const res = await app.request('/api/admin/config/router', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

    expect(res.status).toBe(200)
    expect(service.apply).toHaveBeenCalledWith(expect.objectContaining({
      slices: [expect.objectContaining({
        kind: 'bedrock',
        plaintextKey: expect.stringMatching(/^bedrock-api-key-/u),
      })],
    }))
  })
})

import { useLogger } from '@guiiai/logg'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { describe, expect, it } from 'vitest'

import { createBadGatewayError, createPayloadTooLargeError } from './error'
import { createErrorHandler } from './handler'

function createApp() {
  return new Hono()
    .onError(createErrorHandler(useLogger('test')))
    .get('/api-error', () => {
      throw createBadGatewayError('Upstream failed', { triedKeys: 2 })
    })
    .get('/api-error-with-cause', () => {
      const error = createBadGatewayError()
      error.cause = { attempts: [{ bodySnippet: 'upstream secret' }] }
      throw error
    })
    .get('/unknown-error', () => {
      throw new Error('database password is wrong')
    })
    .post(
      '/limited',
      bodyLimit({
        maxSize: 4,
        onError: () => {
          throw createPayloadTooLargeError('Payload Too Large')
        },
      }),
      c => c.json({ ok: true }),
    )
}

describe('createErrorHandler', () => {
  it('writes the error code, message, and details of an ApiError', async () => {
    const response = await createApp().request('/api-error')

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({
      error: 'BAD_GATEWAY',
      message: 'Upstream failed',
      details: { triedKeys: 2 },
    })
  })

  it('omits details and cause when the ApiError has no details', async () => {
    const response = await createApp().request('/api-error-with-cause')

    expect(response.status).toBe(502)
    expect(await response.json()).toEqual({ error: 'BAD_GATEWAY', message: 'Bad Gateway' })
  })

  it('hides the message of an error that is not an ApiError', async () => {
    const response = await createApp().request('/unknown-error')

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'INTERNAL_SERVER_ERROR', message: 'Internal Server Error' })
  })

  it('writes the same body for an ApiError that a middleware callback throws', async () => {
    const response = await createApp().request('/limited', { method: 'POST', body: 'too long' })

    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({ error: 'PAYLOAD_TOO_LARGE', message: 'Payload Too Large' })
  })
})

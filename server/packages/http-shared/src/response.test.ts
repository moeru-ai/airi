import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'

import { created, list, noContent, ok, paginated } from './response'

describe('success responses', () => {
  const app = new Hono()
    .get('/ok', c => ok(c, { id: 'a', createdAt: new Date('2026-01-02T03:04:05.000Z') }))
    .post('/created', c => created(c, { id: 'b' }))
    .delete('/deleted', c => noContent(c))
    .get('/list', c => list(c, [{ id: 'c' }]))
    .get('/page', c => paginated(c, { records: [{ id: 'd' }], hasMore: true }))
    // @ts-expect-error A success body is never a bare array.
    .get('/array', c => ok(c, [{ id: 'e' }]))

  it('returns the resource with 200', async () => {
    const res = await app.request('/ok')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ id: 'a', createdAt: '2026-01-02T03:04:05.000Z' })
  })

  it('returns the created resource with 201', async () => {
    const res = await app.request('/created', { method: 'POST' })
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: 'b' })
  })

  it('returns 204 with no body after a delete', async () => {
    const res = await app.request('/deleted', { method: 'DELETE' })
    expect(res.status).toBe(204)
    expect(await res.text()).toBe('')
  })

  it('wraps a list in records', async () => {
    const res = await app.request('/list')
    expect(await res.json()).toEqual({ records: [{ id: 'c' }] })
  })

  it('returns records and hasMore for a page', async () => {
    const res = await app.request('/page')
    expect(await res.json()).toEqual({ records: [{ id: 'd' }], hasMore: true })
  })
})

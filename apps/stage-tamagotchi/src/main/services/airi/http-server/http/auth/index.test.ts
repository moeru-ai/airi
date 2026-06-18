import { afterEach, describe, expect, it } from 'vitest'

import { startLoopbackServer } from './index'

describe('startLoopbackServer', () => {
  const servers: Array<Awaited<ReturnType<typeof startLoopbackServer>>> = []

  afterEach(async () => {
    for (const server of servers.splice(0)) {
      server.close()
      await server.result.catch(() => {})
    }
  })

  it('returns code and state from callback', async () => {
    const server = await startLoopbackServer()
    servers.push(server)

    const response = await fetch(`http://127.0.0.1:${server.port}/callback?code=ok&state=state-1`)
    expect(response.status).toBe(200)

    await expect(server.result).resolves.toEqual({ code: 'ok', state: 'state-1' })
  })

  it('allows browser private-network preflight for the callback relay', async () => {
    const server = await startLoopbackServer()
    servers.push(server)

    const response = await fetch(`http://127.0.0.1:${server.port}/callback`, {
      method: 'OPTIONS',
      headers: {
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Private-Network': 'true',
        'Origin': 'https://accounts.airi.build',
      },
    })

    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Private-Network')).toBe('true')
  })
})

import { afterEach, describe, expect, it } from 'vitest'

import { startLoopbackServer } from './index'

/**
 * @example
 * const server = await startLoopbackServer('expected-state')
 */
describe('startLoopbackServer', () => {
  const servers: Array<Awaited<ReturnType<typeof startLoopbackServer>>> = []

  afterEach(async () => {
    for (const server of servers.splice(0)) {
      server.close()
      await server.result.catch(() => {})
    }
  })

  /** @example A callback with the expected state resolves the authorization code. */
  it('returns the code from a callback with the expected state', async () => {
    const server = await startLoopbackServer('state-1')
    servers.push(server)

    const response = await fetch(`http://127.0.0.1:${server.port}/callback?code=ok&state=state-1`)
    expect(response.status).toBe(200)

    await expect(server.result).resolves.toEqual({ code: 'ok' })
  })

  /** @example A forged callback cannot consume the one-shot server before the valid callback. */
  it('rejects a mismatched state without settling the login attempt', async () => {
    const server = await startLoopbackServer('expected-state')
    servers.push(server)

    const forgedResponse = await fetch(`http://127.0.0.1:${server.port}/callback?code=forged&state=wrong-state`)
    expect(forgedResponse.status).toBe(400)

    const validResponse = await fetch(`http://127.0.0.1:${server.port}/callback?code=valid&state=expected-state`)
    expect(validResponse.status).toBe(200)

    await expect(server.result).resolves.toEqual({ code: 'valid' })
  })

  /** @example The web relay receives ordinary CORS without the obsolete PNA response header. */
  it('keeps standard CORS for the relay without private-network access headers', async () => {
    const server = await startLoopbackServer('state-1')
    servers.push(server)

    const response = await fetch(`http://127.0.0.1:${server.port}/callback?code=ok&state=state-1`, {
      headers: {
        Origin: 'https://accounts.airi.build',
      },
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Access-Control-Allow-Private-Network')).toBeNull()
    await expect(server.result).resolves.toEqual({ code: 'ok' })
  })
})

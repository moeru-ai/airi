import { createServer } from 'node:http'

import { describe, expect, it } from 'vitest'

import { createOpenpanelSink } from './openpanel'

describe('openPanel sink', () => {
  it('isolates concurrent user identities and preserves checkout device attribution', async () => {
    const bodies: string[] = []
    const server = createServer(async (request, response) => {
      let body = ''
      for await (const chunk of request)
        body += chunk
      bodies.push(body)
      response.writeHead(200).end('{}')
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Expected a TCP server address')
    try {
      const sink = createOpenpanelSink({ apiUrl: `http://127.0.0.1:${address.port}`, clientId: 'test-client', clientSecret: 'test-secret' })
      await Promise.all([
        sink.capture({ userId: 'alice', event: 'payment_completed', deviceId: 'alice-device', properties: { event_id: 'cs_alice' } }),
        sink.capture({ userId: 'bob', event: 'signup_completed', properties: {} }),
      ])
      expect(bodies.map(body => JSON.parse(body))).toEqual(expect.arrayContaining([
        { type: 'track', payload: { name: 'payment_completed', profileId: 'alice', properties: { event_id: 'cs_alice', __deviceId: 'alice-device' } } },
        { type: 'track', payload: { name: 'signup_completed', profileId: 'bob', properties: {} } },
      ]))
    }
    finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })

  it('does not retry a rejected conversion request', async () => {
    let requests = 0
    const server = createServer((_request, response) => {
      requests++
      response.writeHead(503).end('Unavailable')
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Expected a TCP server address')
    try {
      const sink = createOpenpanelSink({ apiUrl: `http://127.0.0.1:${address.port}`, clientId: 'test-client', clientSecret: 'test-secret' })
      await expect(sink.capture({ userId: 'alice', event: 'payment_completed', properties: {} })).rejects.toThrow('503')
      expect(requests).toBe(1)
    }
    finally {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })
})

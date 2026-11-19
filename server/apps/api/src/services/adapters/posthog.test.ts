import type { IncomingMessage } from 'node:http'

import { Buffer } from 'node:buffer'
import { createServer } from 'node:http'
import { gunzipSync } from 'node:zlib'

import { describe, expect, it } from 'vitest'

import { createPosthogSink } from './posthog'

interface CapturedEvent {
  event: string
  distinct_id: string
  uuid: string
  properties: Record<string, unknown>
}

async function readEvents(request: IncomingMessage): Promise<CapturedEvent[]> {
  const chunks: Buffer[] = []
  for await (const chunk of request)
    chunks.push(chunk as Buffer)
  const raw = Buffer.concat(chunks)
  const body = request.headers['content-encoding'] === 'gzip' ? gunzipSync(raw) : raw
  return (JSON.parse(body.toString('utf8')) as { batch: CapturedEvent[] }).batch
}

async function withPosthogServer(status: number, run: (host: string, events: CapturedEvent[], requests: () => number) => Promise<void>) {
  const events: CapturedEvent[] = []
  let requests = 0
  const server = createServer(async (request, response) => {
    requests++
    events.push(...await readEvents(request))
    response.writeHead(status, { 'content-type': 'application/json' }).end('{}')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Expected a TCP server address')
  try {
    await run(`http://127.0.0.1:${address.port}`, events, () => requests)
  }
  finally {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}

describe('posthog sink', () => {
  it('merges the checkout browser into the user and gives replays the same event uuid', async () => {
    await withPosthogServer(200, async (host, events) => {
      const sink = createPosthogSink({ projectKey: 'phc_test', host })
      const input = {
        userId: 'alice',
        event: 'payment_completed',
        posthogDistinctId: 'browser-1',
        posthogSessionId: 'session-1',
        eventId: 'cs_alice',
        properties: { event_id: 'cs_alice' },
      }
      await sink.capture(input)
      await sink.capture(input)
      await sink.capture({ userId: 'bob', event: 'signup_completed', properties: {} })
      await sink.shutdown()

      expect(events.map(event => [event.event, event.distinct_id])).toEqual([
        ['$identify', 'alice'],
        ['payment_completed', 'alice'],
        ['$identify', 'alice'],
        ['payment_completed', 'alice'],
        ['signup_completed', 'bob'],
      ])
      expect(events[0].properties).toMatchObject({ $anon_distinct_id: 'browser-1', $session_id: 'session-1' })
      expect(events[1].properties).toMatchObject({ event_id: 'cs_alice', $session_id: 'session-1' })
      expect(events[2].uuid).toBe(events[0].uuid)
      expect(events[3].uuid).toBe(events[1].uuid)
      expect(events[1].uuid).not.toBe(events[0].uuid)
      expect(events[4].properties).not.toHaveProperty('$anon_distinct_id')
    })
  })

  it('makes one attempt and does not throw when PostHog rejects the event', async () => {
    await withPosthogServer(503, async (host, _events, requests) => {
      const sink = createPosthogSink({ projectKey: 'phc_test', host })
      await expect(sink.capture({ userId: 'alice', event: 'payment_completed', properties: {} })).resolves.toBeUndefined()
      await sink.shutdown()
      expect(requests()).toBe(1)
    })
  })
})

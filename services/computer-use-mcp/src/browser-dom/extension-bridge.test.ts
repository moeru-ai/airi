import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket } from 'ws'

import { BrowserDomExtensionBridge } from './extension-bridge'

describe('browserDomExtensionBridge', () => {
  let bridge: BrowserDomExtensionBridge | undefined
  let client: WebSocket | undefined

  afterEach(async () => {
    client?.close()
    client = undefined
    await bridge?.close()
    bridge = undefined
  })

  it('round-trips actions over the extension websocket bridge', async () => {
    bridge = new BrowserDomExtensionBridge({
      enabled: true,
      host: '127.0.0.1',
      port: 0,
      requestTimeoutMs: 1_000,
    })
    await bridge.start()

    const status = bridge.getStatus()
    client = new WebSocket(`ws://${status.host}:${status.port}`)

    client.on('message', (raw) => {
      const data = JSON.parse(String(raw)) as Record<string, unknown>
      if (typeof data.id !== 'string')
        return

      if (data.action === 'getActiveTab') {
        client!.send(JSON.stringify({
          id: data.id,
          ok: true,
          result: {
            title: 'AIRI Demo Tab',
            url: 'https://example.com/demo',
          },
        }))
      }
    })

    await new Promise<void>((resolve, reject) => {
      client!.once('open', () => {
        client!.send(JSON.stringify({
          type: 'hello',
          source: 'test-extension',
          version: 'bridge-test',
        }))
        resolve()
      })
      client!.once('error', reject)
    })

    const activeTab = await bridge.getActiveTab()

    expect(activeTab).toEqual({
      title: 'AIRI Demo Tab',
      url: 'https://example.com/demo',
    })
    expect(bridge.getStatus().connected).toBe(true)
    expect(bridge.getStatus().lastHello?.source).toBe('test-extension')
  })
})

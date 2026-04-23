import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket, WebSocketServer } from 'ws'

import { BrowserDomExtensionBridge } from './extension-bridge'

describe('browserDomExtensionBridge', () => {
  let bridge: BrowserDomExtensionBridge | undefined
  let client: WebSocket | undefined
  let blocker: WebSocketServer | undefined

  afterEach(async () => {
    client?.close()
    client = undefined
    await new Promise<void>((resolve) => {
      blocker?.close(() => resolve())
      if (!blocker)
        resolve()
    })
    blocker = undefined
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

  it('rejects clickSelector on the read-only extension transport even when getClickTarget succeeds', async () => {
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

      if (data.action === 'getClickTarget') {
        client!.send(JSON.stringify({
          id: data.id,
          ok: true,
          result: [
            {
              frameId: 5,
              result: {
                success: true,
                x: 321,
                y: 182,
                element: {
                  tag: 'button',
                  text: 'Submit',
                },
                center: {
                  x: 321,
                  y: 182,
                },
              },
            },
          ],
        }))
        return
      }

      if (data.action === 'clickAt') {
        client!.send(JSON.stringify({
          id: data.id,
          ok: true,
          result: [
            {
              frameId: 5,
              result: {
                success: true,
              },
            },
          ],
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

    await expect(bridge.clickSelector({
      selector: '#submit',
      frameIds: [5],
    })).rejects.toThrow('does not support action "clickAt"')
  })

  it('rejects unsupported DOM-mutating actions before sending them to the extension transport', async () => {
    bridge = new BrowserDomExtensionBridge({
      enabled: true,
      host: '127.0.0.1',
      port: 0,
      requestTimeoutMs: 1_000,
    })
    await bridge.start()

    expect(bridge.supportsAction('readAllFramesDOM')).toBe(true)
    expect(bridge.supportsAction('setInputValue')).toBe(false)
    await expect(bridge.setInputValue({
      selector: '#email',
      value: 'hello@example.com',
    })).rejects.toThrow('does not support action "setInputValue"')
  })

  it('can retry startup after an initial bind failure', async () => {
    blocker = new WebSocketServer({
      host: '127.0.0.1',
      port: 0,
    })
    await new Promise<void>((resolve, reject) => {
      blocker!.once('listening', () => resolve())
      blocker!.once('error', reject)
    })

    const blockedPort = (blocker.address() as { port: number }).port

    bridge = new BrowserDomExtensionBridge({
      enabled: true,
      host: '127.0.0.1',
      port: blockedPort,
      requestTimeoutMs: 1_000,
    })

    await bridge.start()
    expect(bridge.getStatus().lastError).toBeTruthy()

    await new Promise<void>(resolve => blocker!.close(() => resolve()))
    blocker = undefined

    await bridge.start()

    const status = bridge.getStatus()
    expect(status.lastError).toBeUndefined()

    client = new WebSocket(`ws://${status.host}:${status.port}`)
    await new Promise<void>((resolve, reject) => {
      client!.once('open', resolve)
      client!.once('error', reject)
    })

    expect(bridge.getStatus().connected).toBe(true)

    client.send(JSON.stringify({
      type: 'hello',
      source: 'test-extension',
      version: 'bridge-test',
    }))

    await new Promise(resolve => setTimeout(resolve, 10))
    expect(bridge.getStatus().connected).toBe(true)
  })

  it('rejects in-flight requests immediately when the socket disconnects', async () => {
    bridge = new BrowserDomExtensionBridge({
      enabled: true,
      host: '127.0.0.1',
      port: 0,
      requestTimeoutMs: 10_000,
    })
    await bridge.start()

    const status = bridge.getStatus()
    client = new WebSocket(`ws://${status.host}:${status.port}`)

    client.on('message', (raw) => {
      const data = JSON.parse(String(raw)) as Record<string, unknown>
      if (data.action === 'getActiveTab') {
        client!.close()
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

    const startedAt = Date.now()

    await expect(bridge.getActiveTab()).rejects.toThrow('browser dom bridge disconnected before completing pending request')
    expect(Date.now() - startedAt).toBeLessThan(1_000)
    expect(bridge.getStatus().pendingRequests).toBe(0)
    expect(bridge.getStatus().connected).toBe(false)
  })
})

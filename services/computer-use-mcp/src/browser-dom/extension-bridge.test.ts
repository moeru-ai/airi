import { afterEach, describe, expect, it } from 'vitest'
import { WebSocket, WebSocketServer } from 'ws'

import { BrowserDomExtensionBridge } from './extension-bridge'

/**
 * Helper: create a bridge + client pair, wait for the client to connect
 * and send the hello handshake.
 */
async function createConnectedBridge(config?: Partial<{
  requestTimeoutMs: number
}>) {
  const bridge = new BrowserDomExtensionBridge({
    enabled: true,
    host: '127.0.0.1',
    port: 0,
    requestTimeoutMs: config?.requestTimeoutMs ?? 1_000,
  })
  await bridge.start()

  const status = bridge.getStatus()
  const client = new WebSocket(`ws://${status.host}:${status.port}`)

  await new Promise<void>((resolve, reject) => {
    client.once('open', () => {
      client.send(JSON.stringify({
        type: 'hello',
        source: 'test-extension',
        version: 'bridge-test',
      }))
      resolve()
    })
    client.once('error', reject)
  })

  return { bridge, client }
}

/**
 * Helper: register a mock handler on the client that echoes a fixed
 * result for a given action name.
 */
function mockClientAction(
  client: WebSocket,
  actionName: string,
  resultFn: (data: Record<string, unknown>) => unknown,
  opts?: { delayMs?: number },
) {
  client.on('message', (raw) => {
    const data = JSON.parse(String(raw)) as Record<string, unknown>
    if (typeof data.id !== 'string')
      return
    if (data.action !== actionName)
      return

    const respond = () => {
      client.send(JSON.stringify({
        id: data.id,
        ok: true,
        result: resultFn(data),
      }))
    }

    if (opts?.delayMs) {
      setTimeout(respond, opts.delayMs)
    }
    else {
      respond()
    }
  })
}

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
    const result = await createConnectedBridge()
    bridge = result.bridge
    client = result.client

    mockClientAction(client, 'getActiveTab', () => ({
      title: 'AIRI Demo Tab',
      url: 'https://example.com/demo',
    }))

    const activeTab = await bridge.getActiveTab()

    expect(activeTab).toEqual({
      title: 'AIRI Demo Tab',
      url: 'https://example.com/demo',
    })
    expect(bridge.getStatus().connected).toBe(true)
    expect(bridge.getStatus().lastHello?.source).toBe('test-extension')
  })

  it('supportsAction returns true for read-only actions and false for mutating actions', () => {
    bridge = new BrowserDomExtensionBridge({
      enabled: true,
      host: '127.0.0.1',
      port: 0,
      requestTimeoutMs: 1_000,
    })

    // Read-only actions should be supported
    expect(bridge.supportsAction('readInputValue')).toBe(true)
    expect(bridge.supportsAction('getComputedStyles')).toBe(true)
    expect(bridge.supportsAction('waitForElement')).toBe(true)
    expect(bridge.supportsAction('getActiveTab')).toBe(true)
    expect(bridge.supportsAction('findElements')).toBe(true)
    expect(bridge.supportsAction('getElementAttributes')).toBe(true)

    // Mutating actions should NOT be supported
    expect(bridge.supportsAction('setInputValue')).toBe(false)
    expect(bridge.supportsAction('checkCheckbox')).toBe(false)
    expect(bridge.supportsAction('selectOption')).toBe(false)
    expect(bridge.supportsAction('triggerEvent')).toBe(false)
    expect(bridge.supportsAction('clickAt')).toBe(false)
  })

  it('readInputValue round-trips through the bridge', async () => {
    const result = await createConnectedBridge()
    bridge = result.bridge
    client = result.client

    mockClientAction(client, 'readInputValue', () => ([
      {
        frameId: 0,
        result: {
          success: true,
          value: 'hello world',
          tag: 'input',
          id: 'search',
          name: 'q',
          type: 'text',
        },
      },
    ]))

    const frames = await bridge.readInputValue({ selector: '#search' })

    expect(frames).toEqual([
      {
        frameId: 0,
        result: {
          success: true,
          value: 'hello world',
          tag: 'input',
          id: 'search',
          name: 'q',
          type: 'text',
        },
      },
    ])
  })

  it('getComputedStyles round-trips through the bridge', async () => {
    const result = await createConnectedBridge()
    bridge = result.bridge
    client = result.client

    mockClientAction(client, 'getComputedStyles', () => ([
      {
        frameId: 0,
        result: {
          success: true,
          styles: {
            display: 'block',
            visibility: 'visible',
            opacity: '1',
          },
        },
      },
    ]))

    const frames = await bridge.getComputedStyles({
      selector: '.container',
      properties: ['display', 'visibility', 'opacity'],
    })

    expect(frames).toEqual([
      {
        frameId: 0,
        result: {
          success: true,
          styles: {
            display: 'block',
            visibility: 'visible',
            opacity: '1',
          },
        },
      },
    ])
  })

  it('waitForElement uses action-specific timeout, not default requestTimeoutMs', async () => {
    // Configure bridge with a very short default timeout (500ms)
    const result = await createConnectedBridge({ requestTimeoutMs: 500 })
    bridge = result.bridge
    client = result.client

    // Mock: respond after 800ms — longer than the 500ms default but well
    // within the 3000ms action-specific timeout we'll pass.
    mockClientAction(client, 'waitForElement', () => ([
      {
        frameId: 0,
        result: { success: true, elements: [{ tag: 'div', id: 'lazy' }] },
      },
    ]), { delayMs: 800 })

    // This should NOT reject at 500ms because waitForElement uses a
    // bridge-level timeout override that covers extension-side polling.
    const frames = await bridge.waitForElement({
      selector: '#lazy',
      timeoutMs: 3_000,
    })

    expect(frames).toEqual([
      {
        frameId: 0,
        result: { success: true, elements: [{ tag: 'div', id: 'lazy' }] },
      },
    ])
  })

  it('waitForElement uses the default requestTimeoutMs for extension-side polling when no timeoutMs is provided', async () => {
    const result = await createConnectedBridge({ requestTimeoutMs: 200 })
    bridge = result.bridge
    client = result.client

    mockClientAction(client, 'waitForElement', data => ([
      {
        frameId: 0,
        result: {
          success: false,
          selector: data.selector,
          timeoutMs: data.timeoutMs,
          error: 'timed out waiting for selector "#missing"',
        },
      },
    ]), { delayMs: 300 })

    const frames = await bridge.waitForElement({ selector: '#missing' })

    expect(frames).toEqual([
      {
        frameId: 0,
        result: {
          success: false,
          selector: '#missing',
          timeoutMs: 200,
          error: 'timed out waiting for selector "#missing"',
        },
      },
    ])
  })

  it('rejects pending requests when the bridge disconnects', async () => {
    const result = await createConnectedBridge()
    bridge = result.bridge
    client = result.client

    // Start a request but don't respond to it
    const promise = bridge.getActiveTab()
    expect(bridge.getStatus().pendingRequests).toBe(1)

    // Close the client to simulate disconnection
    client.close()
    client = undefined

    await expect(promise).rejects.toThrow(/disconnected/)
    expect(bridge.getStatus().connected).toBe(false)
    expect(bridge.getStatus().pendingRequests).toBe(0)
  })

  it('rejects bridge calls when the extension responds with ok:false', async () => {
    const result = await createConnectedBridge()
    bridge = result.bridge
    client = result.client

    client.on('message', (raw) => {
      const data = JSON.parse(String(raw)) as Record<string, unknown>
      if (typeof data.id !== 'string')
        return
      if (data.action !== 'getActiveTab')
        return

      client.send(JSON.stringify({
        id: data.id,
        ok: false,
        error: 'unknown action: getActiveTab',
      }))
    })

    await expect(bridge.getActiveTab()).rejects.toThrow('unknown action: getActiveTab')
    expect(bridge.getStatus().pendingRequests).toBe(0)
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
})

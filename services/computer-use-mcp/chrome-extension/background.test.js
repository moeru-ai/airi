import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { setTimeout as delay } from 'node:timers/promises'

import { describe, expect, it } from 'vitest'

import { DEFAULT_BRIDGE_URL, resolveBridgeUrl } from './bridge-config.js'

const backgroundSource = (await readFile(new URL('./background.js', import.meta.url), 'utf8'))
  .replace(/\r\n/g, '\n')
  .replace("import { DEFAULT_BRIDGE_URL, resolveBridgeUrl } from './bridge-config.js'\n", '')

class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  constructor(url) {
    this.url = url
    this.readyState = MockWebSocket.CONNECTING
    this.listeners = new Map()
    this.sent = []
    queueMicrotask(() => {
      if (this.readyState !== MockWebSocket.CONNECTING)
        return

      this.readyState = MockWebSocket.OPEN
      this.dispatch('open')
    })
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  dispatch(type, event = {}) {
    for (const listener of this.listeners.get(type) || [])
      listener(event)
  }

  send(payload) {
    this.sent.push(payload)
  }

  close() {
    if (this.readyState >= MockWebSocket.CLOSING)
      return

    this.readyState = MockWebSocket.CLOSING
    queueMicrotask(() => {
      this.readyState = MockWebSocket.CLOSED
      this.dispatch('close')
    })
  }
}

function createBackground(initialSettings = {}) {
  const settings = { ...initialSettings }
  const sockets = []
  const storageChangeListeners = []
  const chrome = {
    storage: {
      local: {
        get: async keys => Object.fromEntries(keys.map(key => [key, settings[key]])),
      },
      onChanged: {
        addListener: listener => storageChangeListeners.push(listener),
      },
    },
    runtime: {
      onMessage: { addListener: () => {} },
      onStartup: { addListener: () => {} },
      onInstalled: { addListener: () => {} },
    },
  }

  class TrackedWebSocket extends MockWebSocket {
    constructor(url) {
      super(url)
      sockets.push(this)
    }
  }

  runInNewContext(backgroundSource, {
    chrome,
    WebSocket: TrackedWebSocket,
    DEFAULT_BRIDGE_URL,
    resolveBridgeUrl,
    console,
    setTimeout,
    clearTimeout,
  })

  return {
    sockets,
    updateSettings(nextSettings) {
      Object.assign(settings, nextSettings)
      for (const listener of storageChangeListeners) {
        listener({
          browserDomBridgeHost: { newValue: settings.browserDomBridgeHost },
          browserDomBridgePort: { newValue: settings.browserDomBridgePort },
        }, 'local')
      }
    },
    async waitForSocketCount(count) {
      const deadline = Date.now() + 1_000
      while (sockets.length < count && Date.now() < deadline)
        await delay(1)

      expect(sockets).toHaveLength(count)
      const connectedDeadline = Date.now() + 1_000
      while (sockets[count - 1]?.readyState !== MockWebSocket.OPEN && Date.now() < connectedDeadline)
        await delay(1)

      expect(sockets[count - 1]?.readyState).toBe(MockWebSocket.OPEN)
    },
  }
}

describe('Chrome extension background bridge configuration', () => {
  it('uses stored endpoint settings and reconnects immediately when they change', async () => {
    const background = createBackground()
    await background.waitForSocketCount(1)

    expect(background.sockets[0].url).toBe(DEFAULT_BRIDGE_URL)

    background.updateSettings({
      browserDomBridgeHost: 'computer.local',
      browserDomBridgePort: 8876,
    })
    await background.waitForSocketCount(2)

    expect(background.sockets[1].url).toBe('ws://computer.local:8876')
    expect(background.sockets[0].readyState).toBe(MockWebSocket.CLOSED)
  })
})

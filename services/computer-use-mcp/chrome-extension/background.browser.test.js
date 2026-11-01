import { afterEach, expect, inject, it, vi } from 'vitest'

async function readServerState(serverUrl) {
  const response = await fetch(`${serverUrl}/state`)
  if (!response.ok)
    throw new Error(`Test server state request failed: ${response.status}`)

  return response.json()
}

async function waitFor(predicate, description, timeoutMs = 5_000) {
  const deadline = performance.now() + timeoutMs
  while (performance.now() < deadline) {
    if (await predicate())
      return

    await new Promise(resolve => setTimeout(resolve, 20))
  }

  throw new Error(`Timed out waiting for ${description}`)
}

async function waitForServerState(serverUrl, predicate, description) {
  let state
  await waitFor(async () => {
    state = await readServerState(serverUrl)
    return predicate(state)
  }, description)

  return state
}

async function sendCommand(serverUrl, command) {
  const response = await fetch(`${serverUrl}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  })
  if (!response.ok)
    throw new Error(`Test command request failed: ${response.status}`)

  return response.json()
}

// https://github.com/moeru-ai/airi/pull/3300#discussion_r4436557679
// ROOT CAUSE:
//
// A settings read advances the revision before its endpoint is known.
// The old guard drops messages from a retained socket.
//
// if (socket !== bridgeSocket || bridgeSocketRevision !== bridgeConfigRevision)
//   return
//
// Wait for the latest read, then check socket identity.
// Retained sockets process queued messages. Replaced sockets drop them.
it('queues commands across settings refreshes and isolates replaced sockets', async () => {
  const servers = inject('bridgeTestServers')
  const storageListeners = []
  const startupListeners = []
  const installedListeners = []
  const pendingStorageReads = []
  const settings = {
    browserDomBridgeHost: '127.0.0.1',
    browserDomBridgePort: servers.defaultPort,
  }
  let resolveSlowTabQuery
  let resolveSameEndpointTabQuery

  const storageGet = vi.fn((keys) => {
    const snapshot = { ...settings }
    return new Promise((resolve) => {
      pendingStorageReads.push(() => {
        resolve(Object.fromEntries(keys.map(key => [key, snapshot[key]])))
      })
    })
  })
  const tabsQuery = vi.fn(() => {
    if (tabsQuery.mock.calls.length === 1) {
      return new Promise((resolve) => {
        resolveSlowTabQuery = resolve
      })
    }

    if (tabsQuery.mock.calls.length === 3) {
      return new Promise((resolve) => {
        resolveSameEndpointTabQuery = resolve
      })
    }

    return Promise.resolve([{ id: 42, url: 'https://fresh.example', title: 'Fresh' }])
  })

  const chromeApi = {
    storage: {
      local: { get: storageGet },
      onChanged: {
        addListener: listener => storageListeners.push(listener),
      },
    },
    runtime: {
      onMessage: { addListener: vi.fn() },
      onStartup: {
        addListener: listener => startupListeners.push(listener),
      },
      onInstalled: {
        addListener: listener => installedListeners.push(listener),
      },
    },
    tabs: { query: tabsQuery },
  }

  vi.resetModules()
  vi.stubGlobal('chrome', chromeApi)
  await import('./background')

  await waitFor(() => pendingStorageReads.length === 1, 'initial storage read')
  startupListeners[0]()
  installedListeners[0]()
  expect(storageGet).toHaveBeenCalledTimes(1)

  function updateSettings(nextSettings) {
    Object.assign(settings, nextSettings)
    const changes = Object.fromEntries(Object.entries(nextSettings).map(([key, newValue]) => [key, { newValue }]))
    for (const listener of storageListeners)
      listener(changes, 'local')
  }

  updateSettings({
    browserDomBridgeHost: '127.0.0.1',
    browserDomBridgePort: servers.customPort,
  })
  await waitFor(() => pendingStorageReads.length === 2, 'updated storage read')

  pendingStorageReads[0]()
  await new Promise(resolve => setTimeout(resolve, 150))
  const defaultBeforeLatestRead = await readServerState(servers.defaultUrl)
  expect(defaultBeforeLatestRead.connectionCount).toBe(0)

  pendingStorageReads[1]()
  await waitForServerState(
    servers.customUrl,
    state => state.messages.some(message => message.type === 'hello'),
    'custom bridge handshake',
  )

  const staleCommandDelivery = await sendCommand(servers.customUrl, { id: 'stale-read', action: 'getActiveTab' })
  expect(staleCommandDelivery.sent).toBe(1)
  await waitFor(() => tabsQuery.mock.calls.length === 1, 'pending tab query')

  updateSettings({
    browserDomBridgeHost: '127.0.0.1',
    browserDomBridgePort: servers.defaultPort,
  })
  await waitFor(() => pendingStorageReads.length === 3, 'second endpoint storage read')

  const staleQueuedDelivery = await sendCommand(servers.customUrl, { id: 'queued-stale-read', action: 'getActiveTab' })
  expect(staleQueuedDelivery.sent).toBe(1)
  await new Promise(resolve => setTimeout(resolve, 100))
  expect(tabsQuery).toHaveBeenCalledTimes(1)

  pendingStorageReads[2]()

  await waitForServerState(
    servers.defaultUrl,
    state => state.messages.some(message => message.type === 'hello'),
    'default bridge handshake',
  )
  await waitForServerState(
    servers.customUrl,
    state => state.openConnectionCount === 0,
    'old bridge connection to close',
  )
  expect(tabsQuery).toHaveBeenCalledTimes(1)

  resolveSlowTabQuery([{ id: 7, url: 'https://old.example', title: 'Old' }])
  await new Promise(resolve => setTimeout(resolve, 150))

  const defaultAfterStaleReply = await readServerState(servers.defaultUrl)
  expect(defaultAfterStaleReply.messages.some(message => message.id === 'stale-read')).toBe(false)

  const freshCommandDelivery = await sendCommand(servers.defaultUrl, { id: 'fresh-read', action: 'getActiveTab' })
  expect(freshCommandDelivery.sent).toBe(1)
  const defaultAfterFreshReply = await waitForServerState(
    servers.defaultUrl,
    state => state.messages.some(message => message.id === 'fresh-read'),
    'fresh command response',
  )
  expect(defaultAfterFreshReply.messages.find(message => message.id === 'fresh-read')).toMatchObject({
    id: 'fresh-read',
    ok: true,
    result: { id: 42, url: 'https://fresh.example', title: 'Fresh' },
  })

  const connectionCount = defaultAfterFreshReply.connectionCount
  const sameEndpointCommandDelivery = await sendCommand(servers.defaultUrl, { id: 'same-endpoint-read', action: 'getActiveTab' })
  expect(sameEndpointCommandDelivery.sent).toBe(1)
  await waitFor(() => tabsQuery.mock.calls.length === 3, 'pending same-endpoint tab query')

  delete settings.browserDomBridgeHost
  for (const listener of storageListeners) {
    listener({ browserDomBridgeHost: { oldValue: '127.0.0.1' } }, 'local')
  }
  await waitFor(() => pendingStorageReads.length === 4, 'same-endpoint settings refresh')

  const queuedCommandDelivery = await sendCommand(servers.defaultUrl, { id: 'queued-read', action: 'getActiveTab' })
  expect(queuedCommandDelivery.sent).toBe(1)
  await new Promise(resolve => setTimeout(resolve, 100))
  expect(tabsQuery).toHaveBeenCalledTimes(3)

  updateSettings({ browserDomBridgePort: String(servers.defaultPort) })
  await waitFor(() => pendingStorageReads.length === 5, 'overlapping same-endpoint settings refresh')

  pendingStorageReads[3]()
  await new Promise(resolve => setTimeout(resolve, 100))
  expect(tabsQuery).toHaveBeenCalledTimes(3)

  resolveSameEndpointTabQuery([{ id: 42, url: 'https://same-endpoint.example', title: 'Same endpoint' }])
  const stateDuringRefresh = await waitForServerState(
    servers.defaultUrl,
    state => state.messages.some(message => message.id === 'same-endpoint-read'),
    'in-flight command response during settings refresh',
  )
  expect(stateDuringRefresh.messages.find(message => message.id === 'same-endpoint-read')).toMatchObject({
    id: 'same-endpoint-read',
    ok: true,
    result: { id: 42, url: 'https://same-endpoint.example', title: 'Same endpoint' },
  })

  pendingStorageReads[4]()
  await waitFor(() => tabsQuery.mock.calls.length === 4, 'queued tab query after settings refresh')
  const stateAfterQueuedReply = await waitForServerState(
    servers.defaultUrl,
    state => state.messages.some(message => message.id === 'queued-read'),
    'queued command response after settings refresh',
  )
  expect(stateAfterQueuedReply.messages.find(message => message.id === 'queued-read')).toMatchObject({
    id: 'queued-read',
    ok: true,
    result: { id: 42, url: 'https://fresh.example', title: 'Fresh' },
  })

  const stateAfterRefresh = await waitForServerState(
    servers.defaultUrl,
    state => state.openConnectionCount === 1,
    'retained bridge connection',
  )
  expect(stateAfterRefresh.connectionCount).toBe(connectionCount)
}, 15_000)

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

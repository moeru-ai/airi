// @vitest-environment jsdom

import type { NeoAliceBridgeEvent } from '@proj-airi/alice-motion'

import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { useNeoAliceBridgeStore } from './neoalice-bridge'

/** A stand-in MQTT client. `publish` exists only so the test can prove that the bridge never calls it. */
class FakeClient extends EventEmitter {
  readonly subscribe = vi.fn((_topics: string[], _options: unknown, callback?: (error?: Error) => void) => callback?.())
  readonly publish = vi.fn()
  readonly end = vi.fn()
}

const mqttMock = vi.hoisted(() => ({ clients: [] as FakeClient[], options: [] as unknown[] }))
/** Holders of earlier tests. Each test releases its own, because the stores share localStorage keys. */
const releases: Array<() => void> = []

vi.mock('mqtt', () => ({
  connect: (_url: string, options: unknown) => {
    const client = new FakeClient()
    mqttMock.clients.push(client)
    mqttMock.options.push(options)
    return client
  },
}))

async function flush() {
  for (let i = 0; i < 5; i++) {
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 0))
  }
}

async function connectedBridge() {
  const bridge = useNeoAliceBridgeStore()
  bridge.enabled = true
  bridge.brokerUrl = 'ws://192.0.2.10:9001'
  bridge.site = 'mirror'
  // The settings are stored before the stage mounts, as in the app. The debounced watcher must not reconnect later.
  await new Promise(resolve => setTimeout(resolve, 600))
  const release = bridge.hold()
  releases.push(release)
  // The bridge loads MQTT.js with a dynamic import, which takes more than a few ticks.
  await vi.waitFor(() => expect(mqttMock.clients.length).toBeGreaterThan(0))
  await flush()
  const client = mqttMock.clients.at(-1)!
  client.emit('connect')
  return { bridge, release, client }
}

describe('useNeoAliceBridgeStore', () => {
  beforeEach(() => {
    localStorage.clear()
    mqttMock.clients.length = 0
    mqttMock.options.length = 0
    setActivePinia(createPinia())
  })

  afterEach(() => {
    for (const release of releases.splice(0))
      release()
  })

  it('does not connect while disabled or without a holder', async () => {
    const bridge = useNeoAliceBridgeStore()
    const release = bridge.hold()
    bridge.enabled = false
    await flush()
    release()

    // Enabled and configured, but nothing holds the connection.
    bridge.enabled = true
    bridge.site = 'mirror'
    await flush()

    expect(mqttMock.clients).toHaveLength(0)
    expect(bridge.status).toBe('off')
  })

  it('subscribes to the read topics of its site and never publishes', async () => {
    const { bridge, client } = await connectedBridge()

    expect(bridge.status).toBe('connected')
    const topics = client.subscribe.mock.calls[0][0]
    expect(topics).toContain('neoalice/v1/mirror/cmd/tts/say')
    expect(topics.every(topic => topic.startsWith('neoalice/v1/mirror/') || topic.startsWith('neoalice/v1/companion/'))).toBe(true)

    client.emit('message', 'neoalice/v1/mirror/cmd/tts/say', new TextEncoder().encode('{"text":"Oi"}'))
    client.emit('message', 'neoalice/v1/mirror/cmd/avatar/gesture', new TextEncoder().encode('{"gesture":"index"}'))
    expect(client.publish).not.toHaveBeenCalled()
  })

  it('hands translated events to the stage and counts ignored messages', async () => {
    const { bridge, client } = await connectedBridge()
    const events: NeoAliceBridgeEvent[] = []
    bridge.onEvent(event => void events.push(event))

    client.emit('message', 'neoalice/v1/mirror/evt/mood', Buffer.from('{"mood":"playful"}'))
    client.emit('message', 'neoalice/v1/mirror/cmd/avatar/gesture', Buffer.from('{"gesture":"moonwalk"}'))
    client.emit('message', 'neoalice/v1/mirror/cmd/tts/say', Buffer.from('not json'))
    await flush()

    expect(events).toEqual([expect.objectContaining({ type: 'mood', mood: expect.objectContaining({ airiEmotion: 'happy' }) })])
    expect(bridge.receivedCount).toBe(3)
    expect(bridge.ignoredCount).toBe(2)
    expect(bridge.lastIgnored).toBe('neoalice/v1/mirror/cmd/tts/say: payload is not JSON')
  })

  it('reports a reconnection, so the stage can drop the sessions of the old connection', async () => {
    const { bridge, client } = await connectedBridge()
    const reconnected = vi.fn()
    bridge.onReconnect(reconnected)

    client.emit('reconnect')
    expect(bridge.status).toBe('reconnecting')
    client.emit('connect')
    await flush()

    expect(reconnected).toHaveBeenCalledTimes(1)
    expect(bridge.status).toBe('connected')
  })

  it('closes the connection when the last holder releases it, and reconnects after a settings change', async () => {
    const { bridge, release, client } = await connectedBridge()

    const before = mqttMock.clients.length
    bridge.site = 'kitchen'
    // One reconnection after the 500 ms pause, not one per changed value.
    await vi.waitFor(() => expect(mqttMock.clients.length).toBe(before + 1), { timeout: 2000 })
    await new Promise(resolve => setTimeout(resolve, 700))
    expect(mqttMock.clients.length).toBe(before + 1)
    expect(client.end).toHaveBeenCalled()

    release()
    expect(mqttMock.clients.at(-1)!.end).toHaveBeenCalled()
    expect(bridge.status).toBe('off')
  })

  it('shows a connection error', async () => {
    const { bridge, client } = await connectedBridge()

    client.emit('error', new Error('Connection refused: Not authorized'))

    expect(bridge.status).toBe('error')
    expect(bridge.lastError).toBe('Connection refused: Not authorized')
  })
})

import { describe, expect, it, vi } from 'vitest'

// Import after `vi.mock` so the module loads with the stubbed bindings.

import { emitTauriEvent, subscribeTauriEvent, tauriEventNameFromContract, tauriEventPubSub } from './pubsub'

/**
 * Mock harness for `@tauri-apps/api/event`.
 *
 * The Tauri `listen`/`invoke` APIs route through `window.__TAURI_INTERNALS__`
 * which is unavailable under vitest's node environment, so we stub the
 * module. Both the mock call trackers and the per-channel registry must be
 * created inside `vi.hoisted` so they exist before the hoisted `vi.mock`
 * factory runs.
 */
const { listenMock, invokeMock, registeredHandlers } = vi.hoisted(() => {
  const registeredHandlers = new Map<string, (event: any) => void>()
  const listenMock = vi.fn(async (eventName: string, handler: (event: any) => void) => {
    registeredHandlers.set(eventName, handler)
    const unlisten = vi.fn(() => {
      registeredHandlers.delete(eventName)
    })
    return unlisten
  })
  const invokeMock = vi.fn(async () => undefined)
  return { listenMock, invokeMock, registeredHandlers }
})

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: listenMock,
}))

// Helper: fire the captured handler for a channel, mirroring what Tauri's
// native bus would do when a Rust-side `emit` arrives.
function fireChannel(eventName: string, payload: any): void {
  const handler = registeredHandlers.get(eventName)
  if (!handler) throw new Error(`no registered listener for "${eventName}"`)
  handler({ event: eventName, id: 0, payload })
}

describe('subscribeTauriEvent', () => {
  it('registers a callback and the callback fires on emit', async () => {
    listenMock.mockClear()
    const cb = vi.fn()
    const contract = { id: 'eventa:event:electron:window:bounds', type: 'event' }

    const off = await subscribeTauriEvent(contract, cb)

    // listen() was called once with the derived channel name.
    expect(listenMock).toHaveBeenCalledOnce()
    expect(listenMock.mock.calls[0][0]).toBe('electron:window:bounds')

    fireChannel('electron:window:bounds', { x: 1, y: 2, width: 3, height: 4 })

    expect(cb).toHaveBeenCalledOnce()
    expect(cb).toHaveBeenCalledWith({ x: 1, y: 2, width: 3, height: 4 })

    off()
  })

  it('returns an unsubscribe function that stops subsequent deliveries', async () => {
    listenMock.mockClear()
    const cb = vi.fn()
    const contract = { id: 'eventa:event:electron:screen:cursor-screen-point-v1', type: 'event' }
    const uniqueChannel = 'electron:screen:cursor-screen-point-v1'

    const off = await subscribeTauriEvent(contract, cb)

    fireChannel(uniqueChannel, { x: 10, y: 20 })
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith({ x: 10, y: 20 })

    off()

    // The captured native handler still exists (we never unlisten), but the
    // per-channel set no longer contains `cb` — so firing again must be a
    // no-op for the user callback.
    fireChannel(uniqueChannel, { x: 11, y: 22 })
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('multiple subscribers on the same channel all receive the payload', async () => {
    listenMock.mockClear()
    const cbA = vi.fn()
    const cbB = vi.fn()
    const contract = { id: 'eventa:event:electron:auto-updater:state-changed', type: 'event' }

    const offA = await subscribeTauriEvent(contract, cbA)
    const offB = await subscribeTauriEvent(contract, cbB)

    // Only one native listen() should have run for this channel despite two
    // subscribers (the per-channel bucket dedupes).
    const callsForChannel = listenMock.mock.calls.filter(
      ([name]: any) => name === 'electron:auto-updater:state-changed',
    )
    expect(callsForChannel.length).toBe(1)

    fireChannel('electron:auto-updater:state-changed', { status: 'downloading', progress: { percent: 50 } })

    expect(cbA).toHaveBeenCalledOnce()
    expect(cbB).toHaveBeenCalledOnce()
    expect(cbA).toHaveBeenCalledWith({ status: 'downloading', progress: { percent: 50 } })
    expect(cbB).toHaveBeenCalledWith({ status: 'downloading', progress: { percent: 50 } })

    offA()
    offB()
  })
})

describe('emitTauriEvent', () => {
  it('calls the Rust emit_event command with the right channel', async () => {
    invokeMock.mockClear()
    await emitTauriEvent('electron:window:bounds', { x: 7, y: 8, width: 9, height: 10 })

    expect(invokeMock).toHaveBeenCalledOnce()
    expect(invokeMock).toHaveBeenCalledWith('emit_event', {
      target: 'all',
      eventName: 'electron:window:bounds',
      payload: { x: 7, y: 8, width: 9, height: 10 },
    })
  })

  it('normalizes an undefined payload to null for Rust serde_json::Value', async () => {
    invokeMock.mockClear()
    await emitTauriEvent('electron:window:bounds')
    expect(invokeMock).toHaveBeenCalledOnce()
    expect(invokeMock).toHaveBeenCalledWith('emit_event', {
      target: 'all',
      eventName: 'electron:window:bounds',
      payload: null,
    })
  })

  it('derives a Tauri channel from an eventa contract', () => {
    expect(tauriEventNameFromContract({ id: 'eventa:event:electron:window:bounds', type: 'event' })).toBe(
      'electron:window:bounds',
    )
  })
})

describe('tauriEventPubSub', () => {
  it('subscribe returns a closer that removes the callback from the bucket', async () => {
    listenMock.mockClear()
    const sub = await tauriEventPubSub('electron:window:bounds')
    const cb = vi.fn()

    const off = sub.subscribe(cb)
    fireChannel('electron:window:bounds', { x: 1 })
    expect(cb).toHaveBeenCalledOnce()

    off()

    fireChannel('electron:window:bounds', { x: 2 })
    expect(cb).toHaveBeenCalledOnce()
  })

  it('unsubscribe removes the callback from the bucket', async () => {
    listenMock.mockClear()
    const sub = await tauriEventPubSub('electron:window:bounds')
    const cb = vi.fn()

    sub.subscribe(cb)
    fireChannel('electron:window:bounds', { x: 1 })
    expect(cb).toHaveBeenCalledOnce()

    sub.unsubscribe(cb)

    fireChannel('electron:window:bounds', { x: 2 })
    expect(cb).toHaveBeenCalledOnce()
  })
})

import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { describe, expect, it, vi } from 'vitest'

type IpcRendererLike = Parameters<typeof createContext>[0]
type Listener = (event: unknown, value: unknown) => void

describe('electron eventa context', () => {
  // ROOT CAUSE:
  //
  // The preload bridge creates a new proxy for each callback argument.
  // removeListener cannot find the callback that on registered.
  // The disposer returned by on retains the registered callback.
  it('removes listeners through the preload bridge disposer', () => {
    const listeners = new Map<string, Set<Listener>>()
    const ipcRenderer = {
      send: vi.fn(),
      on(channel: string, listener: Listener) {
        const registered = (...args: Parameters<Listener>) => listener(...args)
        const channelListeners = listeners.get(channel) ?? new Set<Listener>()
        channelListeners.add(registered)
        listeners.set(channel, channelListeners)
        return () => channelListeners.delete(registered)
      },
      removeListener(channel: string, listener: Listener) {
        listeners.get(channel)?.delete(listener)
      },
    }

    const { dispose } = createContext(ipcRenderer as unknown as IpcRendererLike, {
      extraListeners: { 'extra-message': vi.fn() },
    })

    expect(listeners.get('eventa-message')?.size).toBe(1)
    expect(listeners.get('eventa-error')?.size).toBe(1)
    expect(listeners.get('extra-message')?.size).toBe(1)

    dispose()

    expect(listeners.get('eventa-message')?.size).toBe(0)
    expect(listeners.get('eventa-error')?.size).toBe(0)
    expect(listeners.get('extra-message')?.size).toBe(0)
  })

  it('removes listeners from a native Electron emitter', () => {
    const listeners = new Map<string, Set<Listener>>()
    const ipcRenderer = {
      send: vi.fn(),
      on(channel: string, listener: Listener) {
        const channelListeners = listeners.get(channel) ?? new Set<Listener>()
        channelListeners.add(listener)
        listeners.set(channel, channelListeners)
        return this
      },
      removeListener(channel: string, listener: Listener) {
        listeners.get(channel)?.delete(listener)
        return this
      },
    }

    const { dispose } = createContext(ipcRenderer as unknown as IpcRendererLike)
    expect(listeners.get('eventa-message')?.size).toBe(1)
    expect(listeners.get('eventa-error')?.size).toBe(1)

    dispose()

    expect(listeners.get('eventa-message')?.size).toBe(0)
    expect(listeners.get('eventa-error')?.size).toBe(0)
  })
})

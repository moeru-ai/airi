import { EventEmitter } from 'node:events'

import { defineInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { defaultDesktopCompanionState } from '../../../shared/desktop-companion'
import { desktopCompanionGet, desktopCompanionSetPreferences, desktopNotificationPublish } from '../../../shared/eventa/desktop-companion'
import { createDesktopCompanionService } from './desktop-companion'
import { DesktopNotificationCenter } from './desktop-notifications'

const boundary = vi.hoisted(() => ({
  listeners: new Map<string, Set<(...args: unknown[]) => void>>(),
  resolve: vi.fn(),
}))
vi.mock('injeca', () => ({ injeca: { resolve: boundary.resolve } }))
vi.mock('electron', () => ({
  ipcMain: {
    on: (name: string, listener: (...args: unknown[]) => void) => {
      if (!boundary.listeners.has(name))
        boundary.listeners.set(name, new Set())
      boundary.listeners.get(name)!.add(listener)
    },
    off: (name: string, listener: (...args: unknown[]) => void) => boundary.listeners.get(name)?.delete(listener),
  },
  app: {},
  Notification: {},
}))

function windowPair(id: number) {
  const received = new EventEmitter()
  const lifecycle = new EventEmitter()
  const webContents = {
    id,
    isDestroyed: () => false,
    send: (name: string, ...args: unknown[]) => received.emit(name, {}, ...args),
  }
  const window = { webContents, isDestroyed: () => false, once: lifecycle.once.bind(lifecycle), off: lifecycle.off.bind(lifecycle) }
  const renderer = createContext({
    on: received.on.bind(received),
    removeListener: received.removeListener.bind(received),
    send: (name: string, ...args: unknown[]) => {
      for (const listener of boundary.listeners.get(name) ?? [])
        listener({ sender: webContents }, ...args)
    },
  } as never)
  return { window, context: renderer.context, close: () => {
    lifecycle.emit('closed')
    renderer.dispose()
  } }
}

beforeEach(() => {
  boundary.listeners.clear()
  vi.clearAllMocks()
})

describe('desktop companion IPC ownership', () => {
  it('shares one durable center while each request runs only in its originating window', async () => {
    const storage = { load: () => defaultDesktopCompanionState(), save: vi.fn() }
    const center = new DesktopNotificationCenter(storage, { supported: () => false, show: vi.fn() })
    boundary.resolve.mockResolvedValue({ center })
    const first = windowPair(1)
    const second = windowPair(2)
    await createDesktopCompanionService({ window: first.window as never })
    await createDesktopCompanionService({ window: second.window as never })

    await defineInvoke(first.context, desktopNotificationPublish)({ id: 'one', source: 'test', body: 'private', priority: 'normal' })
    expect(storage.save).toHaveBeenCalledTimes(1)
    expect((await defineInvoke(second.context, desktopCompanionGet)()).unreadCount).toBe(1)
    await defineInvoke(second.context, desktopCompanionSetPreferences)({ pulsingBorder: false })
    expect((await defineInvoke(first.context, desktopCompanionGet)()).preferences.pulsingBorder).toBe(false)
    first.close()
    second.close()
    expect(boundary.listeners.get('eventa-message')?.size).toBe(0)
    center.dispose()
  })

  it('does not let an unregistered renderer publish through another window', async () => {
    const storage = { load: () => defaultDesktopCompanionState(), save: vi.fn() }
    const center = new DesktopNotificationCenter(storage, { supported: () => false, show: vi.fn() })
    boundary.resolve.mockResolvedValue({ center })
    const trusted = windowPair(1)
    const foreign = windowPair(9)
    await createDesktopCompanionService({ window: trusted.window as never })
    const request = defineInvoke(foreign.context, desktopNotificationPublish)({ id: 'foreign', source: 'test', body: 'ignored', priority: 'normal' })
    const rejected = expect(request).rejects.toThrow()
    foreign.close()
    await rejected
    expect(storage.save).not.toHaveBeenCalled()
    expect(center.snapshot().unreadCount).toBe(0)
    trusted.close()
    center.dispose()
  })
})

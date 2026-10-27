import type { ElectronMainContextExtensions, ElectronMainEmitOptions } from '@moeru/eventa/adapters/electron/main'
import type { BackdropRegion } from '@proj-airi/electron-native-backdrop/types'

import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'

import { createContext, defineInvoke } from '@moeru/eventa'
import { createContext as createElectronContext } from '@moeru/eventa/adapters/electron/main'
import { NativeBackdrop } from '@proj-airi/electron-native-backdrop'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { electronWindowBackdropUpdate } from '../../../shared/eventa/window-backdrop'
import { WindowBackdropService } from './window-backdrop'

const host = vi.hoisted(() => ({ macOS: true }))
vi.mock('std-env', () => ({
  get isMacOS() {
    return host.macOS
  },
}))
vi.mock('electron', () => ({ ipcMain: {} }))
vi.mock('@moeru/eventa/adapters/electron/main', () => ({ createContext: vi.fn() }))
vi.mock('@proj-airi/electron-native-backdrop', () => ({
  NativeBackdrop: vi.fn(class {
    setRegions = vi.fn()
    dispose = vi.fn()
  }),
}))

class TestWindow extends EventEmitter {
  readonly handle = Buffer.alloc(8)
  readonly webContents = Object.assign(new EventEmitter(), { getZoomFactor: () => 1.5 })
  isDestroyed() { return false }
  getNativeWindowHandle() { return this.handle }
}

const surface: BackdropRegion = {
  id: 'composer',
  x: 10,
  y: 20,
  width: 200,
  height: 80,
  radius: 16,
  opacity: 0.75,
  clips: [{ x: 0, y: 30, width: 300, height: 100, radius: 12 }],
}

function setup() {
  const context = createContext<ElectronMainContextExtensions, ElectronMainEmitOptions>()
  const window = new TestWindow()
  vi.mocked(createElectronContext).mockReturnValue({ context, dispose: vi.fn() })
  WindowBackdropService.install(window as never)
  return { window, update: defineInvoke(context, electronWindowBackdropUpdate) }
}

describe('window native backdrop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    host.macOS = true
  })

  it('keeps window ownership in main and converts regions and clips at page zoom', async () => {
    const { window, update } = setup()
    expect(await update({ regions: [surface] })).toEqual({ state: 'active' })
    expect(createElectronContext).toHaveBeenCalledWith({}, window, { onlySameWindow: true })
    expect(NativeBackdrop).toHaveBeenCalledWith(window.handle)
    const material = vi.mocked(NativeBackdrop).mock.results[0].value
    expect(material.setRegions).toHaveBeenCalledWith([{
      id: 'composer',
      x: 15,
      y: 30,
      width: 300,
      height: 120,
      radius: 24,
      opacity: 0.75,
      clips: [{ x: 0, y: 45, width: 450, height: 150, radius: 18 }],
    }])
    await update({ regions: [] })
    expect(material.setRegions).toHaveBeenLastCalledWith([])
    window.emit('closed')
    expect(material.dispose).toHaveBeenCalledTimes(1)
  })

  it('removes old native layers on reload and renderer loss, and recreates them for the next page', async () => {
    const { window, update } = setup()
    await update({ regions: [surface] })
    const first = vi.mocked(NativeBackdrop).mock.results[0].value
    window.webContents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })
    expect(first.dispose).toHaveBeenCalledTimes(1)
    await update({ regions: [surface] })
    expect(NativeBackdrop).toHaveBeenCalledTimes(2)
    const second = vi.mocked(NativeBackdrop).mock.results[1].value
    window.webContents.emit('render-process-gone')
    expect(second.dispose).toHaveBeenCalledTimes(1)
    window.emit('closed')
    expect(second.dispose).toHaveBeenCalledTimes(1)
  })

  // A macOS Space change emits `did-start-loading` for every window without a navigation.
  it('keeps native layers through loading events, same-document navigation, and subframe navigation', async () => {
    const { window, update } = setup()
    await update({ regions: [surface] })
    const material = vi.mocked(NativeBackdrop).mock.results[0].value
    window.webContents.emit('did-start-loading')
    window.webContents.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true })
    window.webContents.emit('did-start-navigation', { isMainFrame: false, isSameDocument: false })
    expect(material.dispose).not.toHaveBeenCalled()
    await update({ regions: [surface] })
    expect(NativeBackdrop).toHaveBeenCalledTimes(1)
    window.emit('closed')
  })

  it('reports native failure once and prevents animation updates from retrying it', async () => {
    const { window, update } = setup()
    await update({ regions: [surface] })
    const material = vi.mocked(NativeBackdrop).mock.results[0].value
    material.setRegions.mockImplementationOnce(() => {
      throw new Error('Private filter is unavailable')
    })
    expect(await update({ regions: [surface] })).toEqual({ state: 'failed', reason: 'Private filter is unavailable' })
    expect(material.dispose).toHaveBeenCalledTimes(1)
    await update({ regions: [surface] })
    expect(NativeBackdrop).toHaveBeenCalledTimes(1)
    expect(material.setRegions).toHaveBeenCalledTimes(2)
    window.emit('closed')
  })

  it('rejects malformed geometry and duplicate IDs before creating native layers', async () => {
    const { window, update } = setup()
    await expect(update({ regions: [{ ...surface, x: Number.NaN }] })).rejects.toThrow()
    await expect(update({ regions: [surface, surface] })).rejects.toThrow('Backdrop region IDs must be unique')
    expect(NativeBackdrop).not.toHaveBeenCalled()
    window.emit('closed')
  })

  it('clears existing material when a later update has invalid geometry', async () => {
    const { window, update } = setup()
    await update({ regions: [surface] })
    const material = vi.mocked(NativeBackdrop).mock.results[0].value
    await expect(update({ regions: [{ ...surface, x: Number.NaN }] })).rejects.toThrow()
    expect(material.dispose).toHaveBeenCalledTimes(1)
    window.emit('closed')
  })

  it('retains CSS surfaces on unsupported platforms without loading the native module', async () => {
    host.macOS = false
    const { window, update } = setup()
    expect(await update({ regions: [surface] })).toEqual({ state: 'unsupported', reason: 'unsupported-platform' })
    expect(NativeBackdrop).not.toHaveBeenCalled()
    window.emit('closed')
  })
})

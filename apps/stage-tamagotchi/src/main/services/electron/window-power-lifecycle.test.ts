import type { ElectronWindowLifecycleState } from '../../../shared/eventa'

import { EventEmitter } from 'node:events'

import { createContext } from '@moeru/eventa'
import { powerMonitor } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { shouldPauseStageFromLifecycle } from '../../../renderer/stores/stage-window-lifecycle'
import { electronWindowLifecycleChanged } from '../../../shared/eventa'
import { createPowerMonitorService } from './powerMonitor'
import { createWindowService } from './window'

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return { powerMonitor: new EventEmitter() }
})

vi.mock('@proj-airi/electron-vueuse/main', async importOriginal => ({
  ...await importOriginal<typeof import('@proj-airi/electron-vueuse/main')>(),
  createRendererLoop: () => ({ start: vi.fn(), stop: vi.fn() }),
}))

vi.mock('../../libs/bootkit/lifecycle', () => ({
  onAppBeforeQuit: () => () => {},
  onAppWindowAllClosed: () => () => {},
}))

vi.mock('../../windows/shared/window', () => ({
  resizeWindowByDelta: vi.fn(),
  setWindowAlwaysOnTop: vi.fn(),
}))

class FakeWindow extends EventEmitter {
  readonly webContents = Object.assign(new EventEmitter(), { id: 7 })
  destroyed = false
  isDestroyed = () => this.destroyed
  isFocused = vi.fn(() => true)
  isMinimized = vi.fn(() => false)
  isVisible = vi.fn(() => true)
  getWindowButtonPosition = () => ({ x: 16, y: 15 })
}

function setupService() {
  const context = createContext()
  const window = new FakeWindow()
  const snapshots: ElectronWindowLifecycleState[] = []
  context.on(electronWindowLifecycleChanged, event => snapshots.push(event.body!))
  createWindowService({ context: context as never, window: window as never })
  createPowerMonitorService({ context: context as never, window: window as never })
  return { window, snapshots }
}

describe('window power lifecycle', () => {
  afterEach(() => {
    powerMonitor.removeAllListeners()
  })

  it('keeps the stage paused until both screen lock and suspension clear', () => {
    const { window, snapshots } = setupService()

    powerMonitor.emit('lock-screen')
    powerMonitor.emit('suspend')
    powerMonitor.emit('resume')
    powerMonitor.emit('unlock-screen')

    expect(snapshots.map(state => state.reason)).toEqual(['lock-screen', 'suspended', 'resumed', 'unlock-screen'])
    expect(snapshots.map(shouldPauseStageFromLifecycle)).toEqual([true, true, true, false])

    snapshots.length = 0
    powerMonitor.emit('suspend')
    powerMonitor.emit('lock-screen')
    powerMonitor.emit('unlock-screen')
    powerMonitor.emit('resume')

    expect(snapshots.map(state => state.reason)).toEqual(['suspended', 'lock-screen', 'unlock-screen', 'resumed'])
    expect(snapshots.map(shouldPauseStageFromLifecycle)).toEqual([true, true, true, false])
    window.emit('closed')
  })

  it('stops power events from querying a closed owner', () => {
    const { window, snapshots } = setupService()
    powerMonitor.emit('suspend')
    expect(snapshots).toHaveLength(1)

    window.destroyed = true
    window.emit('closed')
    window.isFocused.mockClear()
    window.isMinimized.mockClear()
    window.isVisible.mockClear()
    powerMonitor.emit('suspend')
    powerMonitor.emit('lock-screen')

    expect(snapshots).toHaveLength(1)
    expect(window.isFocused).not.toHaveBeenCalled()
    expect(window.isMinimized).not.toHaveBeenCalled()
    expect(window.isVisible).not.toHaveBeenCalled()
  })
})

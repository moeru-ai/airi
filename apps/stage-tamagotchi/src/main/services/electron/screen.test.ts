import type { Point } from 'electron'

import { EventEmitter } from 'node:events'

import { createContext, defineInvoke } from '@moeru/eventa'
import { cursorScreenPoint, startLoopGetCursorScreenPoint } from '@proj-airi/electron-eventa'
import { screen } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createScreenService } from './screen'

vi.mock('electron', () => ({
  screen: { getCursorScreenPoint: vi.fn() },
}))

/** The window events and checks that the renderer loop reads. The window stays visible and alive. */
class FakeWindow extends EventEmitter {
  readonly webContents = Object.assign(new EventEmitter(), { isDestroyed: () => false, isCrashed: () => false })
  isDestroyed() { return false }
  isVisible() { return true }
}

function setupScreen() {
  const context = createContext()
  const window = new FakeWindow()
  createScreenService({ context: context as never, window: window as never })
  const sent: Point[] = []
  context.on(cursorScreenPoint, event => sent.push(event.body!))
  return { sent, window, startLoop: defineInvoke(context, startLoopGetCursorScreenPoint) }
}

describe('screen service', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('sends the cursor position only when it changes', async () => {
    const { sent, window, startLoop } = setupScreen()
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({ x: 10, y: 20 })

    await startLoop()
    // The loop reads the cursor about 60 times each second.
    await vi.advanceTimersByTimeAsync(500)
    expect(sent).toEqual([{ x: 10, y: 20 }])

    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({ x: 11, y: 20 })
    await vi.advanceTimersByTimeAsync(500)
    expect(sent).toEqual([{ x: 10, y: 20 }, { x: 11, y: 20 }])
    window.emit('closed')
  })

  it('sends the same position again when a reloaded renderer starts the loop', async () => {
    const { sent, window, startLoop } = setupScreen()
    vi.mocked(screen.getCursorScreenPoint).mockReturnValue({ x: 10, y: 20 })
    await startLoop()
    await vi.advanceTimersByTimeAsync(100)

    await startLoop()
    await vi.advanceTimersByTimeAsync(100)

    expect(sent).toEqual([{ x: 10, y: 20 }, { x: 10, y: 20 }])
    window.emit('closed')
  })
})

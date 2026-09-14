import { BrowserWindow } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { deferSettingsWindowClose } from './close'

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    BrowserWindow: class extends EventEmitter {
      close() {}
      isDestroyed() { return false }
    },
  }
})

function createWindow() {
  const window = new BrowserWindow()
  const close = vi.spyOn(window, 'close')
  const isDestroyed = vi.spyOn(window, 'isDestroyed')
  const flush = vi.fn<() => Promise<void>>()
  deferSettingsWindowClose(window, flush)

  function requestClose() {
    const event = { preventDefault: vi.fn() }
    window.emit('close', event)
    return event
  }

  return { window: { close, isDestroyed }, flush, requestClose }
}

afterEach(() => vi.restoreAllMocks())

describe('settings window close', () => {
  // https://github.com/moeru-ai/airi/pull/2467#discussion_r4005368125
  // ROOT CAUSE:
  //
  // Closing the renderer discarded its one-second debounce. Main now holds the
  // close request until the renderer acknowledges all pending settings writes.
  it('waits for saving and combines repeated close requests', async () => {
    const { window, flush, requestClose } = createWindow()
    const saved = Promise.withResolvers<void>()
    flush.mockReturnValue(saved.promise)
    expect(requestClose().preventDefault).toHaveBeenCalledOnce()
    expect(requestClose().preventDefault).toHaveBeenCalledOnce()
    expect(flush).toHaveBeenCalledOnce()
    expect(window.close).not.toHaveBeenCalled()

    window.close.mockImplementation(() => {
      expect(requestClose().preventDefault).not.toHaveBeenCalled()
    })
    saved.resolve()
    await expect.poll(() => window.close.mock.calls.length).toBe(1)
  })

  it('keeps the window open after failure and permits a retry', async () => {
    const { window, flush, requestClose } = createWindow()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    flush.mockRejectedValueOnce(new Error('Leader unavailable')).mockResolvedValueOnce()
    requestClose()
    await expect.poll(() => error.mock.calls.length).toBe(1)
    expect(window.close).not.toHaveBeenCalled()

    requestClose()
    await expect.poll(() => window.close.mock.calls.length).toBe(1)
    expect(flush).toHaveBeenCalledTimes(2)
  })

  it('does not resume closing after the window is destroyed', async () => {
    const { window, flush, requestClose } = createWindow()
    const saved = Promise.withResolvers<void>()
    flush.mockReturnValue(saved.promise)
    requestClose()
    window.isDestroyed.mockReturnValue(true)
    saved.resolve()
    await expect.poll(() => window.isDestroyed.mock.calls.length).toBe(1)
    expect(window.close).not.toHaveBeenCalled()
  })
})

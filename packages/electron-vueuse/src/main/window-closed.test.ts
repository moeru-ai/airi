import type { BrowserWindow } from 'electron'

import { EventEmitter } from 'node:events'

import { describe, expect, it } from 'vitest'

import { onWindowClosed } from './window-closed'

/** A real `BrowserWindow` needs the Electron binary. `onWindowClosed` uses only the `closed` listeners of the window. */
function createWindow() {
  const emitter = new EventEmitter()
  const window: BrowserWindow = emitter as never
  return { emitter, window }
}

describe('onWindowClosed', () => {
  it('runs the callbacks of a window in order through one closed listener', () => {
    const { emitter, window } = createWindow()
    const calls: string[] = []
    onWindowClosed(window, () => calls.push('first'))
    const removeSecond = onWindowClosed(window, () => calls.push('second'))
    onWindowClosed(window, () => calls.push('third'))
    expect(emitter.listenerCount('closed')).toBe(1)

    removeSecond()
    emitter.emit('closed')
    expect(calls).toEqual(['first', 'third'])
    expect(emitter.listenerCount('closed')).toBe(0)
  })

  it('removes the closed listener with the last callback', () => {
    const { emitter, window } = createWindow()
    const removeFirst = onWindowClosed(window, () => {})
    const removeSecond = onWindowClosed(window, () => {})
    removeFirst()
    expect(emitter.listenerCount('closed')).toBe(1)
    removeSecond()
    expect(emitter.listenerCount('closed')).toBe(0)
  })
})

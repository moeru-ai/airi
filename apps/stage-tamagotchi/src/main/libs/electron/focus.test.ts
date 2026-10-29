import { afterEach, describe, expect, it, vi } from 'vitest'

import { focusWindow, isWindowFocusIgnored, showWindow } from './focus'

function createWindow() {
  return { focus: vi.fn(), show: vi.fn(), showInactive: vi.fn() }
}

describe('isWindowFocusIgnored', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('allows focus when APP_IGNORE_FOCUS is not set', () => {
    vi.stubEnv('APP_IGNORE_FOCUS', undefined)
    expect(isWindowFocusIgnored()).toBe(false)
  })

  it('ignores focus when APP_IGNORE_FOCUS is 1', () => {
    vi.stubEnv('APP_IGNORE_FOCUS', '1')
    expect(isWindowFocusIgnored()).toBe(true)
  })

  it('allows focus when APP_IGNORE_FOCUS is 0', () => {
    vi.stubEnv('APP_IGNORE_FOCUS', '0')
    expect(isWindowFocusIgnored()).toBe(false)
  })
})

describe('showWindow', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('shows the window with focus by default', () => {
    vi.stubEnv('APP_IGNORE_FOCUS', undefined)
    const window = createWindow()

    showWindow(window)

    expect(window.show).toHaveBeenCalledOnce()
    expect(window.showInactive).not.toHaveBeenCalled()
  })

  it('shows the window without focus when APP_IGNORE_FOCUS is set', () => {
    vi.stubEnv('APP_IGNORE_FOCUS', '1')
    const window = createWindow()

    showWindow(window)

    expect(window.showInactive).toHaveBeenCalledOnce()
    expect(window.show).not.toHaveBeenCalled()
  })
})

describe('focusWindow', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('shows and focuses the window by default', () => {
    vi.stubEnv('APP_IGNORE_FOCUS', undefined)
    const window = createWindow()

    expect(focusWindow(window)).toBe(true)
    expect(window.show).toHaveBeenCalledOnce()
    expect(window.focus).toHaveBeenCalledOnce()
  })

  it('only shows the window without focus when APP_IGNORE_FOCUS is set', () => {
    vi.stubEnv('APP_IGNORE_FOCUS', '1')
    const window = createWindow()

    expect(focusWindow(window)).toBe(false)
    expect(window.showInactive).toHaveBeenCalledOnce()
    expect(window.show).not.toHaveBeenCalled()
    expect(window.focus).not.toHaveBeenCalled()
  })
})

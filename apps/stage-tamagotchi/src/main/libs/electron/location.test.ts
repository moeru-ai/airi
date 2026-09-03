import { EventEmitter } from 'node:events'

import { describe, expect, it, vi } from 'vitest'

import { load, withHashRoute } from './location'

vi.mock(import('@electron-toolkit/utils'), () => {
  return {
    is: {
      dev: true,
    },
  }
})

describe('load', () => {
  // https://github.com/moeru-ai/airi/pull/2278#discussion_r3776743822
  // ROOT CAUSE:
  //
  // The load helper removed every did-start-navigation listener after the initial load.
  // This also removed the window service listener that restores mouse input before reloads.
  //
  // We fixed this by preserving listeners that the load helper does not own.
  it('preserves navigation lifecycle listeners after the initial load', async () => {
    const webContents = new EventEmitter()
    const navigationHandler = vi.fn()
    webContents.on('did-start-navigation', navigationHandler)
    const window = {
      loadURL: vi.fn().mockResolvedValue(undefined),
      webContents,
    }

    await load(window as never, 'https://example.com')
    webContents.emit('did-start-navigation')

    expect(navigationHandler).toHaveBeenCalledOnce()
  })
})

describe('withHashRoute', () => {
  it('should use string url construct URL with hash route correctly', () => {
    const result = withHashRoute('http://localhost:5173', '/test/inner-test')
    expect(result).toEqual({ url: 'http://localhost:5173/#/test/inner-test' })
  })

  it('should use object url construct URL with hash route correctly', () => {
    const result = withHashRoute({ url: 'http://localhost:5173' }, '/test/inner-test')
    expect(result).toEqual({ url: 'http://localhost:5173/#/test/inner-test' })
  })

  it('should use file url construct URL with hash route correctly', () => {
    const result = withHashRoute({ url: 'file:////home/workspace/project/index.html' }, '/test/inner-test')
    expect(result).toEqual({ url: `file:////home/workspace/project/index.html#/test/inner-test` })
  })

  it('adds query options before the hash route for development URLs', () => {
    expect(withHashRoute({ url: 'http://localhost:5173' }, '/about', {
      query: { 'synced-leader': 'false' },
    })).toEqual({
      url: 'http://localhost:5173/?synced-leader=false#/about',
    })
  })

  it('passes query options to Electron for packaged renderer URLs', () => {
    expect(withHashRoute({ file: '/opt/airi/renderer/index.html' }, '/settings', {
      query: { 'synced-leader': 'false' },
    })).toEqual({
      file: '/opt/airi/renderer/index.html',
      options: {
        hash: '/settings',
        query: { 'synced-leader': 'false' },
      },
    })
  })
})

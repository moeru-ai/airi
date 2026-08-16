import { describe, expect, it, vi } from 'vitest'

import { withHashRoute, withRendererWindow } from './location'

vi.mock(import('@electron-toolkit/utils'), () => {
  return {
    is: {
      dev: true,
    },
  }
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
})

describe('withRendererWindow', () => {
  it('adds the window query before the hash route for development URLs', () => {
    expect(withRendererWindow({ url: 'http://localhost:5173' }, 'chat', '/chat')).toEqual({
      url: 'http://localhost:5173/?window=chat#/chat',
    })
  })

  it('uses Electron load-file options for packaged renderer URLs', () => {
    expect(withRendererWindow({ file: '/opt/airi/renderer/index.html' }, 'settings', '/settings')).toEqual({
      file: '/opt/airi/renderer/index.html',
      options: {
        hash: '/settings',
        query: { window: 'settings' },
      },
    })
  })
})

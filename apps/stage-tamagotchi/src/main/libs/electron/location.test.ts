import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { baseUrl, getPreloadPath, getRendererRoot, setElectronMainDirname, withHashRoute } from './location'

const electronToolkit = vi.hoisted(() => ({ is: { dev: true } }))

vi.mock(import('@electron-toolkit/utils'), () => electronToolkit)

afterEach(() => {
  electronToolkit.is.dev = true
  vi.unstubAllEnvs()
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

describe('getRendererRoot', () => {
  const mainDirname = resolve('/opt/airi/out/main')

  it('resolves the packaged renderer directory next to the main bundle', () => {
    setElectronMainDirname(mainDirname)

    expect(getRendererRoot()).toBe(resolve('/opt/airi/out/renderer'))
  })

  it('loads the packaged index.html from the renderer root', () => {
    electronToolkit.is.dev = false
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173')
    setElectronMainDirname(mainDirname)

    expect(baseUrl(getRendererRoot())).toEqual({ file: join(resolve('/opt/airi/out/renderer'), 'index.html') })
    expect(baseUrl(getRendererRoot(), 'beat-sync.html')).toEqual({ file: join(resolve('/opt/airi/out/renderer'), 'beat-sync.html') })
  })

  it('uses the development server URL instead of the renderer root in development', () => {
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173/')
    setElectronMainDirname(mainDirname)

    expect(baseUrl(getRendererRoot())).toEqual({ url: 'http://localhost:5173/' })
    expect(baseUrl(getRendererRoot(), 'beat-sync.html')).toEqual({ url: 'http://localhost:5173/beat-sync.html' })
  })
})

describe('getPreloadPath', () => {
  it('resolves the default preload entry next to the main bundle', () => {
    setElectronMainDirname(resolve('/opt/airi/out/main'))

    expect(getPreloadPath()).toBe(join(resolve('/opt/airi/out/preload'), 'index.mjs'))
  })

  it('resolves a named preload entry next to the main bundle', () => {
    setElectronMainDirname(resolve('/opt/airi/out/main'))

    expect(getPreloadPath('beat-sync.mjs')).toBe(join(resolve('/opt/airi/out/preload'), 'beat-sync.mjs'))
  })
})

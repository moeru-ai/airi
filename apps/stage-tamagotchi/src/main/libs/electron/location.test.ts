import { resolve } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { baseUrl, getPreloadPath, getRendererRoot, setElectronMainDirname, withHashRoute } from './location'

// The launcher of @ergosphere-it/electron knows the running bundle: the files of a built bundle, or the
// development server under `electron-vite dev`.
const bundle = vi.hoisted(() => ({ pageOrigin: 'http://127.0.0.1:40000/', preloadDir: '/opt/airi/bundles/2/preload' }))

vi.mock('@ergosphere-it/electron/main', () => ({
  activeBundle: {
    pageUrl: (options?: { page?: string }) => new URL(options?.page ?? '', bundle.pageOrigin).href,
    preloadOf: (name: string) => `${bundle.preloadDir}/${name}.js`,
  },
}))

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

  it('loads the pages of the running bundle', () => {
    setElectronMainDirname(mainDirname)

    expect(baseUrl(getRendererRoot())).toEqual({ url: 'http://127.0.0.1:40000/' })
    expect(baseUrl(getRendererRoot(), 'beat-sync.html')).toEqual({ url: 'http://127.0.0.1:40000/beat-sync.html' })
  })
})

describe('getPreloadPath', () => {
  it('resolves the default preload entry of the running bundle', () => {
    expect(getPreloadPath()).toBe('/opt/airi/bundles/2/preload/index.js')
  })

  it('resolves a named preload entry of the running bundle', () => {
    expect(getPreloadPath('beat-sync')).toBe('/opt/airi/bundles/2/preload/beat-sync.js')
  })
})

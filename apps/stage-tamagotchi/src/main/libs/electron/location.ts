import type { BrowserWindow, LoadFileOptions, LoadURLOptions } from 'electron'

import { join } from 'node:path'
import { env } from 'node:process'

import { is } from '@electron-toolkit/utils'

let electronMainDirname: string = ''

export function setElectronMainDirname(dirname: string) {
  electronMainDirname = dirname
}

export function getElectronMainDirname() {
  return electronMainDirname
}

export function baseUrl(parentOfIndexHtml: string, filename?: string) {
  if (is.dev && env.ELECTRON_RENDERER_URL) {
    if (!filename) {
      return { url: env.ELECTRON_RENDERER_URL }
    }

    const url = new URL(env.ELECTRON_RENDERER_URL)
    const paths = url.pathname.split('/')
    paths.pop()
    paths.push(filename)
    url.pathname = paths.join('/')
    return { url: url.toString() }
  }
  else {
    return { file: join(parentOfIndexHtml, filename ?? 'index.html') }
  }
}

export async function load(window: BrowserWindow, url: string | { url: string, options?: LoadURLOptions } | { file: string, options?: LoadFileOptions }) {
  try {
    if (typeof url === 'object' && 'url' in url) {
      return await window.loadURL(url.url, url.options)
    }
    if (typeof url === 'object' && 'file' in url) {
      return await window.loadFile(url.file, url.options)
    }

    return await window.loadURL(url)
  }
  catch (error) {
    if (!(error instanceof Error)) {
      throw error
    }

    // Electron navigation error shape
    // https://github.com/electron/electron/blob/8d05285a1f39c759985b17c89a449e4a6b3960df/lib/browser/api/web-contents.ts#L354-L359
    if (!('code' in error) || !('errno' in error)) {
      throw error
    }
    if (error.code === 'ERR_ABORTED' && error.errno === -3) {
      if (typeof url === 'object' && 'url' in url) {
        const parsedURL = new URL(url.url)
        if (parsedURL.hash) {
          // When targeting /#/ hash route, Electron may throw
          //
          // ```
          // Error: ERR_ABORTED (-3) loading 'http://localhost:5173/#/notice/fade-on-hover?id=fade-on-hover'
          // ```
          //
          // and this will cause the `load(...)` promise to reject, while `#${hash content}` is in fact the correct URL expected by
          // electron, but from `new URL(...)` standard API, the output URL with hash will include at least one `/` before `#${hash content}`,
          // which causes the mismatch and thus the error.
          //
          // This is more likely a URL scheme standard mismatch between Electron and Node.js, and currently we can only catch and
          // ignore this error, since the URL with hash is actually loaded correctly in Electron, and the error is just a false alarm.
          //
          // Navigation started: {url: 'http://localhost:5173/#/notice/fade-on-hover?id=fade-on-hover', isSameDocument: false, isMainFrame: true, isInPlace: false}
          // Navigation started: {url: 'http://localhost:5173/#/notice/fade-on-hover?id=fade-on-hover', isSameDocument: false, isMainFrame: true, isInPlace: false}
          // Navigation started: {url: 'http://localhost:5173/#/notice/fade-on-hover?id=fade-on-hover', isSameDocument: false, isMainFrame: true, isInPlace: false}
          //
          // https://github.com/electron/electron/issues/17526
          // https://github.com/electron/electron/blob/8d05285a1f39c759985b17c89a449e4a6b3960df/lib/browser/api/web-contents.ts#L370-L387
          console.warn('Electron navigation error with hash route, ignoring:', error, 'url:', url.url)

          return
        }
      }
    }

    throw error
  }
  finally {
    window.webContents.removeAllListeners('did-start-navigation')
  }
}

/**
 * A helper function to construct URL with hash route, which is commonly used in our app since we are using hash-based routing in renderer.
 */
export function withHashRoute(baseUrl: string | { url: string } | { file: string }, hashRoute: string) {
  if (typeof baseUrl === 'object' && 'url' in baseUrl) {
    // trim `/` suffix
    const baseURLinURL = new URL(baseUrl.url)

    const pathname = baseURLinURL.pathname
    const trimmedPathname = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
    baseURLinURL.pathname = trimmedPathname

    baseURLinURL.hash = hashRoute

    return { url: baseURLinURL.toString() } satisfies { url: string, options?: LoadURLOptions }
  }
  if (typeof baseUrl === 'object' && 'file' in baseUrl) {
    return { file: `${baseUrl.file}`, options: { hash: hashRoute } } satisfies { file: string, options?: LoadFileOptions }
  }

  // trim `/` suffix
  const baseURLinURL = new URL(baseUrl)

  const pathname = baseURLinURL.pathname
  const trimmedPathname = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname
  baseURLinURL.pathname = trimmedPathname

  baseURLinURL.hash = hashRoute

  return { url: baseURLinURL.toString() } satisfies { url: string, options?: LoadURLOptions }
}

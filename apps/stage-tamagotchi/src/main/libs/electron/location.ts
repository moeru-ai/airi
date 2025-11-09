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

export function baseUrl(parentOfIndexHtml: string) {
  if (is.dev && env.ELECTRON_RENDERER_URL) {
    return { url: env.ELECTRON_RENDERER_URL }
  }
  else {
    return { file: join(parentOfIndexHtml, 'index.html') }
  }
}

export async function load(window: BrowserWindow, url: string | { url: string, options?: LoadURLOptions } | { file: string, options?: LoadFileOptions }) {
  if (typeof url === 'object' && 'url' in url) {
    return await window.loadURL(url.url, url.options)
  }
  if (typeof url === 'object' && 'file' in url) {
    return await window.loadFile(url.file, url.options)
  }

  return await window.loadURL(url)
}

export function withHashRoute(baseUrl: string | { url: string } | { file: string }, hashRoute: string) {
  if (typeof baseUrl === 'object' && 'url' in baseUrl) {
    return { url: `${baseUrl.url}/#${hashRoute}` } satisfies { url: string, options?: LoadURLOptions }
  }
  if (typeof baseUrl === 'object' && 'file' in baseUrl) {
    return { file: `${baseUrl.file}`, options: { hash: hashRoute } } satisfies { file: string, options?: LoadFileOptions }
  }

  return `${baseUrl}/#${hashRoute}`
}

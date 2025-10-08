import type { BrowserWindow } from 'electron'

import { join } from 'node:path'
import { env } from 'node:process'

import { is } from '@electron-toolkit/utils'

export function baseUrl(parentOfIndexHtml: string) {
  if (is.dev && env.ELECTRON_RENDERER_URL) {
    return { url: env.ELECTRON_RENDERER_URL }
  }
  else {
    return { file: join(parentOfIndexHtml, 'index.html') }
  }
}

export async function load(window: BrowserWindow, url: string | { url: string } | { file: string }) {
  if (typeof url === 'object' && 'url' in url) {
    return await window.loadURL(url.url)
  }
  if (typeof url === 'object' && 'file' in url) {
    return await window.loadFile(url.file)
  }

  return await window.loadURL(url)
}

export function withHashRoute(baseUrl: string | { url: string } | { file: string }, hashRoute: string) {
  if (typeof baseUrl === 'object' && 'url' in baseUrl) {
    return { url: `${baseUrl.url}/#${hashRoute}` }
  }
  if (typeof baseUrl === 'object' && 'file' in baseUrl) {
    return { file: `${baseUrl.file}#${hashRoute}` }
  }

  return `${baseUrl}/#${hashRoute}`
}

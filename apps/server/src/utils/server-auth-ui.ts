import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const SERVER_AUTH_UI_BASE_PATH = '/auth'

const SERVER_AUTH_UI_DIST_DIR = fileURLToPath(new URL('../../public/ui-server-auth', import.meta.url))
const SERVER_AUTH_UI_INDEX_HTML_PATH = fileURLToPath(new URL('../../public/ui-server-auth/index.html', import.meta.url))
const RE_HTML_LT = /</g
const RE_HTML_GT = />/g
const RE_HTML_AMP = /&/g
const RE_UNICODE_LINE_SEPARATOR = /\u2028/g
const RE_UNICODE_PARAGRAPH_SEPARATOR = /\u2029/g

let cachedIndexHtml: string | null = null

export interface ServerAuthUiContext {
  apiServerUrl: string
  currentUrl: string
  oidcCallback?: {
    code: string
    error: string
    errorDescription: string
    state: string
  }
}

export function getServerAuthUiDistDir(): string {
  return SERVER_AUTH_UI_DIST_DIR
}

export function renderServerAuthUiHtml(context: ServerAuthUiContext): string {
  const indexHtml = getServerAuthUiIndexHtml()

  if (!indexHtml.includes('__AIRI_SERVER_AUTH_CONTEXT__'))
    throw new Error('ui-server-auth index.html is missing __AIRI_SERVER_AUTH_CONTEXT__ placeholder')

  return indexHtml.replace('__AIRI_SERVER_AUTH_CONTEXT__', serializeInlineJson(context))
}

function getServerAuthUiIndexHtml(): string {
  if (cachedIndexHtml !== null)
    return cachedIndexHtml

  cachedIndexHtml = readFileSync(SERVER_AUTH_UI_INDEX_HTML_PATH, 'utf8')
  return cachedIndexHtml
}

function serializeInlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(RE_HTML_LT, '\\u003c')
    .replace(RE_HTML_GT, '\\u003e')
    .replace(RE_HTML_AMP, '\\u0026')
    .replace(RE_UNICODE_LINE_SEPARATOR, '\\u2028')
    .replace(RE_UNICODE_PARAGRAPH_SEPARATOR, '\\u2029')
}

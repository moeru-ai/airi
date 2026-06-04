import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const SERVER_ADMIN_UI_BASE_PATH = '/admin'

const SERVER_ADMIN_UI_DIST_DIR = fileURLToPath(new URL('../../public/ui-admin', import.meta.url))
const SERVER_ADMIN_UI_INDEX_HTML_PATH = fileURLToPath(new URL('../../public/ui-admin/index.html', import.meta.url))
const RE_HTML_LT = /</g
const RE_HTML_GT = />/g
const RE_HTML_AMP = /&/g
const RE_UNICODE_LINE_SEPARATOR = /\u2028/g
const RE_UNICODE_PARAGRAPH_SEPARATOR = /\u2029/g

let cachedIndexHtml: string | null = null

export interface ServerAdminUiContext {
  apiServerUrl: string
  currentUrl: string
}

export function getServerAdminUiDistDir(): string {
  return SERVER_ADMIN_UI_DIST_DIR
}

export function renderServerAdminUiHtml(context: ServerAdminUiContext): string {
  const indexHtml = getServerAdminUiIndexHtml()

  if (!indexHtml.includes('__AIRI_SERVER_ADMIN_CONTEXT__'))
    throw new Error('ui-admin index.html is missing __AIRI_SERVER_ADMIN_CONTEXT__ placeholder')

  return indexHtml.replace('__AIRI_SERVER_ADMIN_CONTEXT__', serializeInlineJson(context))
}

function getServerAdminUiIndexHtml(): string {
  if (cachedIndexHtml !== null)
    return cachedIndexHtml

  cachedIndexHtml = readFileSync(SERVER_ADMIN_UI_INDEX_HTML_PATH, 'utf8')
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

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

/**
 * Context for the OIDC social sign-in POST bridge page.
 */
export interface OidcSocialPostBridgeContext {
  /** Public API origin used by the browser for Better Auth requests. */
  apiServerUrl: string
  /** Better Auth social provider to start. */
  provider: 'github' | 'google'
  /** OIDC authorize URL to resume after Better Auth completes social sign-in. */
  callbackURL: string
}

/**
 * Renders a same-origin page that starts Better Auth social sign-in.
 *
 * Use when:
 * - OIDC loginPage should skip the server picker for a known social provider.
 * - A full-page redirect would turn `/api/auth/sign-in/social` into GET.
 *
 * Expects:
 * - `provider` has already been validated as a supported social provider.
 *
 * Returns:
 * - HTML that POSTs JSON to Better Auth, then navigates to the returned OAuth URL.
 */
export function renderOidcSocialPostBridgeHtml(ctx: OidcSocialPostBridgeContext): string {
  const config = {
    postUrl: `${ctx.apiServerUrl}/api/auth/sign-in/social`,
    body: { provider: ctx.provider, callbackURL: ctx.callbackURL },
  }
  const dataJson = serializeInlineJson(config)

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head><meta charset="utf-8" /><title>Sign in</title><meta name="viewport" content="width=device-width, initial-scale=1" /></head>',
    '<body style="background:#0b0b0b;color:#ccc;font:14px/1.5 system-ui;text-align:center;padding:2em">',
    'Starting sign-in...',
    `<script type="application/json" id="airi-oidc-post-bridge">${dataJson}</script>`,
    '<script>',
    '(function(){',
    'var e=document.getElementById(\'airi-oidc-post-bridge\');',
    'if(!e||!e.textContent){document.body.textContent=\'Configuration missing\';return;}',
    'var cfg=JSON.parse(e.textContent);',
    'fetch(cfg.postUrl,{method:\'POST\',headers:{\'Content-Type\':\'application/json\'},body:JSON.stringify(cfg.body),credentials:\'include\'})',
    '.then(function(r){return r.json().then(function(j){return{ok:r.ok,status:r.status,j:j};});})',
    '.then(function(x){if(x.ok&&x.j&&x.j.url)window.location.replace(x.j.url);',
    'else document.body.textContent=\'Sign-in failed: \'+x.status+((x.j&&x.j.message)?(\' \'+x.j.message):\'\');})',
    '.catch(function(){document.body.textContent=\'Sign-in request failed\';});',
    '})();',
    '</script></body></html>',
  ].join('')
}

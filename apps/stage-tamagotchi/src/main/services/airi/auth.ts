import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'

import { appendFileSync } from 'node:fs'
import { join } from 'node:path'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
} from '@proj-airi/stage-shared/auth'
import { app, shell } from 'electron'

import {
  electronAuthCallback,
  electronAuthCallbackError,
  electronAuthLogout,
  electronAuthStartLogin,
} from '../../../shared/eventa'
import { getWebApiTicket, initSteam } from '../steam/client'
import { startLoopbackServer } from './http-server/http/auth'
import { exchangeSteamTicketForTokens } from './steam-sign-in'

const log = useLogg('auth-service').useGlobalConfig()

// #region agent log
/** Temporary ETE markers for C3/C8/C10. Session af8d97. */
function authEteLog(message: string, data?: Record<string, unknown>): void {
  const line = `[${new Date().toISOString()}] ${message}${data ? ` ${JSON.stringify(data)}` : ''}\n`
  try {
    appendFileSync(join(app.getPath('userData'), 'steam-debug.log'), line, 'utf8')
  }
  catch {
    // ignore
  }
  fetch('http://127.0.0.1:7272/ingest/025a1957-803e-4aec-a183-f77d1570779e', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'af8d97' },
    body: JSON.stringify({ sessionId: 'af8d97', location: 'airi/auth.ts', message, data, timestamp: Date.now() }),
  }).catch(() => {})
}
// #endregion

type MainContext = ReturnType<typeof createContext>['context']

// OIDC configuration for the Electron client.
const OIDC_CLIENT_ID = import.meta.env.VITE_OIDC_CLIENT_ID || 'airi-stage-electron'
const OIDC_SCOPES = 'openid profile email offline_access'
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'https://api.airi.build'
const OIDC_AUTHORIZE_PATH = '/api/auth/oauth2/authorize'
const OIDC_TOKEN_PATH = '/api/auth/oauth2/token'

// Active loopback server cleanup handle
let closeLoopback: (() => void) | null = null
let signingInFlight = false

export interface TokenExchangeResult {
  accessToken: string
  refreshToken?: string
  idToken?: string
  expiresIn: number
}

export interface WindowAuthManager {
  registerWindow: (params: { context: MainContext, window: BrowserWindow }) => void
  broadcastAuthCallback: (tokens: TokenExchangeResult) => void
  broadcastAuthError: (error: string) => void
}

export async function trySteamSignIn(windowAuthManager: WindowAuthManager): Promise<void> {
  const initResult = await initSteam()
  if (!initResult.ok) {
    // #region agent log
    authEteLog('steam:startup:skip', { caseId: 'C8', reason: initResult.reason })
    // #endregion
    log.withFields({ reason: initResult.reason }).debug('Steam sign-in skipped')
    return
  }

  // #region agent log
  authEteLog('steam:startup:attempt', { caseId: 'C8' })
  // #endregion
  // Silent startup attempt: linked → broadcastAuthCallback (auto-login, no
  // click needed); unlinked → no-op, wait for the user to click Sign in, which
  // re-runs startSteamSignIn with openBrowserOnNeedsEnrollment=true.
  await startSteamSignIn(windowAuthManager, { openBrowserOnNeedsEnrollment: false })
}

export function createWindowAuthManagerService(): WindowAuthManager {
  const authContexts = new Set<MainContext>()

  function broadcastAuthCallback(tokens: TokenExchangeResult): void {
    for (const context of authContexts)
      context.emit(electronAuthCallback, tokens)
  }

  function broadcastAuthError(error: string): void {
    for (const context of authContexts)
      context.emit(electronAuthCallbackError, { error })
  }

  return {
    registerWindow(params) {
      authContexts.add(params.context)

      params.window.on('closed', () => {
        authContexts.delete(params.context)
      })
    },

    broadcastAuthCallback,
    broadcastAuthError,
  }
}

/**
 * Runs the shared OIDC loopback + PKCE flow and opens the system browser.
 *
 * `buildBrowserUrl` transforms the OIDC authorize URL into the URL actually
 * opened (manual login: identity; enrollment: the enroll page with the
 * authorize URL encoded as `continue`). `promptLogin` sets `prompt=login` for
 * manual login to bypass stale cookies; enrollment omits it since the user just
 * authenticated in the same browser session. The loopback wait runs in the
 * background; this resolves once the browser is opened.
 */
async function startOidcLoopbackFlow(
  windowAuthManager: WindowAuthManager,
  options: { promptLogin: boolean, buildBrowserUrl: (authorizeUrl: string) => string },
): Promise<void> {
  if (signingInFlight) {
    log.warn('Replacing in-flight OIDC login attempt with a new request')
    closeLoopback?.()
    closeLoopback = null
    signingInFlight = false
  }

  signingInFlight = true

  try {
    // Clean up any previous in-flight login
    closeLoopback?.()

    const codeVerifier = generateCodeVerifier()
    const codeChallenge = await generateCodeChallenge(codeVerifier)
    const state = generateState()

    // Start loopback server to receive the callback (state validated inside).
    const loopback = await startLoopbackServer(state)
    closeLoopback = loopback.close

    // Use the server-side relay as redirect_uri. The relay page serves HTML
    // that forwards the authorization code to the loopback via JS fetch().
    // The loopback port is encoded in the state parameter as "{port}:{state}".
    const redirectUri = `${SERVER_URL}/api/auth/oidc/electron-callback`
    const stateWithPort = `${loopback.port}:${state}`

    // Build authorization URL
    const url = new URL(OIDC_AUTHORIZE_PATH, SERVER_URL)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('client_id', OIDC_CLIENT_ID)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('scope', OIDC_SCOPES)
    url.searchParams.set('state', stateWithPort)
    url.searchParams.set('code_challenge', codeChallenge)
    url.searchParams.set('code_challenge_method', 'S256')
    if (options.promptLogin) {
      // NOTICE: prompt=login forces the authorization server to show the login
      // page even if the system browser has an existing session cookie. Without
      // this, the OIDC flow auto-completes silently using the stale cookie.
      url.searchParams.set('prompt', 'login')
    }
    url.searchParams.set('resource', SERVER_URL)

    // Open system browser
    const browserUrl = options.buildBrowserUrl(url.toString())
    // #region agent log
    let openedUrlPath = ''
    try {
      openedUrlPath = new URL(browserUrl).pathname
    }
    catch {
      openedUrlPath = 'invalid'
    }
    authEteLog('oidc:openExternal', {
      caseId: openedUrlPath.includes('/enroll') ? 'C3' : 'C10',
      openedUrlPath,
      hasEnrollToken: browserUrl.includes('token='),
      promptLogin: options.promptLogin,
    })
    // #endregion
    await shell.openExternal(browserUrl)

    // Wait for the callback in the background
    loopback.result
      .then(async ({ code }) => {
        const tokens = await exchangeCode(code, codeVerifier, redirectUri)
        windowAuthManager.broadcastAuthCallback(tokens)
        // #region agent log
        authEteLog('oidc:tokenExchange:ok', { caseId: 'C7' })
        // #endregion
        log.log('OIDC token exchange successful')
      })
      .catch((err) => {
        log.withError(err).error('OIDC signing in failed')
        windowAuthManager.broadcastAuthError(errorMessageFrom(err) ?? 'OIDC signing in failed')
      })
      .finally(() => {
        closeLoopback = null
        signingInFlight = false
      })
  }
  catch (err) {
    closeLoopback = null
    signingInFlight = false
    log.withError(err).error('Failed to start OIDC signing in flow')
    windowAuthManager.broadcastAuthError(errorMessageFrom(err) ?? 'OIDC signing in failed')
  }
}

/**
 * Opens the system browser to the Steam enrollment page, reusing the OIDC
 * loopback flow so the completed enrollment lands back in Electron through the
 * same code → token → renderer-callback path as manual login. The enroll page
 * receives the single-use enrollment `token` plus the OIDC authorize URL as
 * `continue`; once the user authenticates, the page navigates to `continue`,
 * where the server consumes the token and links Steam.
 */
async function startEnrollmentFlow(
  windowAuthManager: WindowAuthManager,
  params: { enrollToken: string, authUiUrl: string },
): Promise<void> {
  const authUiBase = params.authUiUrl.replace(/\/+$/, '')
  await startOidcLoopbackFlow(windowAuthManager, {
    promptLogin: false,
    buildBrowserUrl: (authorizeUrl) => {
      const enrollUrl = new URL(`${authUiBase}/enroll`)
      enrollUrl.searchParams.set('token', params.enrollToken)
      enrollUrl.searchParams.set('continue', authorizeUrl)
      return enrollUrl.toString()
    },
  })
}

/**
 * Steam-anchored sign-in: exchange a Steam Web API ticket and either silently
 * log in (linked SteamID) or open the enrollment browser (unlinked). The server
 * is the P1 choke point — it only issues OIDC tokens for a linked SteamID and
 * returns needs_enrollment otherwise, so this path can never produce an unlinked
 * AIRI account. `openBrowserOnNeedsEnrollment` distinguishes the startup silent
 * attempt (false: unlinked → no-op, wait for click) from the user-click path
 * (true: unlinked → open enroll browser). On ticket/exchange failure broadcasts
 * an error and does NOT fall back to plain OIDC (that would reopen the
 * unlinked-account bypass the Steam anchor exists to close).
 */
async function startSteamSignIn(
  windowAuthManager: WindowAuthManager,
  options: { openBrowserOnNeedsEnrollment: boolean },
): Promise<void> {
  const ticketResult = await getWebApiTicket()
  if (!ticketResult.ok) {
    // #region agent log
    authEteLog('steam:ticket:fail', {
      caseId: 'C3',
      openBrowserOnNeedsEnrollment: options.openBrowserOnNeedsEnrollment,
      reason: ticketResult.reason,
    })
    // #endregion
    windowAuthManager.broadcastAuthError(ticketResult.reason)
    return
  }

  // #region agent log
  let serverHost = ''
  try {
    serverHost = new URL(SERVER_URL).host
  }
  catch {
    serverHost = 'invalid'
  }
  authEteLog('steam:ticket:ok', {
    caseId: 'C3',
    openBrowserOnNeedsEnrollment: options.openBrowserOnNeedsEnrollment,
    serverHost,
  })
  // #endregion

  const exchangeResult = await exchangeSteamTicketForTokens({
    serverUrl: SERVER_URL,
    ticketHex: ticketResult.ticketHex,
  })

  if (!exchangeResult.ok) {
    if (exchangeResult.kind === 'needs_enrollment') {
      // #region agent log
      authEteLog('steam:exchange:needs_enrollment', {
        caseId: 'C3',
        openBrowserOnNeedsEnrollment: options.openBrowserOnNeedsEnrollment,
        willOpenBrowser: options.openBrowserOnNeedsEnrollment,
      })
      // #endregion
      if (options.openBrowserOnNeedsEnrollment) {
        await startEnrollmentFlow(windowAuthManager, {
          enrollToken: exchangeResult.enrollToken,
          authUiUrl: exchangeResult.authUiUrl,
        })
      }
      // Startup path discards the token; the user's click re-fetches a fresh
      // one so the short TTL covers only the browser → verify → relay window.
      return
    }
    // #region agent log
    authEteLog('steam:exchange:error', {
      caseId: 'C3',
      kind: exchangeResult.kind,
      reason: exchangeResult.reason.slice(0, 200),
    })
    // #endregion
    windowAuthManager.broadcastAuthError(exchangeResult.reason)
    return
  }

  // #region agent log
  authEteLog('steam:exchange:ok', { caseId: 'C8' })
  // #endregion
  windowAuthManager.broadcastAuthCallback(exchangeResult.tokens)
  log.log('Steam sign-in successful')
}

/**
 * Create the auth service IPC handlers for a given window context.
 */
export function createAuthService(params: {
  context: MainContext
  window: BrowserWindow
  windowAuthManager: WindowAuthManager
}): void {
  params.windowAuthManager.registerWindow({
    context: params.context,
    window: params.window,
  })

  defineInvokeHandler(params.context, electronAuthStartLogin, async (_, options) => {
    if (params.window.webContents.id !== options?.raw.ipcMainEvent.sender.id) {
      return
    }

    // NOTICE:
    // Do not skip when a prior OIDC/enroll loopback is still waiting. Onboarding
    // closes as soon as the browser opens; if the user then closes that tab and
    // clicks Sign in on the island, a hard skip left signingInFlight=true for up
    // to the 5m loopback timeout and no new tab opened. Replace the in-flight
    // attempt (same policy as startOidcLoopbackFlow) so a fresh click always
    // can open the browser again.
    if (signingInFlight) {
      // #region agent log
      authEteLog('login:replace-in-flight', {
        caseId: 'C11',
        hadCloseLoopback: closeLoopback !== null,
      })
      // #endregion
      log.warn('Replacing in-flight sign-in with a new request')
      closeLoopback?.()
      closeLoopback = null
      signingInFlight = false
    }

    // P1 choke point: when Steam is available, route every sign-in entry point
    // through the Steam-anchored path so no IPC call can create an unlinked
    // AIRI account. Plain OIDC only runs when Steam is not available.
    const initResult = await initSteam()
    // #region agent log
    authEteLog('login:click', {
      caseId: initResult.ok ? 'C3' : 'C10',
      initOk: initResult.ok,
      reason: initResult.ok ? undefined : initResult.reason,
      route: initResult.ok ? 'steam' : 'plain-oidc',
    })
    // #endregion
    if (initResult.ok) {
      await startSteamSignIn(params.windowAuthManager, { openBrowserOnNeedsEnrollment: true })
      return
    }

    await startOidcLoopbackFlow(params.windowAuthManager, {
      promptLogin: true,
      buildBrowserUrl: url => url,
    })
  })

  defineInvokeHandler(params.context, electronAuthLogout, async (_, options) => {
    if (params.window.webContents.id !== options?.raw.ipcMainEvent.sender.id) {
      return
    }

    closeLoopback?.()
    closeLoopback = null
    signingInFlight = false
  })
}

// --- Internal helpers ---

async function exchangeCode(code: string, codeVerifier: string, redirectUri: string): Promise<TokenExchangeResult> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: OIDC_CLIENT_ID,
    code_verifier: codeVerifier,
    resource: SERVER_URL,
  })

  const response = await fetch(new URL(OIDC_TOKEN_PATH, SERVER_URL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Token exchange failed (${response.status}): ${text}`)
  }

  const data = await response.json() as Record<string, unknown>
  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string | undefined,
    idToken: data.id_token as string | undefined,
    expiresIn: data.expires_in as number,
  }
}

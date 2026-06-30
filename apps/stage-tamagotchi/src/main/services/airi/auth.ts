import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import {
  generateCodeChallenge,
  generateCodeVerifier,
  generateState,
} from '@proj-airi/stage-shared/auth'
import { shell } from 'electron'

import {
  electronAuthCallback,
  electronAuthCallbackError,
  electronAuthEnrollmentStarted,
  electronAuthLogout,
  electronAuthStartLogin,
} from '../../../shared/eventa'
import { getWebApiTicket, initSteam } from '../steam/client'
import { buildEnrollUrl } from './enroll-url'
import { startLoopbackServer } from './http-server/http/auth'
import { exchangeSteamTicketForTokens } from './steam-sign-in'

const log = useLogg('auth-service').useGlobalConfig()

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
  broadcastAuthError: (message: string) => void
  broadcastEnrollmentStarted: () => void
}

function isOidcSignInActive(): boolean {
  return signingInFlight || closeLoopback !== null
}

export async function trySteamSignIn(windowAuthManager: WindowAuthManager): Promise<void> {
  if (isOidcSignInActive()) {
    log.debug('Skipping Steam sign-in: OIDC flow in progress')
    return
  }

  const initResult = await initSteam()
  if (!initResult.ok) {
    log.withFields({ reason: initResult.reason }).debug('Steam sign-in skipped')
    return
  }

  const ticketResult = await getWebApiTicket()
  if (!ticketResult.ok) {
    log.withFields({ reason: ticketResult.reason }).warn('Steam sign-in failed')
    windowAuthManager.broadcastAuthError(ticketResult.reason)
    return
  }

  const exchangeResult = await exchangeSteamTicketForTokens({
    serverUrl: SERVER_URL,
    ticketHex: ticketResult.ticketHex,
  })
  if (!exchangeResult.ok) {
    if (exchangeResult.kind === 'needs_enrollment') {
      log.log('Steam account unlinked — starting enrollment in system browser')
      windowAuthManager.broadcastEnrollmentStarted()
      await startEnrollmentFlow(windowAuthManager, {
        enrollToken: exchangeResult.enrollToken,
        authUiUrl: exchangeResult.authUiUrl,
      })
      return
    }
    log.withFields({ reason: exchangeResult.reason }).warn('Steam sign-in failed')
    windowAuthManager.broadcastAuthError(exchangeResult.reason)
    return
  }

  windowAuthManager.broadcastAuthCallback(exchangeResult.tokens)
  log.log('Steam sign-in successful')
}

export function createWindowAuthManagerService(): WindowAuthManager {
  const authContexts = new Set<MainContext>()

  function forEachAuthContext(emit: (context: MainContext) => void): void {
    for (const context of authContexts)
      emit(context)
  }

  function broadcastAuthCallback(tokens: TokenExchangeResult): void {
    forEachAuthContext(context => context.emit(electronAuthCallback, tokens))
  }

  function broadcastAuthError(message: string): void {
    forEachAuthContext(context => context.emit(electronAuthCallbackError, { error: message }))
  }

  function broadcastEnrollmentStarted(): void {
    forEachAuthContext(context => context.emit(electronAuthEnrollmentStarted, undefined))
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
    broadcastEnrollmentStarted,
  }
}

/**
 * Runs the shared OIDC loopback + PKCE flow and opens the system browser.
 *
 * Use when:
 * - The manual OIDC login handler opens the authorize page directly.
 * - The Steam enrollment flow opens the enroll page (with the authorize URL
 *   encoded as `continue`) instead.
 *
 * `buildBrowserUrl` transforms the OIDC authorize URL into the URL actually
 * opened in the browser; `promptLogin` controls whether `prompt=login` is set
 * (manual login: yes, to bypass stale cookies; enrollment: no, the user just
 * authenticated in the same browser session).
 *
 * The loopback wait runs in the background; the helper resolves once the
 * browser is opened. The shared `signingInFlight` / `closeLoopback` mutex
 * covers both manual and enrollment flows.
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
    await shell.openExternal(options.buildBrowserUrl(url.toString()))

    // Wait for the callback in the background
    loopback.result
      .then(async ({ code }) => {
        const tokens = await exchangeCode(code, codeVerifier, redirectUri)
        windowAuthManager.broadcastAuthCallback(tokens)
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
 * same code → token → renderer-callback path as manual login.
 *
 * The enroll page receives the single-use enrollment `token` plus the OIDC
 * authorize URL as `continue`; once the user authenticates, the page navigates
 * to `continue`, where the server consumes the token and links Steam.
 */
async function startEnrollmentFlow(
  windowAuthManager: WindowAuthManager,
  params: { enrollToken: string, authUiUrl: string },
): Promise<void> {
  await startOidcLoopbackFlow(windowAuthManager, {
    promptLogin: false,
    buildBrowserUrl: authorizeUrl =>
      buildEnrollUrl({
        authUiUrl: params.authUiUrl,
        enrollToken: params.enrollToken,
        continueUrl: authorizeUrl,
      }),
  })
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

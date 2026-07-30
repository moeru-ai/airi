import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'

import type { TokenExchangeResult } from './oidc-token-exchange'

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
  electronAuthLogout,
  electronAuthStartLogin,
} from '../../../shared/eventa'
import { cancelWebApiTicket, getWebApiTicket, initSteam } from '../steam/client'
import { startLoopbackServer } from './http-server/http/auth'
import { electronOidcRedirectUri, exchangeAuthorizationCode } from './oidc-token-exchange'
import { exchangeSteamTicketForTokens } from './steam-sign-in'

const log = useLogg('auth-service').useGlobalConfig()

type MainContext = ReturnType<typeof createContext>['context']

// OIDC configuration for the Electron client.
const OIDC_CLIENT_ID = import.meta.env.VITE_OIDC_CLIENT_ID || 'airi-stage-electron'
const OIDC_SCOPES = 'openid profile email offline_access'
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'https://api.airi.build'
const OIDC_AUTHORIZE_PATH = '/api/auth/oauth2/authorize'

// Active loopback server cleanup handle
let closeLoopback: (() => void) | null = null
let signingInFlight = false
/** Serializes Steam ticket exchange across concurrent Steam gestures. */
let steamSignInInFlight = false
/** Resolves when the current in-flight Steam sign-in finishes (success or fail). */
let steamSignInInFlightDone: Promise<void> = Promise.resolve()

export type { TokenExchangeResult }

export interface WindowAuthManager {
  registerWindow: (params: { context: MainContext, window: BrowserWindow }) => void
  broadcastAuthCallback: (tokens: TokenExchangeResult) => void
  broadcastAuthError: (error: string) => void
}

export function createWindowAuthManagerService(): WindowAuthManager {
  const authContexts = new Set<MainContext>()

  function broadcastAuthCallback(tokens: TokenExchangeResult): void {
    for (const context of authContexts) {
      context.emit(electronAuthCallback, tokens)
    }
  }

  function broadcastAuthError(error: string): void {
    for (const context of authContexts) {
      context.emit(electronAuthCallbackError, { error })
    }
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
 * Steam ticket sign-in for an explicit Steam choice (not used by the default
 * Login button — that opens browser OIDC and reuses ui-server-auth's existing
 * provider list, including Steam OpenID). Also used by {@link trySteamSignIn}
 * for silent startup on Steam depot builds.
 *
 * Returns `true` when tokens were broadcast. Returns `false` when Steam is
 * unavailable or the ticket exchange failed.
 *
 * Ticket exchange is single-flight: a concurrent Steam gesture waits for the
 * in-flight exchange instead of starting a second ticket fetch.
 */
export async function startSteamTicketSignIn(
  windowAuthManager: WindowAuthManager,
  options?: { notifyErrors?: boolean },
): Promise<boolean> {
  const notifyErrors = options?.notifyErrors ?? true

  if (steamSignInInFlight) {
    log.warn('Waiting for in-flight Steam sign-in instead of starting a new exchange')
    await steamSignInInFlightDone
    // First attempt owns success/error broadcast; suppress a duplicate fallback.
    return true
  }

  const initResult = await initSteam()
  if (!initResult.ok) {
    log.withFields({ reason: initResult.reason }).debug('Steam ticket sign-in unavailable')
    return false
  }

  let releaseInFlight!: () => void
  steamSignInInFlightDone = new Promise<void>((resolve) => {
    releaseInFlight = resolve
  })
  steamSignInInFlight = true
  try {
    const ticketResult = await getWebApiTicket()
    if (!ticketResult.ok) {
      if (notifyErrors)
        windowAuthManager.broadcastAuthError(ticketResult.reason)
      else
        log.withFields({ reason: ticketResult.reason }).debug('Steam ticket fetch failed')
      return false
    }

    let exchangeResult: Awaited<ReturnType<typeof exchangeSteamTicketForTokens>>
    try {
      exchangeResult = await exchangeSteamTicketForTokens({
        serverUrl: SERVER_URL,
        ticketHex: ticketResult.ticketHex,
      })
    }
    finally {
      cancelWebApiTicket(ticketResult.authTicket)
    }

    if (!exchangeResult.ok) {
      if (notifyErrors)
        windowAuthManager.broadcastAuthError(exchangeResult.reason)
      else
        log.withFields({ reason: exchangeResult.reason }).debug('Steam ticket exchange failed')
      return false
    }

    windowAuthManager.broadcastAuthCallback(exchangeResult.tokens)
    log.log('Steam ticket sign-in successful')
    return true
  }
  finally {
    steamSignInInFlight = false
    releaseInFlight()
  }
}

/** Silent Steam ticket sign-in when `VITE_DISTRIBUTION=steam`; no-op otherwise. */
export async function trySteamSignIn(
  windowAuthManager: WindowAuthManager,
  options?: { distribution?: string },
): Promise<void> {
  const distribution = options?.distribution ?? import.meta.env.VITE_DISTRIBUTION
  if (distribution !== 'steam')
    return

  await startSteamTicketSignIn(windowAuthManager, { notifyErrors: false })
}

/**
 * Create the auth service IPC handlers for a given window context.
 *
 * Login always opens the existing browser OIDC flow (ui-server-auth chooser).
 * Steam depot builds additionally run {@link trySteamSignIn} at startup.
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

    if (signingInFlight) {
      log.withFields({ windowId: params.window.webContents.id }).warn('Replacing in-flight OIDC login attempt with a new request')
      closeLoopback?.()
      closeLoopback = null
      signingInFlight = false
    }

    signingInFlight = true

    try {
      const codeVerifier = generateCodeVerifier()
      const codeChallenge = await generateCodeChallenge(codeVerifier)
      const state = generateState()

      const loopback = await startLoopbackServer(state)
      closeLoopback = loopback.close

      // Use the server-side relay as redirect_uri. The relay page serves HTML
      // that forwards the authorization code to the loopback via JS fetch().
      // The loopback port is encoded in the state parameter as "{port}:{state}".
      const redirectUri = electronOidcRedirectUri(SERVER_URL)
      const stateWithPort = `${loopback.port}:${state}`

      // NOTICE: prompt=login forces the authorization server to show the login
      // page even if the system browser has an existing session cookie. Without
      // this, the OIDC flow auto-completes silently using the stale cookie.
      const url = new URL(OIDC_AUTHORIZE_PATH, SERVER_URL)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('client_id', OIDC_CLIENT_ID)
      url.searchParams.set('redirect_uri', redirectUri)
      url.searchParams.set('scope', OIDC_SCOPES)
      url.searchParams.set('state', stateWithPort)
      url.searchParams.set('code_challenge', codeChallenge)
      url.searchParams.set('code_challenge_method', 'S256')
      url.searchParams.set('prompt', 'login')
      url.searchParams.set('resource', SERVER_URL)

      await shell.openExternal(url.toString())

      loopback.result
        .then(async ({ code }) => {
          const tokens = await exchangeAuthorizationCode({
            serverUrl: SERVER_URL,
            clientId: OIDC_CLIENT_ID,
            code,
            codeVerifier,
            redirectUri,
          })
          params.windowAuthManager.broadcastAuthCallback(tokens)
          log.log('OIDC token exchange successful')
        })
        .catch((err) => {
          log.withError(err).error('OIDC signing in failed')
          params.windowAuthManager.broadcastAuthError(errorMessageFrom(err) ?? 'OIDC signing in failed')
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
      params.windowAuthManager.broadcastAuthError(errorMessageFrom(err) ?? 'OIDC signing in failed')
    }
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

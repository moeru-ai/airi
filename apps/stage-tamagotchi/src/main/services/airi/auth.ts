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
  oidcClientId,
} from '@proj-airi/stage-shared/auth'
import { shell } from 'electron'

import {
  electronAuthCallback,
  electronAuthCallbackError,
  electronAuthLogout,
  electronAuthSessionState,
  electronAuthStartLogin,
} from '../../../shared/eventa'
import { cancelWebApiTicket, getWebApiTicket, initSteam } from '../steam/client'
import { startLoopbackServer } from './http-server/http/auth'
import { electronOidcRedirectUri, exchangeAuthorizationCode } from './oidc-token-exchange'
import { exchangeSteamTicketForTokens } from './steam-sign-in'

const log = useLogg('auth-service').useGlobalConfig()

type MainContext = ReturnType<typeof createContext>['context']

// OIDC configuration for the Electron client.
const OIDC_SCOPES = 'openid profile email offline_access'
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'https://api.airi.build'
const OIDC_AUTHORIZE_PATH = '/api/auth/oauth2/authorize'

// Active loopback server cleanup handle
let closeLoopback: (() => void) | null = null
let signingInFlight = false
/** Serializes Steam ticket exchange across concurrent Steam gestures. */
let steamSignInInFlight = false
/** Resolves with the first attempt's result when the in-flight sign-in finishes. */
let steamSignInInFlightDone: Promise<boolean> = Promise.resolve(false)

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
 * Runs the silent Steam ticket sign-in flow for Steam depot builds.
 *
 * Used by {@link trySteamSignIn} at startup; the default Login button keeps
 * using browser OIDC. Returns `true` when tokens were broadcast and `false`
 * when Steam is unavailable or the ticket exchange failed. Concurrent callers
 * receive the first attempt's result instead of starting a second exchange.
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
    return await steamSignInInFlightDone
  }

  // Claim the slot before any await so concurrent callers observe the
  // in-flight promise even while initSteam is still running.
  let finishInFlight!: (result: boolean) => void
  steamSignInInFlightDone = new Promise<boolean>((resolve) => {
    finishInFlight = resolve
  })
  steamSignInInFlight = true
  let result = false
  try {
    const initResult = await initSteam()
    if (!initResult.ok) {
      log.withFields({ reason: initResult.reason }).debug('Steam ticket sign-in unavailable')
      return false
    }

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
    result = true
    return true
  }
  finally {
    steamSignInInFlight = false
    finishInFlight(result)
  }
}

/**
 * Silent Steam ticket sign-in when `VITE_DISTRIBUTION=steam`; no-op
 * otherwise, or when an AIRI session already exists so the startup flow
 * never overwrites the user's current account with a Steam-created one.
 */
export async function trySteamSignIn(
  windowAuthManager: WindowAuthManager,
  options?: { distribution?: string, hasExistingSession?: boolean },
): Promise<void> {
  const distribution = options?.distribution ?? import.meta.env.VITE_DISTRIBUTION
  if (distribution !== 'steam')
    return

  if (options?.hasExistingSession) {
    log.debug('Skipping silent Steam sign-in: an AIRI session already exists')
    return
  }

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
      url.searchParams.set('client_id', oidcClientId)
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
            clientId: oidcClientId,
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

  defineInvokeHandler(params.context, electronAuthSessionState, (payload, options) => {
    if (params.window.webContents.id !== options?.raw.ipcMainEvent.sender.id) {
      return
    }

    void trySteamSignIn(params.windowAuthManager, { hasExistingSession: payload.hasSession })
  })
}

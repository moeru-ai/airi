import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { generateCodeChallenge, generateCodeVerifier, generateState } from '@proj-airi/stage-shared/auth'
import { shell } from 'electron'

import {
  electronAuthCallback,
  electronAuthCallbackError,
  electronAuthLogout,
  electronAuthStartLogin,
} from '../../../shared/eventa'
import { startLoopbackServer } from './loopback-server'

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
let loginInFlight = false
const authContexts = new Set<MainContext>()

function emitAuthCallback(tokens: TokenExchangeResult): void {
  for (const context of authContexts) {
    context.emit(electronAuthCallback, tokens)
  }
}

function emitAuthError(error: string): void {
  for (const context of authContexts) {
    context.emit(electronAuthCallbackError, { error })
  }
}

/**
 * Create the auth service IPC handlers for a given window context.
 */
export function createAuthService(params: {
  context: MainContext
  window: BrowserWindow
}): void {
  authContexts.add(params.context)
  params.window.on('closed', () => {
    authContexts.delete(params.context)
  })

  defineInvokeHandler(params.context, electronAuthStartLogin, async (_, options) => {
    if (params.window.webContents.id !== options?.raw.ipcMainEvent.sender.id) {
      return
    }

    if (loginInFlight) {
      log.withFields({ windowId: params.window.webContents.id }).warn('Replacing in-flight OIDC login attempt with a new request')
      closeLoopback?.()
      closeLoopback = null
      loginInFlight = false
    }

    loginInFlight = true

    try {
      // Clean up any previous in-flight login
      closeLoopback?.()

      const codeVerifier = generateCodeVerifier()
      const codeChallenge = await generateCodeChallenge(codeVerifier)
      const state = generateState()

      // Start loopback server to receive the callback
      const loopback = await startLoopbackServer()
      closeLoopback = loopback.close

      // Use the server-side relay as redirect_uri. The relay page serves HTML
      // that forwards the authorization code to the loopback via JS fetch().
      // The loopback port is encoded in the state parameter as "{port}:{state}".
      const redirectUri = `${SERVER_URL}/api/auth/oidc/electron-callback`
      const stateWithPort = `${loopback.port}:${state}`

      // Build authorization URL
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

      // Open system browser
      await shell.openExternal(url.toString())

      // Wait for the callback in the background
      loopback.result
        .then(async ({ code, state: returnedState }) => {
          if (returnedState !== state) {
            log.warn('State mismatch — possible CSRF attack')
            emitAuthError('State mismatch')
            return
          }

          const tokens = await exchangeCode(code, codeVerifier, redirectUri)
          emitAuthCallback(tokens)
          log.log('OIDC token exchange successful')
        })
        .catch((err) => {
          log.withError(err).error('OIDC login failed')
          emitAuthError(errorMessageFrom(err) ?? 'OIDC login failed')
        })
        .finally(() => {
          closeLoopback = null
          loginInFlight = false
        })
    }
    catch (err) {
      closeLoopback = null
      loginInFlight = false
      log.withError(err).error('Failed to start OIDC login flow')
      emitAuthError(errorMessageFrom(err) ?? 'OIDC login failed')
    }
  })

  defineInvokeHandler(params.context, electronAuthLogout, async (_, options) => {
    if (params.window.webContents.id !== options?.raw.ipcMainEvent.sender.id) {
      return
    }

    closeLoopback?.()
    closeLoopback = null
    loginInFlight = false
  })
}

// --- Internal helpers ---

interface TokenExchangeResult {
  accessToken: string
  refreshToken?: string
  idToken?: string
  expiresIn: number
}

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

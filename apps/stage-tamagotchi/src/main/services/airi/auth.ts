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
  electronAuthLogout,
  electronAuthStartLogin,
} from '../../../shared/eventa'
import { startLoopbackServer } from './http-server/http/auth'

const log = useLogg('auth-service').useGlobalConfig()

type MainContext = ReturnType<typeof createContext>['context']

// OIDC configuration for the Electron client.
const OIDC_CLIENT_ID = import.meta.env.VITE_OIDC_CLIENT_ID || 'airi-stage-electron'
const OIDC_SCOPES = 'openid profile email offline_access'
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'https://api.airi.build'
const OIDC_AUTHORIZE_PATH = '/api/auth/oauth2/authorize'
const OIDC_TOKEN_PATH = '/api/auth/oauth2/token'

// One main-process attempt owns the callback across all renderer windows.
// Replacement, logout, and owner closure invalidate it before cleanup. Async
// continuations can publish results or clear ownership only while it is current.
interface LoginAttempt {
  window: BrowserWindow
  controller: AbortController
  closeLoopback?: () => void
}

let activeAttempt: LoginAttempt | undefined

function cancelLogin(): void {
  const attempt = activeAttempt
  activeAttempt = undefined
  attempt?.controller.abort()
  attempt?.closeLoopback?.()
}

/**
 * Create the auth service IPC handlers for a given window context.
 */
export function createAuthService(params: {
  context: MainContext
  window: BrowserWindow
}): void {
  params.window.once('closed', () => {
    if (activeAttempt?.window === params.window)
      cancelLogin()
  })

  defineInvokeHandler(params.context, electronAuthStartLogin, async (_, options) => {
    if (params.window.webContents.id !== options?.raw.ipcMainEvent.sender.id) {
      return
    }

    cancelLogin()
    const attempt: LoginAttempt = { window: params.window, controller: new AbortController() }
    activeAttempt = attempt

    try {
      const codeVerifier = generateCodeVerifier()
      const codeChallenge = await generateCodeChallenge(codeVerifier)
      if (activeAttempt !== attempt)
        return
      const state = generateState()

      // Start loopback server to receive the callback
      const loopback = await startLoopbackServer(state)
      attempt.closeLoopback = loopback.close
      // Attach a rejection handler before browser launch or cancellation. Either
      // can happen before the callback arrives, including during server startup.
      const result = loopback.result.then(
        callback => ({ callback }),
        error => ({ error }),
      )
      if (activeAttempt !== attempt) {
        loopback.close()
        return
      }

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

      // The IPC request completes when the browser opens. This background task
      // owns the callback and token exchange until success, failure, or cancellation.
      async function completeLogin(): Promise<void> {
        try {
          const outcome = await result
          if (activeAttempt !== attempt)
            return
          if ('error' in outcome)
            throw outcome.error
          const tokens = await exchangeCode(outcome.callback.code, codeVerifier, redirectUri, attempt.controller.signal)
          if (activeAttempt !== attempt)
            return
          params.context.emit(electronAuthCallback, tokens)
          log.log('OIDC token exchange successful')
        }
        catch (error) {
          if (activeAttempt !== attempt)
            return
          log.withError(error).error('OIDC signing in failed')
          params.context.emit(electronAuthCallbackError, { error: errorMessageFrom(error) ?? 'OIDC signing in failed' })
        }
        finally {
          loopback.close()
          if (activeAttempt === attempt)
            activeAttempt = undefined
        }
      }

      void completeLogin()
      await shell.openExternal(url.toString())
    }
    catch (error) {
      if (activeAttempt !== attempt)
        return
      cancelLogin()
      log.withError(error).error('Failed to start OIDC signing in flow')
      params.context.emit(electronAuthCallbackError, { error: errorMessageFrom(error) ?? 'OIDC signing in failed' })
    }
  })

  defineInvokeHandler(params.context, electronAuthLogout, async (_, options) => {
    if (params.window.webContents.id !== options?.raw.ipcMainEvent.sender.id) {
      return
    }

    cancelLogin()
  })
}

// --- Internal helpers ---

interface TokenExchangeResult {
  accessToken: string
  refreshToken?: string
  idToken?: string
  expiresIn: number
}

async function exchangeCode(code: string, codeVerifier: string, redirectUri: string, signal: AbortSignal): Promise<TokenExchangeResult> {
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
    signal,
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

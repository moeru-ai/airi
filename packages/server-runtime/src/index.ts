import type { WebSocketEvent } from '@proj-airi/server-shared/types'

import type { AuthenticatedPeer, Peer } from './types'

import { env } from 'node:process'

import { availableLogLevelStrings, Format, LogLevel, logLevelStringToLogLevelMap, setGlobalFormat, setGlobalLogLevel, useLogg } from '@guiiai/logg'
import { defineWebSocketHandler, H3 } from 'h3'

import { WebSocketReadyState } from './types'

setGlobalFormat(Format.Pretty)
setGlobalLogLevel(LogLevel.Log)

if (env.LOG_LEVEL) {
  const level = env.LOG_LEVEL as typeof availableLogLevelStrings[number]
  if (availableLogLevelStrings.includes(level)) {
    setGlobalLogLevel(logLevelStringToLogLevelMap[level])
  }
}

// cache token
const AUTH_TOKEN = env.AUTHENTICATION_TOKEN || ''
const UNAUTH_TIMEOUT_MS = 5000
const MESSAGE_RATE_LIMIT = 30                // events per window
const MESSAGE_RATE_WINDOW_MS = 3000          // 3 seconds

// pre-stringified responses
const RESPONSES = {
  authenticated: JSON.stringify({ type: 'module:authenticated', data: { authenticated: true } }),
  notAuthenticated: JSON.stringify({ type: 'error', data: { message: 'not authenticated' } }),
}

// safe send utility
function safeSend(peer: Peer, payload: string) {
  try {
    if (peer.readyState === WebSocketReadyState.OPEN) {
      peer.send(payload)
    }
  }
  catch (err) {
    // swallow, will be handled by cleanup logic
  }
}

function sendJSON(peer: Peer, event: WebSocketEvent | string) {
  safeSend(peer, typeof event === 'string' ? event : JSON.stringify(event))
}

// validation helpers
function assertString(value: unknown, field: string, event: string): string | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return `the field '${field}' must be a non-empty string for event '${event}'`
  }
  return null
}

function assertNonNegInt(value: unknown, field: string, event: string): string | null {
  if (value === undefined) return null
  if (!Number.isInteger(value) || value < 0) {
    return `the field '${field}' must be a non-negative integer for event '${event}'`
  }
  return null
}

// compact module key
const moduleKey = (name: string, index?: number) => `${name}:${index ?? ''}`

interface RateState {
  count: number
  resetAt: number
}

function createRateLimiter() {
  const buckets = new Map<string, RateState>()

  return {
    check(peerId: string): boolean {
      const now = Date.now()
      let state = buckets.get(peerId)

      if (!state || now >= state.resetAt) {
        state = { count: 1, resetAt: now + MESSAGE_RATE_WINDOW_MS }
        buckets.set(peerId, state)
        return true
      }

      state.count++
      return state.count <= MESSAGE_RATE_LIMIT
    },
  }
}

function setupApp(): H3 {
  const appLogger = useLogg('App').useGlobalConfig()
  const wsLogger = useLogg('WebSocket').useGlobalConfig()

  const app = new H3({
    onError: (error) => appLogger.withError(error).error('an error occurred'),
  })

  // state
  const peers = new Map<string, AuthenticatedPeer>()
  const modulePeers = new Map<string, AuthenticatedPeer>() // key: moduleName:index
  const rateLimiter = createRateLimiter()

  // peer registration helpers
  function registerModulePeer(p: AuthenticatedPeer) {
    if (!p.name) return
    const key = moduleKey(p.name, p.index)
    modulePeers.set(key, p)
  }

  function unregisterModulePeer(p: AuthenticatedPeer) {
    if (!p.name) return
    const key = moduleKey(p.name, p.index)
    modulePeers.delete(key)
  }

  function handleAuthenticate(peer: Peer, p: AuthenticatedPeer, token: string) {
    if (AUTH_TOKEN && token !== AUTH_TOKEN) {
      wsLogger.withFields({ peer: peer.id }).debug('authentication failed')
      sendJSON(peer, { type: 'error', data: { message: 'invalid token' } })
      return
    }

    p.authenticated = true
    safeSend(peer, RESPONSES.authenticated)
  }

  function handleAnnounce(peer: Peer, p: AuthenticatedPeer, data: any) {
    if (AUTH_TOKEN && !p.authenticated) {
      sendJSON(peer, { type: 'error', data: { message: 'must authenticate before announcing' } })
      return
    }

    const errName = assertString(data.name, 'name', 'module:announce')
    if (errName) return sendJSON(peer, { type: 'error', data: { message: errName } })

    const errIndex = assertNonNegInt(data.index, 'index', 'module:announce')
    if (errIndex) return sendJSON(peer, { type: 'error', data: { message: errIndex } })

    unregisterModulePeer(p)
    p.name = data.name
    p.index = data.index
    registerModulePeer(p)
  }

  function handleConfigure(peer: Peer, data: any) {
    const errName = assertString(data.moduleName, 'moduleName', 'ui:configure')
    if (errName) return sendJSON(peer, { type: 'error', data: { message: errName } })

    const errIndex = assertNonNegInt(data.moduleIndex, 'moduleIndex', 'ui:configure')
    if (errIndex) return sendJSON(peer, { type: 'error', data: { message: errIndex } })

    const key = moduleKey(data.moduleName, data.moduleIndex)
    const target = modulePeers.get(key)

    if (!target) {
      sendJSON(peer, { type: 'error', data: { message: 'module not found or not announced' } })
      return
    }

    // optionally validate config (size limit)
    const configStr = JSON.stringify(data.config)
    if (configStr.length > 100_000) {
      return sendJSON(peer, { type: 'error', data: { message: 'config too large' } })
    }

    sendJSON(target.peer, { type: 'module:configure', data: { config: data.config } })
  }

  function handleDefaultBroadcast(peer: Peer, p: AuthenticatedPeer, raw: string, event: WebSocketEvent) {
    if (!p.authenticated) {
      wsLogger.withFields({ peer: peer.id }).debug('not authenticated')
      return safeSend(peer, RESPONSES.notAuthenticated)
    }

    if (!rateLimiter.check(peer.id)) {
      return sendJSON(peer, { type: 'error', data: { message: 'rate limit exceeded' } })
    }

    for (const [id, other] of peers) {
      if (id === peer.id) continue
      safeSend(other.peer, raw)
    }
  }

  const router: Record<string, Function> = {
    'module:authenticate': (peer: Peer, p: AuthenticatedPeer, data: any) =>
      handleAuthenticate(peer, p, data.token),

    'module:announce': (peer: Peer, p: AuthenticatedPeer, data: any) =>
      handleAnnounce(peer, p, data),

    'ui:configure': (peer: Peer, p: AuthenticatedPeer, data: any) =>
      handleConfigure(peer, data),
  }

  app.get(
    '/ws',
    defineWebSocketHandler({
      open: (peer) => {
        const peerState: AuthenticatedPeer = {
          peer,
          authenticated: !AUTH_TOKEN, // auto-true if no token required
          name: '',
        }

        peers.set(peer.id, peerState)

        if (AUTH_TOKEN) {
          setTimeout(() => {
            const p = peers.get(peer.id)
            if (p && !p.authenticated) peer.close()
          }, UNAUTH_TIMEOUT_MS)
        }

        wsLogger.withFields({ peer: peer.id, activePeers: peers.size }).log('connected')
      },

      message: (peer, message) => {
        const raw = message.text()
        let event: WebSocketEvent

        try {
          event = message.json()
        }
        catch (err: any) {
          return sendJSON(peer, {
            type: 'error',
            data: { message: `invalid JSON: ${err?.message || String(err)}` },
          })
        }

        const peerState = peers.get(peer.id)
        if (!peerState) return

        const handler = router[event.type]
        if (handler) {
          return handler(peer, peerState, event.data)
        }

        // default: broadcast
        handleDefaultBroadcast(peer, peerState, raw, event)
      },

      error: (peer, error) => {
        wsLogger.withFields({ peer: peer.id }).withError(error).error('error occurred')
      },

      close: (peer, details) => {
        const p = peers.get(peer.id)
        if (p) unregisterModulePeer(p)

        peers.delete(peer.id)
        wsLogger.withFields({ peer: peer.id, details, activePeers: peers.size }).log('closed')
      },
    })
  )

  return app
}

export const app: H3 = setupApp()


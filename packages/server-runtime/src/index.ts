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
const MESSAGE_RATE_LIMIT = 30 // events per window
const MESSAGE_RATE_WINDOW_MS = 5000 // 5 seconds
const MAX_CONFIG_SIZE_BYTES = 200_000 // 200KB
const MAX_CONFIG_DEPTH = 8
const MAX_CONFIG_CHILDREN = 200
const HEARTBEAT_INTERVAL_MS = 10000 // 10 seconds
const HEARTBEAT_TIMEOUT_MS = HEARTBEAT_INTERVAL_MS * 2

// extend peer interface with close method
interface PeerWithClose extends Peer {
  close: () => void
}

// pre-stringified responses
const RESPONSES = {
  authenticated: JSON.stringify({ type: 'module:authenticated', data: { authenticated: true } }),
  notAuthenticated: JSON.stringify({ type: 'error', data: { message: 'not authenticated' } }),
}

const safeSendLogger = useLogg('SafeSend').useGlobalConfig()

const HEARTBEAT_EVENT_TYPE = 'server:heartbeat'
function createHeartbeatPayload() {
  return JSON.stringify({ type: HEARTBEAT_EVENT_TYPE, data: { timestamp: Date.now() } })
}

// safe send utility
function safeSend(peer: Peer, payload: string) {
  try {
    if (peer.readyState === WebSocketReadyState.OPEN) {
      peer.send(payload)
    }
  }
  catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    safeSendLogger.withFields({ peer: peer.id }).withError(error).debug('failed to send payload')
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
  if (value === undefined)
    return null
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return `the field '${field}' must be a non-negative integer for event '${event}'`
  }
  return null
}

// compact module key
const moduleKey = (name: string, index?: number) => `${name}:${index ?? ''}`

export type ConfigValidator = (config: unknown) => string | null
const moduleConfigValidators = new Map<string, ConfigValidator>()

export function registerModuleConfigValidator(
  moduleName: string,
  validator: ConfigValidator,
  moduleIndex?: number,
) {
  moduleConfigValidators.set(moduleKey(moduleName, moduleIndex), validator)
}

export function unregisterModuleConfigValidator(moduleName: string, moduleIndex?: number) {
  moduleConfigValidators.delete(moduleKey(moduleName, moduleIndex))
}

function validateConfig(value: unknown, depth = 0, path = 'config'): string | null {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return null

  if (typeof value === 'object') {
    if (depth >= MAX_CONFIG_DEPTH)
      return `config depth exceeded at '${path}'`

    if (Array.isArray(value)) {
      if (value.length > MAX_CONFIG_CHILDREN)
        return `config arrays cannot exceed ${MAX_CONFIG_CHILDREN} elements at '${path}'`

      for (let i = 0; i < value.length; i++) {
        const childErr = validateConfig(value[i], depth + 1, `${path}[${i}]`)
        if (childErr)
          return childErr
      }
      return null
    }

    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length > MAX_CONFIG_CHILDREN)
      return `config objects cannot have more than ${MAX_CONFIG_CHILDREN} keys at '${path}'`

    for (const [key, child] of entries) {
      if (!key.length)
        return `config object keys must be non-empty strings at '${path}'`
      const childErr = validateConfig(child, depth + 1, `${path}.${key}`)
      if (childErr)
        return childErr
    }
    return null
  }

  return `config contains unsupported value at '${path}'`
}

function assertConfig(value: unknown): string | null {
  if (value === undefined)
    return `'config' is required for event 'ui:configure'`
  if (value === null || (typeof value !== 'object' && !Array.isArray(value)))
    return `'config' must be an object or array for event 'ui:configure'`
  return validateConfig(value)
}

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
    remove(peerId: string) {
      buckets.delete(peerId)
    },
  }
}

function setupApp(): H3 {
  const appLogger = useLogg('App').useGlobalConfig()
  const wsLogger = useLogg('WebSocket').useGlobalConfig()

  const app = new H3({
    onError: error => appLogger.withError(error).error('an error occurred'),
  })

  // state
  const peers = new Map<string, AuthenticatedPeer>()
  const modulePeers = new Map<string, Set<AuthenticatedPeer>>() // key: moduleName:index
  const rateLimiter = createRateLimiter()
  const heartbeatTimers = new Map<string, ReturnType<typeof setInterval>>()
  const peerActivity = new Map<string, number>()

  function markPeerActivity(peerId: string) {
    peerActivity.set(peerId, Date.now())
  }

  function stopHeartbeat(peerId: string) {
    const timer = heartbeatTimers.get(peerId)
    if (timer)
      clearInterval(timer)
    heartbeatTimers.delete(peerId)
    peerActivity.delete(peerId)
  }

  function startHeartbeat(peer: Peer) {
    stopHeartbeat(peer.id)
    markPeerActivity(peer.id)

    const interval = setInterval(() => {
      const last = peerActivity.get(peer.id) ?? 0
      if (Date.now() - last > HEARTBEAT_TIMEOUT_MS) {
        wsLogger.withFields({ peer: peer.id }).warn('heartbeat timeout, closing connection')
        try {
          (peer as PeerWithClose).close()
        }
        catch {
          // no-op
        }
        stopHeartbeat(peer.id)
        return
      }

      safeSend(peer, createHeartbeatPayload())
    }, HEARTBEAT_INTERVAL_MS)

    heartbeatTimers.set(peer.id, interval)
  }

  // peer registration helpers
  function registerModulePeer(p: AuthenticatedPeer) {
    if (!p.name)
      return
    const key = moduleKey(p.name, p.index)
    const existing = modulePeers.get(key)
    if (existing) {
      existing.add(p)
      return
    }
    modulePeers.set(key, new Set([p]))
  }

  function unregisterModulePeer(p: AuthenticatedPeer) {
    if (!p.name)
      return
    const key = moduleKey(p.name, p.index)
    const bucket = modulePeers.get(key)
    if (!bucket)
      return
    bucket.delete(p)
    if (!bucket.size)
      modulePeers.delete(key)
  }

  function broadcastModuleRemoved(p: AuthenticatedPeer) {
    if (!p.name)
      return
    const payload = JSON.stringify({
      type: 'module:removed',
      data: { moduleName: p.name, moduleIndex: p.index },
    })
    for (const [id, other] of peers) {
      if (id === p.peer.id)
        continue
      safeSend(other.peer, payload)
    }
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

  function handleAnnounce(peer: Peer, p: AuthenticatedPeer, data: Record<string, unknown>) {
    if (AUTH_TOKEN && !p.authenticated) {
      sendJSON(peer, { type: 'error', data: { message: 'must authenticate before announcing' } })
      return
    }

    const errName = assertString(data.name, 'name', 'module:announce')
    if (errName)
      return sendJSON(peer, { type: 'error', data: { message: errName } })

    const errIndex = assertNonNegInt(data.index, 'index', 'module:announce')
    if (errIndex)
      return sendJSON(peer, { type: 'error', data: { message: errIndex } })

    unregisterModulePeer(p)
    p.name = data.name
    p.index = data.index
    registerModulePeer(p)
  }

  function handleConfigure(peer: Peer, data: Record<string, unknown>) {
    const errName = assertString(data.moduleName, 'moduleName', 'ui:configure')
    if (errName)
      return sendJSON(peer, { type: 'error', data: { message: errName } })

    const errIndex = assertNonNegInt(data.moduleIndex, 'moduleIndex', 'ui:configure')
    if (errIndex)
      return sendJSON(peer, { type: 'error', data: { message: errIndex } })

    const errConfig = assertConfig(data.config)
    if (errConfig)
      return sendJSON(peer, { type: 'error', data: { message: errConfig } })

    if (typeof data.moduleName !== 'string')
      return sendJSON(peer, { type: 'error', data: { message: 'invalid moduleName' } })

    if (typeof data.moduleIndex !== 'number' || !Number.isInteger(data.moduleIndex) || data.moduleIndex < 0)
      return sendJSON(peer, { type: 'error', data: { message: 'invalid moduleIndex' } })

    const moduleName = data.moduleName
    const moduleIndex = data.moduleIndex as number | undefined
    const key = moduleKey(moduleName, moduleIndex)
    const targets = modulePeers.get(key)

    if (!targets || !targets.size) {
      sendJSON(peer, { type: 'error', data: { message: 'module not found or not announced' } })
      return
    }

    // optionally validate config (size limit)
    const configStr = JSON.stringify(data.config)
    if (configStr.length > MAX_CONFIG_SIZE_BYTES) {
      return sendJSON(peer, { type: 'error', data: { message: 'config too large' } })
    }

    const validator = moduleConfigValidators.get(key)
    if (validator) {
      const validatorErr = validator(data.config)
      if (validatorErr)
        return sendJSON(peer, { type: 'error', data: { message: validatorErr } })
    }

    for (const target of targets)
      sendJSON(target.peer, { type: 'module:configure', data: { config: data.config } })
  }

  function handleDefaultBroadcast(peer: Peer, p: AuthenticatedPeer, raw: string) {
    if (!p.authenticated) {
      wsLogger.withFields({ peer: peer.id }).debug('not authenticated')
      return safeSend(peer, RESPONSES.notAuthenticated)
    }

    if (!rateLimiter.check(peer.id)) {
      return sendJSON(peer, { type: 'error', data: { message: 'rate limit exceeded' } })
    }

    for (const [id, other] of peers) {
      if (id === peer.id)
        continue
      safeSend(other.peer, raw)
    }
  }

  const router: Record<string, (peer: Peer, p: AuthenticatedPeer, data: Record<string, unknown>) => void> = {
    'module:authenticate': (peer: Peer, p: AuthenticatedPeer, data: Record<string, unknown>) => {
      const err = assertString(data.token, 'token', 'module:authenticate')
      if (err) {
        return sendJSON(peer, { type: 'error', data: { message: err } })
      }
      handleAuthenticate(peer, p, data.token as string)
    },

    'module:announce': (peer: Peer, p: AuthenticatedPeer, data: Record<string, unknown>) =>
      handleAnnounce(peer, p, data),

    'ui:configure': (peer: Peer, p: AuthenticatedPeer, data: Record<string, unknown>) =>
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
        startHeartbeat(peer)

        if (AUTH_TOKEN) {
          setTimeout(() => {
            const p = peers.get(peer.id)
            if (p && !p.authenticated)
              peer.close()
          }, UNAUTH_TIMEOUT_MS)
        }

        wsLogger.withFields({ peer: peer.id, activePeers: peers.size }).log('connected')
      },

      message: (peer, message) => {
        const raw = message.text()
        markPeerActivity(peer.id)
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
        if (!peerState)
          return

        const handler = router[event.type]
        if (handler) {
          return handler(peer, peerState, event.data)
        }

        // default: broadcast
        handleDefaultBroadcast(peer, peerState, raw)
      },

      error: (peer, error) => {
        wsLogger.withFields({ peer: peer.id }).withError(error).error('error occurred')
      },

      close: (peer, details) => {
        const p = peers.get(peer.id)
        if (p) {
          unregisterModulePeer(p)
          broadcastModuleRemoved(p)
        }

        peers.delete(peer.id)
        rateLimiter.remove(peer.id)
        stopHeartbeat(peer.id)
        wsLogger.withFields({ peer: peer.id, details, activePeers: peers.size }).log('closed')
      },
    }),
  )

  return app
}

export const app: H3 = setupApp()

import type { H3Event } from 'h3'

import { Buffer } from 'node:buffer'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  VISUAL_CHAT_GATEWAY_TOKEN_HEADER,
  VISUAL_CHAT_SESSION_TOKEN_HEADER,
} from '@proj-airi/visual-chat-protocol'
import { getVisualChatDir, normalizeVisualChatSessionId } from '@proj-airi/visual-chat-shared'
import { createError, getHeader } from 'h3'

const GATEWAY_ACCESS_SCOPE = '__gateway__'
const GATEWAY_SECRET_FILENAME = 'gateway-access-secret.txt'

let cachedGatewaySecret: string | null = null

function getGatewaySecretPath(): string {
  return join(getVisualChatDir('config'), GATEWAY_SECRET_FILENAME)
}

function loadOrCreateGatewaySecret(): string {
  if (cachedGatewaySecret)
    return cachedGatewaySecret

  const secretPath = getGatewaySecretPath()
  if (existsSync(secretPath)) {
    cachedGatewaySecret = readFileSync(secretPath, 'utf8').trim()
    if (cachedGatewaySecret)
      return cachedGatewaySecret
  }

  const secret = randomBytes(32).toString('base64url')
  mkdirSync(getVisualChatDir('config'), { recursive: true })
  writeFileSync(secretPath, `${secret}\n`, { encoding: 'utf8', mode: 0o600 })
  cachedGatewaySecret = secret
  return secret
}

function signScope(scope: string): string {
  return createHmac('sha256', loadOrCreateGatewaySecret())
    .update(`visual-chat:${scope}`)
    .digest('base64url')
}

function tokensMatch(expected: string, actual: string | undefined): boolean {
  if (!actual || expected.length !== actual.length)
    return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase()
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '::1'
    || normalized === '[::1]'
}

function isLoopbackAddress(address: string | undefined): boolean {
  const normalized = address?.trim().toLowerCase() ?? ''
  return normalized === '127.0.0.1'
    || normalized === '::1'
    || normalized === '::ffff:127.0.0.1'
}

function isTrustedLoopbackOrigin(origin: string | undefined): boolean {
  const normalized = origin?.trim()
  if (!normalized)
    return false
  if (normalized === 'null')
    return true

  try {
    const url = new URL(normalized)
    return isLoopbackHost(url.hostname)
  }
  catch {
    return false
  }
}

export function createGatewayAccessToken(): string {
  return signScope(GATEWAY_ACCESS_SCOPE)
}

export function createSessionAccessToken(sessionId: string): string {
  return signScope(`session:${normalizeVisualChatSessionId(sessionId)}`)
}

export function readGatewayAccessToken(event: H3Event): string | undefined {
  return getHeader(event, VISUAL_CHAT_GATEWAY_TOKEN_HEADER)?.trim() || undefined
}

export function readSessionAccessToken(event: H3Event): string | undefined {
  return getHeader(event, VISUAL_CHAT_SESSION_TOKEN_HEADER)?.trim() || undefined
}

export function isTrustedLocalRequest(event: H3Event): boolean {
  const remoteAddress = event.node.req.socket.remoteAddress
  if (!isLoopbackAddress(remoteAddress))
    return false

  const origin = getHeader(event, 'origin')?.trim()
  if (!origin)
    return true

  return isTrustedLoopbackOrigin(origin)
}

export function hasGatewayAccess(event: H3Event): boolean {
  const providedToken = readGatewayAccessToken(event)
  return isTrustedLocalRequest(event) || tokensMatch(createGatewayAccessToken(), providedToken)
}

export function requireGatewayAccess(event: H3Event): void {
  if (!hasGatewayAccess(event)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Gateway access denied.',
    })
  }
}

export function hasSessionAccess(event: H3Event, sessionId: string, allowGatewayAccess: boolean = true): boolean {
  try {
    const normalizedSessionId = normalizeVisualChatSessionId(sessionId)
    if (allowGatewayAccess && hasGatewayAccess(event))
      return true
    return tokensMatch(createSessionAccessToken(normalizedSessionId), readSessionAccessToken(event))
  }
  catch {
    return false
  }
}

export function requireSessionAccess(event: H3Event, sessionId: string, allowGatewayAccess: boolean = true): string {
  let normalizedSessionId: string
  try {
    normalizedSessionId = normalizeVisualChatSessionId(sessionId)
  }
  catch {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid session id.',
    })
  }

  if (!hasSessionAccess(event, normalizedSessionId, allowGatewayAccess)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Session access denied.',
    })
  }
  return normalizedSessionId
}

export function verifyWsSessionAccess(sessionId: string, sessionToken: string): boolean {
  try {
    const normalizedSessionId = normalizeVisualChatSessionId(sessionId)
    return tokensMatch(createSessionAccessToken(normalizedSessionId), sessionToken.trim())
  }
  catch {
    return false
  }
}

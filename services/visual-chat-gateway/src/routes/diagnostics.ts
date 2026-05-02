import type { SessionStore } from '@proj-airi/visual-chat-runtime'

import process from 'node:process'

import { existsSync, readFileSync } from 'node:fs'
import { hostname, networkInterfaces } from 'node:os'
import { join } from 'node:path'

import { getVisualChatDir } from '@proj-airi/visual-chat-shared'
import { createRouter, defineEventHandler } from 'h3'

import { requireGatewayAccess } from '../auth'
import { gatewayEnv } from '../gateway-env'

const startedAt = Date.now()
const DEFAULT_PUBLIC_ENDPOINTS_FILE = process.env.AIRI_VISUAL_CHAT_PUBLIC_ENDPOINTS_FILE?.trim()
  || join(getVisualChatDir('config'), 'public-endpoints.json')

const IPV4_SEGMENT_PATTERN = /^\d{1,3}$/
const VIRTUAL_INTERFACE_PATTERN = /hyper-v|wsl|vethernet|vmware|virtualbox|docker|podman|zerotier|tailscale|clash|tun|tap|vpn|loopback|bluetooth|hamachi/i
const WIFI_INTERFACE_PATTERN = /wi-?fi|wlan|wireless/i
const ETHERNET_INTERFACE_PATTERN = /ethernet|\u4EE5\u592A\u7F51|^en\d|^eth\d/i

function parseIpv4(address: string): number[] | null {
  const segments = address.trim().split('.')
  if (segments.length !== 4)
    return null

  const numbers = segments.map((segment) => {
    if (!IPV4_SEGMENT_PATTERN.test(segment))
      return Number.NaN
    return Number(segment)
  })

  if (numbers.some(segment => Number.isNaN(segment) || segment < 0 || segment > 255))
    return null

  return numbers
}

function scoreLanAddressCandidate(candidate: { address: string, interfaceName?: string }): number {
  const segments = parseIpv4(candidate.address)
  if (!segments)
    return Number.NEGATIVE_INFINITY

  const isLoopback = segments[0] === 127
  const isLinkLocal = segments[0] === 169 && segments[1] === 254
  const isBenchmark = segments[0] === 198 && (segments[1] === 18 || segments[1] === 19)
  if (isLoopback || isLinkLocal || isBenchmark)
    return Number.NEGATIVE_INFINITY

  if (candidate.interfaceName && VIRTUAL_INTERFACE_PATTERN.test(candidate.interfaceName))
    return Number.NEGATIVE_INFINITY

  let score = 0
  const isPrivate = segments[0] === 10
    || (segments[0] === 172 && segments[1] >= 16 && segments[1] <= 31)
    || (segments[0] === 192 && segments[1] === 168)
  const isCarrierGradeNat = segments[0] === 100 && segments[1] >= 64 && segments[1] <= 127

  if (isPrivate)
    score += 100
  else
    score -= 40

  if (isCarrierGradeNat)
    score -= 20

  const interfaceName = candidate.interfaceName?.trim() ?? ''
  if (WIFI_INTERFACE_PATTERN.test(interfaceName))
    score += 40
  else if (ETHERNET_INTERFACE_PATTERN.test(interfaceName))
    score += 25

  return score
}

function getPreferredLanAddresses(candidates: Array<{ address: string, interfaceName?: string }>): string[] {
  const deduped = new Map<string, { address: string, interfaceName?: string }>()

  for (const candidate of candidates) {
    const address = candidate.address.trim()
    if (!address)
      continue

    const current = { ...candidate, address }
    const score = scoreLanAddressCandidate(current)
    if (!Number.isFinite(score))
      continue

    const existing = deduped.get(address)
    if (!existing || scoreLanAddressCandidate(existing) < score)
      deduped.set(address, current)
  }

  return [...deduped.values()]
    .sort((left, right) => {
      const scoreDelta = scoreLanAddressCandidate(right) - scoreLanAddressCandidate(left)
      if (scoreDelta !== 0)
        return scoreDelta

      return left.address.localeCompare(right.address)
    })
    .map(candidate => candidate.address)
}

function getLanIpv4Addresses(): string[] {
  const candidates = Object.entries(networkInterfaces())
    .flatMap(([interfaceName, items]) => (items ?? []).map(item => ({ interfaceName, item })))
    .filter((entry): entry is { interfaceName: string, item: NonNullable<typeof entry.item> } => !!entry.item)
    .filter(entry => entry.item.family === 'IPv4' && !entry.item.internal)
    .map(entry => ({
      address: entry.item.address.trim(),
      interfaceName: entry.interfaceName,
    }))

  return getPreferredLanAddresses(candidates)
}

function sanitizeUrl(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  if (!normalized)
    return undefined

  try {
    return new URL(normalized).toString()
  }
  catch {
    return undefined
  }
}

function readPublicEndpoints(): { frontendUrl?: string, gatewayUrl?: string } {
  const publicFrontendUrl = sanitizeUrl(process.env.AIRI_VISUAL_CHAT_PUBLIC_FRONTEND_URL)
  const publicGatewayUrl = sanitizeUrl(process.env.AIRI_VISUAL_CHAT_PUBLIC_GATEWAY_URL)
  if (publicFrontendUrl || publicGatewayUrl) {
    return {
      frontendUrl: publicFrontendUrl,
      gatewayUrl: publicGatewayUrl,
    }
  }

  const endpointsFile = process.env.AIRI_VISUAL_CHAT_PUBLIC_ENDPOINTS_FILE?.trim() || DEFAULT_PUBLIC_ENDPOINTS_FILE
  if (!existsSync(endpointsFile))
    return {}

  try {
    const raw = JSON.parse(readFileSync(endpointsFile, 'utf8')) as {
      frontendUrl?: string
      gatewayUrl?: string
    }

    return {
      frontendUrl: sanitizeUrl(raw.frontendUrl),
      gatewayUrl: sanitizeUrl(raw.gatewayUrl),
    }
  }
  catch {
    return {}
  }
}

export function createDiagnosticRoutes(store: SessionStore, realtimeManager?: { getStats: (sessionId: string) => unknown }) {
  const router = createRouter()

  router.get('/api/diagnostics', defineEventHandler(async (event) => {
    requireGatewayAccess(event)
    const workerUrl = gatewayEnv.workerUrl
    let workerStatus = 'unknown'

    try {
      const res = await fetch(`${workerUrl}/health`)
      if (res.ok) {
        const data = await res.json() as Record<string, unknown>
        workerStatus = String(data.status ?? 'ok')
      }
    }
    catch {
      workerStatus = 'unreachable'
    }

    let lanAddresses: string[] = []
    try {
      lanAddresses = getLanIpv4Addresses()
    }
    catch {
      // never block diagnostics
    }

    let publicEndpoints: { frontendUrl?: string, gatewayUrl?: string } = {}
    try {
      publicEndpoints = readPublicEndpoints()
    }
    catch {
      // never block diagnostics
    }

    let machineHostname = ''
    try {
      machineHostname = hostname()
    }
    catch {
      // never block diagnostics
    }

    let sessionStats: Record<string, unknown> = {}
    try {
      if (realtimeManager) {
        const all = typeof store.getAll === 'function' ? store.getAll() : []
        for (const orchestrator of all) {
          const sid = orchestrator?.sessionId
          if (!sid)
            continue
          const stats = realtimeManager.getStats(sid)
          if (stats)
            sessionStats[sid] = stats
        }
      }
    }
    catch {
      sessionStats = {}
    }

    let activeSessionCount = 0
    try {
      activeSessionCount = store.size ?? 0
    }
    catch {
      // never block diagnostics
    }

    return {
      activeSessions: activeSessionCount,
      workerStatus,
      uptimeMs: Date.now() - startedAt,
      livekitUrl: gatewayEnv.livekitUrl,
      workerUrl: gatewayEnv.workerUrl,
      lanAddresses,
      preferredLanAddress: lanAddresses[0],
      hostname: machineHostname,
      publicFrontendUrl: publicEndpoints.frontendUrl,
      publicGatewayUrl: publicEndpoints.gatewayUrl,
      sessionPipelineStats: sessionStats,
    }
  }))

  return router
}

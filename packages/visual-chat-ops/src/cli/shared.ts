import process from 'node:process'

import { networkInterfaces } from 'node:os'

export interface CheckResult {
  name: string
  ok: boolean
  detail: string
  required: boolean
}

export const DEFAULT_OLLAMA_BASE_URL = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434'
export const DEFAULT_OLLAMA_MODEL = 'openbmb/minicpm-v4.5:latest'
export const DEFAULT_GATEWAY_PORT = Number(process.env.VISUAL_CHAT_PORT || 6200)
export const DEFAULT_WORKER_PORT = Number(process.env.WORKER_PORT || 6201)
export const DEFAULT_FRONTEND_CANDIDATES = [
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:4173',
  'http://localhost:4173',
]

const TRAILING_SLASH_PATTERN = /\/$/
const IPV4_SEGMENT_PATTERN = /^\d{1,3}$/
const VIRTUAL_INTERFACE_PATTERN = /hyper-v|wsl|vethernet|vmware|virtualbox|docker|podman|zerotier|tailscale|clash|tun|tap|vpn|loopback|bluetooth|hamachi/i
const WIFI_INTERFACE_PATTERN = /wi-?fi|wlan|wireless/i
const ETHERNET_INTERFACE_PATTERN = /ethernet|\u4EE5\u592A\u7F51|^en\d|^eth\d/i

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function normalizeBaseUrl(value: string): string {
  return value.replace(TRAILING_SLASH_PATTERN, '')
}

export function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase()
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1'
}

export function rewriteUrlHost(baseUrl: string, host: string): string {
  const url = new URL(baseUrl)
  url.hostname = host
  return url.toString()
}

export function buildSettingsUrl(frontendBaseUrl: string): string {
  return new URL('/settings/modules/visual-chat', `${normalizeBaseUrl(frontendBaseUrl)}/`).toString()
}

export function buildPhoneEntryUrl(frontendBaseUrl: string, gatewayBaseUrl: string): string {
  const url = new URL('/visual-chat/phone', `${normalizeBaseUrl(frontendBaseUrl)}/`)
  url.searchParams.set('gateway', normalizeBaseUrl(gatewayBaseUrl))
  return url.toString()
}

export function getLanIpv4Addresses(): string[] {
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

  function scoreCandidate(candidate: { address: string, interfaceName?: string }): number {
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

  const candidates: Array<{ address: string, interfaceName?: string }> = []
  for (const [interfaceName, entries] of Object.entries(networkInterfaces())) {
    for (const entry of (entries ?? [])) {
      const networkEntry = entry as {
        family?: string | number
        internal?: boolean
        address?: string
      }
      const family = typeof networkEntry.family === 'string'
        ? networkEntry.family
        : networkEntry.family === 4 ? 'IPv4' : 'IPv6'
      if (networkEntry.internal || family !== 'IPv4' || !networkEntry.address)
        continue

      candidates.push({
        address: networkEntry.address.trim(),
        interfaceName,
      })
    }
  }

  const deduped = new Map<string, { address: string, interfaceName?: string }>()
  for (const candidate of candidates) {
    const score = scoreCandidate(candidate)
    if (!Number.isFinite(score))
      continue

    const existing = deduped.get(candidate.address)
    if (!existing || scoreCandidate(existing) < score)
      deduped.set(candidate.address, candidate)
  }

  return [...deduped.values()]
    .sort((left, right) => {
      const scoreDelta = scoreCandidate(right) - scoreCandidate(left)
      if (scoreDelta !== 0)
        return scoreDelta

      return left.address.localeCompare(right.address)
    })
    .map(candidate => candidate.address)
}

export async function isUrlReachable(url: string, timeoutMs: number = 1500): Promise<boolean> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    })

    return response.status < 500
  }
  catch {
    return false
  }
}

export async function checkOllamaHealth(
  baseUrl: string = DEFAULT_OLLAMA_BASE_URL,
): Promise<CheckResult> {
  try {
    const response = await fetch(`${normalizeBaseUrl(baseUrl)}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    })

    if (!response.ok)
      return { name: 'Ollama', ok: false, detail: `unhealthy (HTTP ${response.status}) at ${baseUrl}`, required: true }

    return {
      name: 'Ollama',
      ok: true,
      detail: `serving at ${baseUrl}`,
      required: true,
    }
  }
  catch {
    return {
      name: 'Ollama',
      ok: false,
      detail: `not reachable at ${baseUrl} - run \`ollama serve\` or \`pnpm -F @proj-airi/visual-chat-ops setup-engine\` first`,
      required: true,
    }
  }
}

export async function checkOllamaModel(
  baseUrl: string = DEFAULT_OLLAMA_BASE_URL,
  model: string = DEFAULT_OLLAMA_MODEL,
): Promise<CheckResult> {
  try {
    const response = await fetch(`${normalizeBaseUrl(baseUrl)}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok)
      return { name: 'Ollama model', ok: false, detail: `cannot read installed models (HTTP ${response.status})`, required: true }

    const data = await response.json() as { models?: Array<{ name?: string }> }
    const installed = data.models?.map(item => item.name).filter(Boolean) as string[] | undefined
    if (!installed?.includes(model)) {
      return {
        name: 'Ollama model',
        ok: false,
        detail: `${model} is not installed - run \`pnpm -F @proj-airi/visual-chat-ops pull-models --model ${model}\``,
        required: true,
      }
    }

    return {
      name: 'Ollama model',
      ok: true,
      detail: `${model} is installed`,
      required: true,
    }
  }
  catch {
    return {
      name: 'Ollama model',
      ok: false,
      detail: 'cannot query installed models',
      required: true,
    }
  }
}

export function buildPhoneCaptureWarnings(frontendBaseUrl: string, gatewayBaseUrl: string): string[] {
  try {
    const frontendUrl = new URL(frontendBaseUrl)
    const gatewayUrl = new URL(gatewayBaseUrl)
    const warnings: string[] = []

    if (!isLoopbackHost(frontendUrl.hostname) && frontendUrl.protocol !== 'https:')
      warnings.push('Phone camera capture usually requires an HTTPS frontend origin on remote devices.')

    if (frontendUrl.protocol === 'https:' && gatewayUrl.protocol !== 'https:')
      warnings.push('An HTTPS phone page cannot reliably talk to an HTTP/WS gateway because browsers block mixed content. Expose the gateway through the same HTTPS origin or via HTTPS/WSS.')

    return warnings
  }
  catch {
    return []
  }
}

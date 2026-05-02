import type { Buffer } from 'node:buffer'

import process from 'node:process'

import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { getVisualChatDir } from '@proj-airi/visual-chat-shared'

import { ensureCloudflaredBinary } from './share.js'

const TUNNEL_CONFIG_FILE = process.env.AIRI_VISUAL_CHAT_TUNNEL_CONFIG_FILE?.trim()
  || join(getVisualChatDir('config'), 'tunnel.json')
const DEFAULT_ENDPOINTS_FILE = process.env.AIRI_VISUAL_CHAT_PUBLIC_ENDPOINTS_FILE?.trim()
  || join(getVisualChatDir('config'), 'public-endpoints.json')
const TUNNEL_RUN_TIMEOUT_MS = 45_000
const TUNNEL_NAME_FRONTEND = 'airi-visual-chat-frontend'
const TUNNEL_NAME_GATEWAY = 'airi-visual-chat-gateway'
const TUNNEL_ID_PATTERN = /([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i
const CREATED_TUNNEL_ID_PATTERN = /Created tunnel\s+\S+\s+with id\s+([a-f0-9-]+)/i

interface TunnelConfig {
  frontendTunnelId: string
  frontendTunnelName: string
  frontendPublicUrl: string
  gatewayTunnelId: string
  gatewayTunnelName: string
  gatewayPublicUrl: string
  createdAt: string
}

interface TunnelInfo {
  id: string
  name: string
}

function loadTunnelConfig(): TunnelConfig | null {
  if (!existsSync(TUNNEL_CONFIG_FILE))
    return null
  try {
    return JSON.parse(readFileSync(TUNNEL_CONFIG_FILE, 'utf8')) as TunnelConfig
  }
  catch {
    return null
  }
}

function saveTunnelConfig(config: TunnelConfig): void {
  mkdirSync(dirname(TUNNEL_CONFIG_FILE), { recursive: true })
  writeFileSync(TUNNEL_CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
}

function writePublicEndpointsFile(frontendUrl: string, gatewayUrl: string): void {
  mkdirSync(dirname(DEFAULT_ENDPOINTS_FILE), { recursive: true })
  writeFileSync(DEFAULT_ENDPOINTS_FILE, `${JSON.stringify({
    frontendUrl,
    gatewayUrl,
    source: 'cloudflared-named-tunnel',
    updatedAt: new Date().toISOString(),
  }, null, 2)}\n`, 'utf8')
}

function runSync(binary: string, args: string[]): string {
  return execFileSync(binary, args, { encoding: 'utf8', timeout: 30_000 }).trim()
}

async function isLoggedIn(binary: string): Promise<boolean> {
  try {
    execFileSync(binary, ['tunnel', 'list', '--output', 'json'], {
      encoding: 'utf8',
      timeout: 15_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return true
  }
  catch {
    return false
  }
}

async function login(binary: string): Promise<void> {
  console.info('\n=== Cloudflare Login ===')
  console.info('A browser window will open. Please log in and authorize cloudflared.\n')

  const exitCode = await new Promise<number>((resolve) => {
    const child = spawn(binary, ['login'], {
      stdio: 'inherit',
    })
    child.once('error', () => resolve(1))
    child.once('exit', code => resolve(code ?? 1))
  })

  if (exitCode !== 0)
    throw new Error('cloudflared login failed. Please try again.')

  console.info('Login successful.\n')
}

function listTunnels(binary: string): TunnelInfo[] {
  try {
    const output = execFileSync(binary, ['tunnel', 'list', '--output', 'json'], {
      encoding: 'utf8',
      timeout: 15_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const tunnels = JSON.parse(output) as Array<{ id: string, name: string, deleted_at?: string }>
    return tunnels
      .filter(t => !t.deleted_at)
      .map(t => ({ id: t.id, name: t.name }))
  }
  catch {
    return []
  }
}

function findTunnel(binary: string, name: string): TunnelInfo | null {
  const tunnels = listTunnels(binary)
  return tunnels.find(t => t.name === name) ?? null
}

function createTunnel(binary: string, name: string): TunnelInfo {
  console.info(`Creating tunnel "${name}"...`)
  const output = runSync(binary, ['tunnel', 'create', name])
  const idMatch = output.match(CREATED_TUNNEL_ID_PATTERN)
    || output.match(TUNNEL_ID_PATTERN)

  if (!idMatch)
    throw new Error(`Failed to parse tunnel ID from output:\n${output}`)

  const id = idMatch[1]!
  console.info(`  Tunnel "${name}" created with ID: ${id}`)
  return { id, name }
}

function ensureTunnel(binary: string, name: string): TunnelInfo {
  const existing = findTunnel(binary, name)
  if (existing) {
    console.info(`Tunnel "${name}" already exists (ID: ${existing.id})`)
    return existing
  }
  return createTunnel(binary, name)
}

function buildTunnelPublicUrl(tunnelId: string): string {
  return `https://${tunnelId}.cfargotunnel.com`
}

interface RunningTunnel {
  name: string
  url: string
  close: () => void
}

async function runNamedTunnel(
  binary: string,
  tunnelName: string,
  localTarget: string,
): Promise<RunningTunnel> {
  return new Promise((resolve, reject) => {
    let settled = false
    let recentOutput = ''

    const child = spawn(binary, [
      'tunnel',
      'run',
      '--url',
      localTarget,
      '--protocol',
      'http2',
      tunnelName,
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true
        resolve({
          name: tunnelName,
          url: '',
          close: () => child.kill(),
        })
      }
    }, TUNNEL_RUN_TIMEOUT_MS)

    function handleChunk(chunk: Buffer | string) {
      const text = chunk.toString()
      recentOutput = `${recentOutput}${text}`.slice(-4000)

      if (!settled && (text.includes('Registered tunnel connection') || text.includes('Connection registered'))) {
        settled = true
        clearTimeout(timeout)
        resolve({
          name: tunnelName,
          url: '',
          close: () => child.kill(),
        })
      }
    }

    child.stdout?.on('data', handleChunk)
    child.stderr?.on('data', handleChunk)
    child.once('error', (err) => {
      if (!settled) {
        settled = true
        clearTimeout(timeout)
        reject(new Error(`Tunnel "${tunnelName}" failed: ${err.message}`))
      }
    })
    child.once('exit', (code, signal) => {
      if (!settled) {
        settled = true
        clearTimeout(timeout)
        const detail = signal ? `signal ${signal}` : `code ${code ?? 1}`
        reject(new Error(`Tunnel "${tunnelName}" exited before ready (${detail}).\nLast output:\n${recentOutput.slice(-500)}`))
      }
    })
  })
}

export async function setupTunnel(): Promise<TunnelConfig> {
  const existing = loadTunnelConfig()
  if (existing) {
    console.info('Named tunnel configuration already exists:')
    console.info(`  Frontend: ${existing.frontendPublicUrl}`)
    console.info(`  Gateway:  ${existing.gatewayPublicUrl}`)
    console.info(`  Config:   ${TUNNEL_CONFIG_FILE}`)
    console.info('\nTo recreate, delete .visual-chat-tunnel.json and run again.')
    return existing
  }

  const binary = await ensureCloudflaredBinary()

  if (!await isLoggedIn(binary))
    await login(binary)

  const frontendTunnel = ensureTunnel(binary, TUNNEL_NAME_FRONTEND)
  const gatewayTunnel = ensureTunnel(binary, TUNNEL_NAME_GATEWAY)

  const config: TunnelConfig = {
    frontendTunnelId: frontendTunnel.id,
    frontendTunnelName: frontendTunnel.name,
    frontendPublicUrl: buildTunnelPublicUrl(frontendTunnel.id),
    gatewayTunnelId: gatewayTunnel.id,
    gatewayTunnelName: gatewayTunnel.name,
    gatewayPublicUrl: buildTunnelPublicUrl(gatewayTunnel.id),
    createdAt: new Date().toISOString(),
  }

  saveTunnelConfig(config)

  console.info('\n=== Named Tunnels Created ===')
  console.info(`  Frontend URL: ${config.frontendPublicUrl}`)
  console.info(`  Gateway URL:  ${config.gatewayPublicUrl}`)
  console.info(`  Config saved: ${TUNNEL_CONFIG_FILE}`)
  console.info('\nThese URLs are permanent. Run "pnpm -F @proj-airi/visual-chat-ops share" to start the tunnels.')

  return config
}

export interface NamedTunnelPair {
  frontendUrl: string
  gatewayUrl: string
  close: () => void
}

export async function startNamedTunnels(options?: {
  frontendTarget?: string
  gatewayTarget?: string
}): Promise<NamedTunnelPair> {
  const config = loadTunnelConfig()
  if (!config)
    throw new Error('No named tunnel configuration found. Run setup-tunnel first.')

  const frontendTarget = options?.frontendTarget || 'http://127.0.0.1:5174'
  const gatewayTarget = options?.gatewayTarget || 'http://127.0.0.1:6200'
  const binary = await ensureCloudflaredBinary()

  console.info('Starting named tunnels...')
  console.info(`  Frontend: ${config.frontendTunnelName} → ${frontendTarget}`)
  console.info(`  Gateway:  ${config.gatewayTunnelName} → ${gatewayTarget}`)

  const frontendHandle = await runNamedTunnel(binary, config.frontendTunnelName, frontendTarget)
  let gatewayHandle: RunningTunnel

  try {
    gatewayHandle = await runNamedTunnel(binary, config.gatewayTunnelName, gatewayTarget)
  }
  catch (error) {
    frontendHandle.close()
    throw error
  }

  writePublicEndpointsFile(config.frontendPublicUrl, config.gatewayPublicUrl)

  console.info('\nNamed tunnels are running:')
  console.info(`  Frontend: ${config.frontendPublicUrl}`)
  console.info(`  Gateway:  ${config.gatewayPublicUrl}`)

  return {
    frontendUrl: config.frontendPublicUrl,
    gatewayUrl: config.gatewayPublicUrl,
    close() {
      frontendHandle.close()
      gatewayHandle.close()
    },
  }
}

export { loadTunnelConfig, TUNNEL_CONFIG_FILE }

function isDirectExecution(): boolean {
  const entryPath = process.argv[1]
  return !!entryPath && pathToFileURL(entryPath).href === import.meta.url
}

if (isDirectExecution()) {
  const command = process.argv[2]

  if (command === 'run') {
    startNamedTunnels().then((pair) => {
      process.on('SIGINT', () => {
        pair.close()
        process.exit(0)
      })
      process.on('SIGTERM', () => {
        pair.close()
        process.exit(0)
      })
    }).catch((error) => {
      console.error(error)
      process.exit(1)
    })
  }
  else {
    setupTunnel().catch((error) => {
      console.error(error)
      process.exit(1)
    })
  }
}

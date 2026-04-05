import type { ChildProcess } from 'node:child_process'

import process from 'node:process'

import { spawn } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  buildPhoneCaptureWarnings,
  buildPhoneEntryUrl,
  buildSettingsUrl,
  checkOllamaHealth,
  checkOllamaModel,
  DEFAULT_FRONTEND_CANDIDATES,
  DEFAULT_GATEWAY_PORT,
  DEFAULT_OLLAMA_BASE_URL,
  DEFAULT_OLLAMA_MODEL,
  DEFAULT_WORKER_PORT,
  getLanIpv4Addresses,
  isLoopbackHost,
  isUrlReachable,
  normalizeBaseUrl,
  rewriteUrlHost,
} from './shared'

interface ManagedService {
  name: string
  child: ChildProcess | null
  healthUrl: string
  reused: boolean
}

interface WorkerHealthResponse {
  ok?: boolean
  model?: string
  backendKind?: string
  upstreamBaseUrl?: string
}

interface FrontendHint {
  desktopUrl: string
  phoneUrl?: string
  warnings: string[]
}

const STARTUP_TIMEOUT_MS = 20_000
const STARTUP_POLL_INTERVAL_MS = 500
const DEFAULT_FRONTEND_URL = process.env.AIRI_VISUAL_CHAT_FRONTEND_URL?.trim() || ''
const DEFAULT_AUTO_START_FRONTEND = (process.env.AIRI_VISUAL_CHAT_START_FRONTEND || 'auto').trim().toLowerCase()
const CURRENT_DIR = fileURLToPath(new URL('.', import.meta.url))

type SpawnCommand = [command: string, args: string[]]

function packageManagerCommand(args: string[]): SpawnCommand {
  if (process.platform === 'win32') {
    const command = process.env.ComSpec || 'cmd.exe'
    return [command, ['/d', '/s', '/c', ['pnpm', ...args].join(' ')]]
  }

  return ['pnpm', args]
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function isServiceHealthy(healthUrl: string): Promise<boolean> {
  try {
    const response = await fetch(healthUrl, {
      signal: AbortSignal.timeout(1500),
    })

    return response.ok
  }
  catch {
    return false
  }
}

async function waitForServiceHealth(name: string, healthUrl: string, timeoutMs: number = STARTUP_TIMEOUT_MS): Promise<void> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (await isServiceHealthy(healthUrl))
      return
    await sleep(STARTUP_POLL_INTERVAL_MS)
  }

  throw new Error(`${name} did not become healthy within ${Math.round(timeoutMs / 1000)}s (${healthUrl})`)
}

async function readWorkerHealth(healthUrl: string): Promise<WorkerHealthResponse | null> {
  try {
    const response = await fetch(healthUrl, {
      signal: AbortSignal.timeout(3000),
    })

    if (!response.ok)
      return null

    return response.json() as Promise<WorkerHealthResponse>
  }
  catch {
    return null
  }
}

function attachUnexpectedExitHandler(
  service: ManagedService,
  shutdown: (code: number) => Promise<void>,
  isShuttingDown: () => boolean,
) {
  service.child?.once('exit', (code, signal) => {
    if (isShuttingDown())
      return

    const detail = signal ? `signal ${signal}` : `code ${code ?? 0}`
    console.error(`[fatal] ${service.name} exited unexpectedly with ${detail}.`)
    void shutdown(code ?? 1)
  })
}

function spawnService(cwd: string, env: NodeJS.ProcessEnv, packageManagerArgs: string[]): ChildProcess {
  const [command, args] = packageManagerCommand(packageManagerArgs)

  return spawn(command, args, {
    cwd,
    env,
    stdio: 'inherit',
  })
}

async function runWorkspaceCommand(options: {
  cwd: string
  env: NodeJS.ProcessEnv
  packageManagerArgs: string[]
  label: string
}): Promise<void> {
  const [command, args] = packageManagerCommand(options.packageManagerArgs)

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: 'inherit',
    })

    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${options.label} failed with ${signal ? `signal ${signal}` : `code ${code ?? 1}`}`))
    })
  })
}

async function ensureService(options: {
  name: string
  cwd: string
  healthUrl: string
  env: NodeJS.ProcessEnv
  packageManagerArgs: string[]
}): Promise<ManagedService> {
  if (await isServiceHealthy(options.healthUrl)) {
    console.info(`[reuse] ${options.name} is already healthy at ${options.healthUrl}`)
    return {
      name: options.name,
      child: null,
      healthUrl: options.healthUrl,
      reused: true,
    }
  }

  console.info(`[start] ${options.name}...`)
  const child = spawnService(options.cwd, options.env, options.packageManagerArgs)
  await waitForServiceHealth(options.name, options.healthUrl)

  console.info(`[ready] ${options.name} is healthy at ${options.healthUrl}`)
  return {
    name: options.name,
    child,
    healthUrl: options.healthUrl,
    reused: false,
  }
}

async function resolveFrontendHints(gatewayBaseUrl: string): Promise<{
  reachableFrontendUrl: string | null
  checkedFrontendUrls: string[]
  hints: FrontendHint[]
}> {
  const checkedFrontendUrls: string[] = []
  const candidateBaseUrls = DEFAULT_FRONTEND_URL
    ? [DEFAULT_FRONTEND_URL]
    : DEFAULT_FRONTEND_CANDIDATES

  let reachableFrontendUrl: string | null = null
  for (const candidate of candidateBaseUrls) {
    checkedFrontendUrls.push(candidate)
    if (await isUrlReachable(candidate, 1500)) {
      reachableFrontendUrl = candidate
      break
    }
  }

  const baseUrl = (reachableFrontendUrl ?? DEFAULT_FRONTEND_URL) || null
  if (!baseUrl)
    return { reachableFrontendUrl, checkedFrontendUrls, hints: [] }

  const lanHosts = getLanIpv4Addresses()
  const frontendHosts = new Set<string>()
  const frontendUrl = new URL(baseUrl)

  frontendHosts.add(frontendUrl.hostname)
  if (isLoopbackHost(frontendUrl.hostname)) {
    for (const host of lanHosts)
      frontendHosts.add(host)
  }

  const hints: FrontendHint[] = []
  for (const host of frontendHosts) {
    const rewrittenFrontendUrl = rewriteUrlHost(baseUrl, host)
    const rewrittenGatewayUrl = rewriteUrlHost(gatewayBaseUrl, host)
    const frontendReachable = await isUrlReachable(rewrittenFrontendUrl, 1500)
    if (!frontendReachable)
      continue

    const gatewayReachable = await isUrlReachable(`${normalizeBaseUrl(rewrittenGatewayUrl)}/health`, 1500)
    hints.push({
      desktopUrl: buildSettingsUrl(rewrittenFrontendUrl),
      phoneUrl: isLoopbackHost(host) || !gatewayReachable
        ? undefined
        : buildPhoneEntryUrl(rewrittenFrontendUrl, rewrittenGatewayUrl),
      warnings: buildPhoneCaptureWarnings(rewrittenFrontendUrl, rewrittenGatewayUrl),
    })
  }

  return {
    reachableFrontendUrl,
    checkedFrontendUrls,
    hints,
  }
}

export async function start() {
  console.info('=== Starting AIRI Visual Chat Services ===\n')

  const gatewayPort = Number(process.env.VISUAL_CHAT_PORT || DEFAULT_GATEWAY_PORT)
  const workerPort = Number(process.env.WORKER_PORT || DEFAULT_WORKER_PORT)
  const ollamaBaseUrl = normalizeBaseUrl(process.env.OLLAMA_HOST || DEFAULT_OLLAMA_BASE_URL)
  const requestedOllamaModel = (process.env.OLLAMA_MODEL || DEFAULT_OLLAMA_MODEL).trim()
  const ollamaModel = DEFAULT_OLLAMA_MODEL
  const gatewayBaseUrl = `http://127.0.0.1:${gatewayPort}`
  const workerBaseUrl = `http://127.0.0.1:${workerPort}`
  const workerHealthUrl = `${workerBaseUrl}/health`
  const gatewayHealthUrl = `${gatewayBaseUrl}/health`

  console.info('[env] Fixed pipeline:    ollama-lite')
  console.info(`[env] Ollama backend:    ${ollamaBaseUrl}`)
  console.info(`[env] Ollama model:      ${ollamaModel}`)
  console.info(`[env] AIRI gateway:      ${gatewayBaseUrl}`)
  console.info(`[env] AIRI worker:       ${workerBaseUrl}`)
  console.info()

  if (requestedOllamaModel !== DEFAULT_OLLAMA_MODEL) {
    console.warn(`[warn] Ignoring unsupported OLLAMA_MODEL=${requestedOllamaModel}.`)
    console.warn(`[warn] AIRI Visual Chat is pinned to ${DEFAULT_OLLAMA_MODEL}.`)
    console.info()
  }

  const [ollamaHealth, ollamaModelCheck] = await Promise.all([
    checkOllamaHealth(ollamaBaseUrl),
    checkOllamaModel(ollamaBaseUrl, ollamaModel),
  ])

  console.info(`[check] ${ollamaHealth.name}: ${ollamaHealth.detail}`)
  console.info(`[check] ${ollamaModelCheck.name}: ${ollamaModelCheck.detail}`)
  console.info()

  if (!ollamaHealth.ok || !ollamaModelCheck.ok) {
    console.error('The fixed Ollama Visual Chat backend is not ready, so startup is stopping here.')
    console.error('Run:')
    console.error('  1. `pnpm -F @proj-airi/visual-chat-ops setup-engine`')
    console.error(`  2. \`pnpm -F @proj-airi/visual-chat-ops pull-models --model ${DEFAULT_OLLAMA_MODEL}\``)
    console.error('  3. `pnpm -F @proj-airi/visual-chat-ops start:local`')
    process.exitCode = 1
    return
  }

  const rootDir = resolve(CURRENT_DIR, '..', '..', '..', '..')
  const frontendDir = join(rootDir, 'apps', 'stage-web')
  const gatewayDir = join(rootDir, 'services', 'visual-chat-gateway')
  const workerDir = join(rootDir, 'services', 'visual-chat-worker-minicpmo')
  const managedServices: ManagedService[] = []
  let shuttingDown = false

  const shutdown = async (exitCode: number) => {
    if (shuttingDown)
      return

    shuttingDown = true
    console.info('\nStopping AIRI visual chat services...')

    for (const service of managedServices) {
      if (!service.reused && service.child && !service.child.killed)
        service.child.kill()
    }

    process.exit(exitCode)
  }

  process.on('SIGINT', () => void shutdown(0))
  process.on('SIGTERM', () => void shutdown(0))

  const worker = await ensureService({
    name: 'AIRI worker bridge',
    cwd: workerDir,
    healthUrl: workerHealthUrl,
    env: {
      ...process.env,
      WORKER_HOST: process.env.WORKER_HOST || '127.0.0.1',
      WORKER_PORT: String(workerPort),
      GATEWAY_URL: gatewayBaseUrl,
      VISUAL_CHAT_GATEWAY_URL: gatewayBaseUrl,
      OLLAMA_HOST: ollamaBaseUrl,
      OLLAMA_MODEL: ollamaModel,
    },
    packageManagerArgs: ['exec', 'tsx', 'src/index.ts'],
  })
  managedServices.push(worker)
  attachUnexpectedExitHandler(worker, shutdown, () => shuttingDown)

  const workerHealth = await readWorkerHealth(workerHealthUrl)
  if (workerHealth?.backendKind && workerHealth.backendKind !== 'ollama')
    console.warn(`[warn] Existing worker bridge reports backend kind ${workerHealth.backendKind}, not ollama.`)
  if (workerHealth?.upstreamBaseUrl && normalizeBaseUrl(workerHealth.upstreamBaseUrl) !== ollamaBaseUrl)
    console.warn(`[warn] Existing worker bridge points at ${workerHealth.upstreamBaseUrl}, not ${ollamaBaseUrl}.`)
  if (workerHealth?.model && workerHealth.model !== ollamaModel)
    console.warn(`[warn] Existing worker bridge reports model ${workerHealth.model}, not ${ollamaModel}.`)

  const gateway = await ensureService({
    name: 'AIRI gateway',
    cwd: gatewayDir,
    healthUrl: gatewayHealthUrl,
    env: {
      ...process.env,
      VISUAL_CHAT_HOST: process.env.VISUAL_CHAT_HOST || '0.0.0.0',
      VISUAL_CHAT_PORT: String(gatewayPort),
      WORKER_URL: workerBaseUrl,
    },
    packageManagerArgs: ['exec', 'tsx', 'src/index.ts'],
  })
  managedServices.push(gateway)
  attachUnexpectedExitHandler(gateway, shutdown, () => shuttingDown)

  console.info()
  console.info('AIRI visual chat bridge is ready.')
  console.info()
  console.info('Service endpoints:')
  console.info(`  Gateway health: ${gatewayHealthUrl}`)
  console.info(`  Worker health:  ${workerHealthUrl}`)
  console.info('  Worker pipeline: fixed ollama-lite')
  console.info(`  Upstream model: ${ollamaModel}`)
  console.info(`  Upstream URL:   ${ollamaBaseUrl}`)
  console.info()

  let frontendHints = await resolveFrontendHints(gatewayBaseUrl)
  const shouldAutoStartFrontend = DEFAULT_AUTO_START_FRONTEND !== 'false' && DEFAULT_AUTO_START_FRONTEND !== '0'
  const hasPhoneReachableFrontend = frontendHints.hints.some(hint => !!hint.phoneUrl)
  if (!DEFAULT_FRONTEND_URL && !hasPhoneReachableFrontend && shouldAutoStartFrontend) {
    console.info('[build] AIRI web frontend...')
    await runWorkspaceCommand({
      cwd: frontendDir,
      env: {
        ...process.env,
      },
      packageManagerArgs: ['build'],
      label: 'AIRI web frontend build',
    })

    const frontend = await ensureService({
      name: 'AIRI web frontend preview',
      cwd: frontendDir,
      healthUrl: DEFAULT_FRONTEND_CANDIDATES[0],
      env: {
        ...process.env,
      },
      packageManagerArgs: ['exec', 'vite', 'preview', '--host', '0.0.0.0', '--port', '5173', '--strictPort'],
    })
    managedServices.push(frontend)
    attachUnexpectedExitHandler(frontend, shutdown, () => shuttingDown)
    frontendHints = await resolveFrontendHints(gatewayBaseUrl)
  }

  if (frontendHints.hints.length > 0) {
    console.info('Frontend entry hints:')
    for (const hint of frontendHints.hints) {
      console.info(`  Desktop settings: ${hint.desktopUrl}`)
      if (hint.phoneUrl)
        console.info(`  Phone page:       ${hint.phoneUrl}`)
      for (const warning of hint.warnings)
        console.warn(`  Warning: ${warning}`)
    }
    console.info()
  }
  else {
    console.warn('No AIRI web frontend was detected automatically.')
    if (frontendHints.checkedFrontendUrls.length)
      console.warn(`Checked: ${frontendHints.checkedFrontendUrls.join(', ')}`)
    console.warn('Start `apps/stage-web` separately, or set `AIRI_VISUAL_CHAT_FRONTEND_URL` before running this command to print phone entry URLs.')
    console.info()
  }

  console.info('Suggested flow:')
  console.info('  1. Open the desktop Visual Chat settings page and create or join a session.')
  console.info('  2. Pick one input mode: phone camera, desktop camera, or desktop screen capture.')
  console.info('  3. Use typed prompts; all turns go through the same gateway -> worker -> chat pipeline.')
  console.info()

  await new Promise(() => {})
}

function isDirectExecution(): boolean {
  const entryPath = process.argv[1]
  return !!entryPath && pathToFileURL(entryPath).href === import.meta.url
}

if (isDirectExecution()) {
  void start()
}

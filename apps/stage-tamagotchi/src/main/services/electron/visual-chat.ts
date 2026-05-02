import type { ChildProcess } from 'node:child_process'

import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { VisualChatDesktopSetupStatus, VisualChatDesktopSetupStep } from '@proj-airi/visual-chat-shared/electron'
import type { BrowserWindow } from 'electron'

import process from 'node:process'

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineInvokeHandler } from '@moeru/eventa'
import { createTunnelPair, loadTunnelConfig as loadManagedTunnelConfig, pullModels, setupEngine, startNamedTunnels as startManagedNamedTunnels } from '@proj-airi/visual-chat-ops'
import {
  electronVisualChatGetSetupStatus,
  electronVisualChatRunSetup,

} from '@proj-airi/visual-chat-shared/electron'
import { app } from 'electron'

const FIXED_MODEL = 'openbmb/minicpm-v4.5:latest'
const GATEWAY_URL = 'http://127.0.0.1:6200'
const WORKER_URL = 'http://127.0.0.1:6201'
const FRONTEND_URL = 'http://127.0.0.1:5174'
const LOG_LIMIT = 160
const STARTUP_TIMEOUT_MS = 20_000
const STARTUP_POLL_INTERVAL_MS = 500
const WORKSPACE_MARKER = 'pnpm-workspace.yaml'

const CURRENT_DIR = dirname(fileURLToPath(import.meta.url))

interface TunnelHandle { close: () => void }

type RuntimeMode
  = | { kind: 'workspace', workspaceRoot: string }
    | { kind: 'packaged', gatewayEntry: string, workerEntry: string }

const state: {
  status: VisualChatDesktopSetupStatus
  runningPromise: Promise<VisualChatDesktopSetupStatus> | null
  gatewayChild: ChildProcess | null
  workerChild: ChildProcess | null
  tunnelHandle: TunnelHandle | null
} = {
  status: {
    available: false,
    state: 'idle',
    fixedModel: FIXED_MODEL,
    gatewayUrl: GATEWAY_URL,
    workerUrl: WORKER_URL,
    steps: createDefaultSteps(),
    logs: [],
    updatedAt: Date.now(),
  },
  runningPromise: null,
  gatewayChild: null,
  workerChild: null,
  tunnelHandle: null,
}

function createDefaultSteps(): VisualChatDesktopSetupStep[] {
  return [
    { id: 'engine', label: 'Inference engine', status: 'pending', detail: 'Waiting for detection.' },
    { id: 'model', label: 'Fixed model', status: 'pending', detail: FIXED_MODEL },
    { id: 'gateway', label: 'Gateway service', status: 'pending', detail: GATEWAY_URL },
    { id: 'worker', label: 'Worker service', status: 'pending', detail: WORKER_URL },
    { id: 'tunnel', label: 'Public tunnel', status: 'pending', detail: 'Cloudflare quick tunnel for remote phone access' },
  ]
}

function cloneStatus(): VisualChatDesktopSetupStatus {
  return {
    ...state.status,
    steps: state.status.steps.map(step => ({ ...step })),
    logs: [...state.status.logs],
  }
}

function updateStatus(patch: Partial<VisualChatDesktopSetupStatus>) {
  state.status = {
    ...state.status,
    ...patch,
    updatedAt: Date.now(),
  }
}

function updateStep(id: VisualChatDesktopSetupStep['id'], patch: Partial<VisualChatDesktopSetupStep>) {
  state.status = {
    ...state.status,
    steps: state.status.steps.map(step => step.id === id ? { ...step, ...patch } : step),
    updatedAt: Date.now(),
  }
}

function resetSteps() {
  updateStatus({ steps: createDefaultSteps(), error: undefined })
}

function appendLog(line: string) {
  const trimmed = line.trim()
  if (!trimmed)
    return

  updateStatus({
    logs: [...state.status.logs, trimmed].slice(-LOG_LIMIT),
  })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function packageManagerCommand(args: string[]): [command: string, commandArgs: string[]] {
  if (process.platform === 'win32') {
    const command = process.env.ComSpec || 'cmd.exe'
    return [command, ['/d', '/s', '/c', ['pnpm', ...args].join(' ')]]
  }

  return ['pnpm', args]
}

function findWorkspaceRoot(from: string): string | null {
  let current = resolve(from)

  while (true) {
    if (existsSync(join(current, WORKSPACE_MARKER)))
      return current

    const parent = dirname(current)
    if (parent === current)
      return null
    current = parent
  }
}

function resolveWorkspaceRoot(): string | null {
  const candidates = [
    process.cwd(),
    CURRENT_DIR,
  ]

  for (const candidate of candidates) {
    const root = findWorkspaceRoot(candidate)
    if (root)
      return root
  }

  return null
}

function resolvePackagedServiceEntry(packageName: '@proj-airi/visual-chat-gateway' | '@proj-airi/visual-chat-worker-minicpmo'): string | null {
  const packagePath = packageName.split('/')
  const candidates = [
    join(app.getAppPath(), 'node_modules', ...packagePath, 'dist', 'index.mjs'),
    join(process.resourcesPath, 'app.asar', 'node_modules', ...packagePath, 'dist', 'index.mjs'),
    join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', ...packagePath, 'dist', 'index.mjs'),
  ]

  return candidates.find(candidate => existsSync(candidate)) ?? null
}

function resolveRuntimeMode(): RuntimeMode | null {
  const workspaceRoot = resolveWorkspaceRoot()
  if (workspaceRoot)
    return { kind: 'workspace', workspaceRoot }

  const gatewayEntry = resolvePackagedServiceEntry('@proj-airi/visual-chat-gateway')
  const workerEntry = resolvePackagedServiceEntry('@proj-airi/visual-chat-worker-minicpmo')
  if (gatewayEntry && workerEntry)
    return { kind: 'packaged', gatewayEntry, workerEntry }

  return null
}

async function isUrlReachable(url: string, timeoutMs: number = 1500): Promise<boolean> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
    })
    return response.ok
  }
  catch {
    return false
  }
}

async function isOllamaServing(): Promise<boolean> {
  return isUrlReachable('http://127.0.0.1:11434/api/tags', 3000)
}

async function hasFixedModel(): Promise<boolean> {
  try {
    const response = await fetch('http://127.0.0.1:11434/api/tags', {
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok)
      return false

    const payload = await response.json() as { models?: Array<{ name?: string }> }
    return payload.models?.some(model => model.name === FIXED_MODEL) ?? false
  }
  catch {
    return false
  }
}

async function waitForHealth(name: string, healthUrl: string): Promise<void> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < STARTUP_TIMEOUT_MS) {
    if (await isUrlReachable(healthUrl))
      return
    await new Promise(resolve => setTimeout(resolve, STARTUP_POLL_INTERVAL_MS))
  }

  throw new Error(`${name} did not become healthy within ${Math.round(STARTUP_TIMEOUT_MS / 1000)}s`)
}

async function ensureManagedService(options: {
  id: 'gateway' | 'worker'
  label: string
  healthUrl: string
  runtimeMode: RuntimeMode
  packageFilter: string
  env?: NodeJS.ProcessEnv
}): Promise<void> {
  if (await isUrlReachable(options.healthUrl)) {
    updateStep(options.id, { status: 'done', detail: `${options.healthUrl} already healthy` })
    return
  }

  updateStep(options.id, { status: 'running', detail: `Starting ${options.label}...` })
  appendLog(`[start] ${options.label}`)

  const child = (() => {
    if (options.runtimeMode.kind === 'workspace') {
      const [command, commandArgs] = packageManagerCommand(['-F', options.packageFilter, 'dev'])
      return spawn(command, commandArgs, {
        cwd: options.runtimeMode.workspaceRoot,
        env: {
          ...process.env,
          ...options.env,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    }

    const entryPath = options.id === 'gateway'
      ? options.runtimeMode.gatewayEntry
      : options.runtimeMode.workerEntry
    return spawn(process.execPath, [entryPath], {
      cwd: dirname(entryPath),
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        ...options.env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  })()

  child.stdout?.setEncoding('utf-8')
  child.stderr?.setEncoding('utf-8')
  child.stdout?.on('data', chunk => appendLog(`[${options.label}] ${String(chunk)}`))
  child.stderr?.on('data', chunk => appendLog(`[${options.label}] ${String(chunk)}`))

  const childKey = options.id === 'gateway' ? 'gatewayChild' : 'workerChild'
  state[childKey] = child

  child.once('exit', (code, signal) => {
    const detail = signal ? `signal ${signal}` : `code ${code ?? 0}`
    appendLog(`[exit] ${options.label}: ${detail}`)
    if (state.status.state !== 'ready' && state.status.state !== 'idle') {
      updateStatus({
        state: 'error',
        error: `${options.label} exited unexpectedly with ${detail}`,
      })
      updateStep(options.id, { status: 'error', detail: `${options.label} exited unexpectedly with ${detail}` })
    }
  })

  await waitForHealth(options.label, options.healthUrl)
  updateStep(options.id, { status: 'done', detail: `${options.healthUrl} is healthy` })
}

async function startPackagedTunnel(): Promise<void> {
  updateStep('tunnel', { status: 'running', detail: 'Starting managed tunnels from packaged visual-chat runtime...' })

  const namedConfig = loadManagedTunnelConfig()
  const handle = namedConfig
    ? await startManagedNamedTunnels({
        frontendTarget: FRONTEND_URL,
        gatewayTarget: GATEWAY_URL,
      })
    : await createTunnelPair({
        frontendTarget: FRONTEND_URL,
        gatewayTarget: GATEWAY_URL,
      })

  state.tunnelHandle = handle
  updateStatus({
    tunnelFrontendUrl: handle.frontendUrl,
    tunnelGatewayUrl: handle.gatewayUrl,
  })
  updateStep('tunnel', {
    status: 'done',
    detail: `Frontend: ${handle.frontendUrl} | Gateway: ${handle.gatewayUrl}`,
  })
  appendLog(`[tunnel] Managed tunnel URLs ready: frontend=${handle.frontendUrl} gateway=${handle.gatewayUrl}`)
}

async function startTunnel(_runtimeMode: RuntimeMode): Promise<void> {
  if (state.tunnelHandle) {
    updateStep('tunnel', { status: 'done', detail: 'Tunnel already running.' })
    return
  }

  appendLog('[tunnel] Starting public tunnels for phone access...')

  try {
    await startPackagedTunnel()
  }
  catch (error) {
    const activeTunnelHandle = state.tunnelHandle as TunnelHandle | null
    activeTunnelHandle?.close()
    state.tunnelHandle = null
    const msg = errorMessage(error)
    appendLog(`[tunnel] Failed: ${msg}`)
    updateStep('tunnel', { status: 'error', detail: `${msg}. Phone access is LAN-only.` })
  }
}

async function refreshSetupStatusFromRuntime() {
  const runtimeMode = resolveRuntimeMode()
  const [engineReady, modelReady, gatewayReady, workerReady] = await Promise.all([
    isOllamaServing(),
    hasFixedModel(),
    isUrlReachable(`${GATEWAY_URL}/health`),
    isUrlReachable(`${WORKER_URL}/health`),
  ])

  updateStatus({
    available: !!runtimeMode,
    workspaceRoot: runtimeMode?.kind === 'workspace' ? runtimeMode.workspaceRoot : undefined,
  })

  updateStep('engine', {
    status: engineReady ? 'done' : 'pending',
    detail: engineReady ? 'Ollama is serving at http://127.0.0.1:11434' : 'Ollama is not serving yet.',
  })
  updateStep('model', {
    status: modelReady ? 'done' : 'pending',
    detail: modelReady ? `${FIXED_MODEL} is installed.` : `${FIXED_MODEL} is missing.`,
  })
  updateStep('gateway', {
    status: gatewayReady ? 'done' : 'pending',
    detail: gatewayReady ? `${GATEWAY_URL} is healthy.` : `${GATEWAY_URL} is not reachable.`,
  })
  updateStep('worker', {
    status: workerReady ? 'done' : 'pending',
    detail: workerReady ? `${WORKER_URL} is healthy.` : `${WORKER_URL} is not reachable.`,
  })

  const tunnelRunning = !!state.tunnelHandle
  const tunnelStep = state.status.steps.find(s => s.id === 'tunnel')
  if (tunnelStep && tunnelStep.status !== 'done' && tunnelStep.status !== 'running') {
    updateStep('tunnel', {
      status: tunnelRunning ? 'running' : 'pending',
      detail: tunnelRunning ? 'Tunnel process is active.' : 'Tunnel not started yet.',
    })
  }

  if (engineReady && modelReady && gatewayReady && workerReady) {
    updateStatus({
      state: 'ready',
      error: undefined,
    })
  }
  else if (state.status.state === 'idle' || state.status.state === 'ready') {
    updateStatus({
      state: 'checking',
      error: undefined,
    })
  }
}

async function runSetupPipeline(): Promise<VisualChatDesktopSetupStatus> {
  if (state.runningPromise)
    return state.runningPromise

  state.runningPromise = (async () => {
    resetSteps()
    appendLog('[setup] Visual Chat desktop setup started.')
    updateStatus({
      state: 'checking',
      error: undefined,
    })

    const runtimeMode = resolveRuntimeMode()
    if (!runtimeMode) {
      updateStatus({
        available: false,
        state: 'error',
        error: 'Cannot find either a development workspace root or a packaged visual-chat runtime.',
      })
      return cloneStatus()
    }

    updateStatus({
      available: true,
      workspaceRoot: runtimeMode.kind === 'workspace' ? runtimeMode.workspaceRoot : undefined,
    })

    const engineReady = await isOllamaServing()
    if (!engineReady) {
      updateStatus({ state: 'installing-engine' })
      updateStep('engine', { status: 'running', detail: 'Installing or starting Ollama...' })
      await setupEngine()
    }
    if (!await isOllamaServing())
      throw new Error('Ollama is still not serving after setup-engine completed.')
    updateStep('engine', { status: 'done', detail: 'Ollama is serving at http://127.0.0.1:11434' })

    const modelReady = await hasFixedModel()
    if (!modelReady) {
      updateStatus({ state: 'pulling-model' })
      updateStep('model', { status: 'running', detail: `Pulling ${FIXED_MODEL}...` })
      await pullModels({ model: FIXED_MODEL })
    }
    if (!await hasFixedModel())
      throw new Error(`${FIXED_MODEL} is still unavailable after pull-models completed.`)
    updateStep('model', { status: 'done', detail: `${FIXED_MODEL} is ready.` })

    updateStatus({ state: 'starting-services' })
    await ensureManagedService({
      id: 'worker',
      label: 'Visual Chat worker',
      healthUrl: `${WORKER_URL}/health`,
      runtimeMode,
      packageFilter: '@proj-airi/visual-chat-worker-minicpmo',
      env: {
        GATEWAY_URL,
        VISUAL_CHAT_GATEWAY_URL: GATEWAY_URL,
        WORKER_HOST: '127.0.0.1',
        WORKER_PORT: '6201',
      },
    })
    await ensureManagedService({
      id: 'gateway',
      label: 'Visual Chat gateway',
      healthUrl: `${GATEWAY_URL}/health`,
      runtimeMode,
      packageFilter: '@proj-airi/visual-chat-gateway',
      env: {
        VISUAL_CHAT_HOST: '127.0.0.1',
        VISUAL_CHAT_PORT: '6200',
        WORKER_URL,
      },
    })

    updateStatus({ state: 'starting-tunnel' })
    await startTunnel(runtimeMode)

    await refreshSetupStatusFromRuntime()
    updateStatus({
      state: 'ready',
      error: undefined,
    })
    appendLog('[setup] Visual Chat desktop setup finished.')
    return cloneStatus()
  })()
    .catch((error) => {
      appendLog(`[error] ${errorMessage(error)}`)
      updateStatus({
        state: 'error',
        error: errorMessage(error),
      })
      return cloneStatus()
    })
    .finally(() => {
      state.runningPromise = null
    })

  return state.runningPromise
}

export function createVisualChatDesktopService(params: { context: ReturnType<typeof createContext>['context'], window: BrowserWindow }) {
  void params.window

  defineInvokeHandler(params.context, electronVisualChatGetSetupStatus, async () => {
    await refreshSetupStatusFromRuntime()
    return cloneStatus()
  })

  defineInvokeHandler(params.context, electronVisualChatRunSetup, async (payload) => {
    void payload
    return runSetupPipeline()
  })
}

import type { ChildProcessWithoutNullStreams } from 'node:child_process'

import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { env, exit, kill as killProcess } from 'node:process'
import { fileURLToPath } from 'node:url'

import { desktopOverlayPollHeartbeatMarker } from '../src/shared/desktop-overlay-heartbeat'
import { selectDesktopOverlaySmokeCandidateId } from '../src/shared/desktop-overlay-live-window-smoke'

interface DebugTarget {
  id: string
  title: string
  type: string
  url: string
  webSocketDebuggerUrl?: string
}

interface McpResult {
  content?: unknown[]
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

interface McpApplyResult {
  started: Array<{ name: string }>
  failed: Array<{ name: string, error: string }>
  skipped: Array<{ name: string, reason: string }>
}

interface McpToolDescriptor {
  name: string
  serverName: string
  toolName: string
}

interface McpRuntimeStatus {
  servers: Array<{
    name: string
    state: 'running' | 'stopped' | 'error'
    lastError?: string
  }>
}

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repoDir = resolve(packageDir, '../..')
const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const reportDir = resolve(repoDir, '.temp', `desktop-overlay-live-window-smoke-${runId}`)
const userDataDir = resolve(reportDir, 'stage-user-data')
const mcpSessionRoot = resolve(reportDir, 'computer-use-session')
const stageLogPath = resolve(reportDir, 'stage-tamagotchi.log')
const mcpConfigPath = resolve(userDataDir, 'mcp.json')
const requiredWorkspaceBuildOutputs = [
  'packages/electron-screen-capture/dist/main.mjs',
  'packages/electron-vueuse/dist/main/index.mjs',
  'packages/server-runtime/dist/server.mjs',
]

const smokeHtml = `<!doctype html>
<html>
  <head>
    <title>AIRI Desktop Overlay Live Window Smoke</title>
    <style>
      body { font-family: sans-serif; padding: 48px; }
      button { font-size: 18px; padding: 12px 18px; }
    </style>
  </head>
  <body>
    <h1>AIRI Desktop Overlay Live Window Smoke</h1>
    <button id="airi-desktop-overlay-smoke-button">AIRI Desktop Overlay Smoke Button</button>
  </body>
</html>`

const smokeUrl = `data:text/html;charset=utf-8,${encodeURIComponent(smokeHtml)}`

function assert(condition: boolean, message: string): asserts condition {
  if (!condition)
    throw new Error(message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function findAvailablePort(): Promise<number> {
  return await new Promise((resolvePort, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => {
        if (typeof address === 'object' && address?.port) {
          resolvePort(address.port)
        }
        else {
          reject(new Error('failed to allocate debug port'))
        }
      })
    })
    server.on('error', reject)
  })
}

async function waitFor<T>(
  label: string,
  probe: () => Promise<T | undefined> | T | undefined,
  timeoutMs: number,
  intervalMs: number,
): Promise<T> {
  const start = Date.now()
  let lastError: unknown

  while ((Date.now() - start) < timeoutMs) {
    try {
      const value = await probe()
      if (value !== undefined)
        return value
    }
    catch (error) {
      lastError = error
    }
    await sleep(intervalMs)
  }

  const suffix = lastError instanceof Error ? `: ${lastError.message}` : ''
  throw new Error(`${label} timed out after ${timeoutMs}ms${suffix}`)
}

export class CdpClient {
  private socket?: WebSocket
  private nextId = 1
  private pending = new Map<number, {
    resolve: (value: Record<string, unknown>) => void
    reject: (error: Error) => void
  }>()

  constructor(socket: WebSocket) {
    this.socket = socket
    this.socket.addEventListener('message', (event) => {
      const payload = JSON.parse(String(event.data)) as Record<string, unknown>
      const id = typeof payload.id === 'number' ? payload.id : undefined
      if (id === undefined)
        return

      const pending = this.pending.get(id)
      if (!pending)
        return

      this.pending.delete(id)
      if (payload.error) {
        pending.reject(new Error(JSON.stringify(payload.error)))
      }
      else {
        pending.resolve(payload)
      }
    })
    this.socket.addEventListener('close', () => {
      this.failPending('CDP socket closed')
    })
    this.socket.addEventListener('error', () => {
      this.failPending('CDP socket errored')
    })
  }

  static async connect(url: string): Promise<CdpClient> {
    const socket = new WebSocket(url)
    await new Promise<void>((resolveOpen, reject) => {
      socket.addEventListener('open', () => resolveOpen(), { once: true })
      socket.addEventListener('error', () => reject(new Error(`failed to connect CDP target: ${url}`)), { once: true })
    })
    return new CdpClient(socket)
  }

  async send(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.socket) {
      throw new Error('CDP socket is closed')
    }

    const id = this.nextId++
    const promise = new Promise<Record<string, unknown>>((resolveMessage, reject) => {
      this.pending.set(id, { resolve: resolveMessage, reject })
    })

    this.socket.send(JSON.stringify({ id, method, params: params ?? {} }))
    return await promise
  }

  async evaluate<T>(expression: string): Promise<T> {
    const response = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    const result = response.result
    if (!isRecord(result))
      throw new Error('Runtime.evaluate missing result')

    const exceptionDetails = result.exceptionDetails
    if (exceptionDetails) {
      throw new Error(JSON.stringify(exceptionDetails))
    }

    const remoteObject = result.result
    if (!isRecord(remoteObject))
      throw new Error('Runtime.evaluate missing remote object')

    return remoteObject.value as T
  }

  close() {
    this.failPending('CDP socket closed')
    this.socket?.close()
    this.socket = undefined
  }

  private failPending(reason: string) {
    if (this.pending.size === 0) {
      return
    }

    for (const [id, pending] of this.pending.entries()) {
      this.pending.delete(id)
      pending.reject(new Error(`${reason} before completing request ${id}`))
    }
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok)
    throw new Error(`${url} returned ${response.status}`)
  return await response.json() as T
}

async function prepareMcpConfig() {
  await mkdir(userDataDir, { recursive: true })
  await mkdir(mcpSessionRoot, { recursive: true })

  const mcpEnv: Record<string, string> = {
    PATH: env.PATH || '',
    HOME: env.HOME || '',
    SHELL: env.SHELL || '',
    LANG: env.LANG || 'en_US.UTF-8',
    TMPDIR: env.TMPDIR || '',
    COMPUTER_USE_EXECUTOR: env.COMPUTER_USE_SMOKE_EXECUTOR || env.COMPUTER_USE_EXECUTOR || 'macos-local',
    COMPUTER_USE_APPROVAL_MODE: env.COMPUTER_USE_SMOKE_APPROVAL_MODE || env.COMPUTER_USE_APPROVAL_MODE || 'never',
    COMPUTER_USE_OPENABLE_APPS: env.COMPUTER_USE_OPENABLE_APPS || 'Terminal,Cursor,Google Chrome',
    COMPUTER_USE_SESSION_TAG: `desktop-overlay-live-window-smoke-${runId}`,
    COMPUTER_USE_SESSION_ROOT: mcpSessionRoot,
  }

  for (const optionalEnvName of ['PNPM_HOME', 'COREPACK_HOME']) {
    const value = env[optionalEnvName]?.trim()
    if (value) {
      mcpEnv[optionalEnvName] = value
    }
  }

  const config = {
    mcpServers: {
      computer_use: {
        command: 'pnpm',
        args: ['-F', '@proj-airi/computer-use-mcp', 'start'],
        cwd: repoDir,
        enabled: true,
        env: mcpEnv,
      },
    },
  }

  await writeFile(mcpConfigPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8')
}

async function ensureSmokePrerequisites() {
  if (typeof WebSocket !== 'function') {
    throw new TypeError('APP_START_FAILED: WebSocket is unavailable in this Node runtime. Run through the package script or set NODE_OPTIONS=--experimental-websocket.')
  }

  const missingOutputs: string[] = []
  for (const relativePath of requiredWorkspaceBuildOutputs) {
    try {
      await access(resolve(repoDir, relativePath))
    }
    catch {
      missingOutputs.push(relativePath)
    }
  }

  if (missingOutputs.length === 0)
    return

  throw new Error([
    'APP_START_FAILED: required workspace build outputs are missing.',
    `Missing: ${missingOutputs.join(', ')}`,
    'Build stage-tamagotchi dependencies manually before this smoke. The smoke command does not auto-build them to avoid saturating the local machine.',
    'Suggested command: pnpm -F \'@proj-airi/stage-tamagotchi^...\' --if-present build',
  ].join(' '))
}

async function waitForRemoteDebug(debugPort: number): Promise<string> {
  const version = await waitFor('Electron remote debug endpoint', async () => {
    const data = await fetchJson<{ webSocketDebuggerUrl?: string }>(`http://127.0.0.1:${debugPort}/json/version`)
    return data.webSocketDebuggerUrl
  }, 120_000, 500)

  return version
}

async function findOverlayTarget(debugPort: number): Promise<DebugTarget> {
  return await waitFor('desktop overlay debug target', async () => {
    const targets = await fetchJson<DebugTarget[]>(`http://127.0.0.1:${debugPort}/json/list`)
    return targets.find(target => target.type === 'page' && target.url.includes('#/desktop-overlay'))
  }, 120_000, 500)
}

async function connectOverlayClient(debugPort: number): Promise<CdpClient> {
  const overlayTarget = await findOverlayTarget(debugPort)
  if (!overlayTarget.webSocketDebuggerUrl)
    throw new Error('APP_START_FAILED: overlay target missing webSocketDebuggerUrl')

  const client = await CdpClient.connect(overlayTarget.webSocketDebuggerUrl)

  await waitFor('overlay smoke bridge', async () => {
    return await client.evaluate<boolean>('Boolean(window.__AIRI_DESKTOP_OVERLAY_SMOKE__?.callMcpTool)')
      ? true
      : undefined
  }, 60_000, 500)

  return client
}

async function callOverlayMcpTool(client: CdpClient, name: string, args: Record<string, unknown> = {}): Promise<McpResult> {
  const result = await client.evaluate<McpResult>(`window.__AIRI_DESKTOP_OVERLAY_SMOKE__.callMcpTool(${JSON.stringify({ name, arguments: args })})`)
  if (result.isError) {
    throw new Error(`${name} returned isError=true`)
  }
  return result
}

async function ensureOverlayMcpServerReady(client: CdpClient): Promise<void> {
  const applyResult = await client.evaluate<McpApplyResult>('window.__AIRI_DESKTOP_OVERLAY_SMOKE__.applyAndRestartMcp()')
  const failedComputerUse = applyResult.failed.find(item => item.name === 'computer_use')
  if (failedComputerUse) {
    throw new Error(`computer_use failed to start: ${failedComputerUse.error}`)
  }

  await waitFor('computer_use MCP runtime', async () => {
    const status = await client.evaluate<McpRuntimeStatus>('window.__AIRI_DESKTOP_OVERLAY_SMOKE__.getMcpRuntimeStatus()')
    const computerUse = status.servers.find(server => server.name === 'computer_use')
    if (computerUse?.state === 'error') {
      throw new Error(`computer_use runtime error: ${computerUse.lastError ?? 'unknown error'}`)
    }
    return computerUse?.state === 'running' ? true : undefined
  }, 30_000, 500)

  await waitFor('computer_use desktop tools', async () => {
    const tools = await client.evaluate<McpToolDescriptor[]>('window.__AIRI_DESKTOP_OVERLAY_SMOKE__.listMcpTools()')
    const names = new Set(tools.map(tool => tool.name))
    return names.has('computer_use::desktop_get_state')
      && names.has('computer_use::desktop_observe')
      && names.has('computer_use::desktop_click_target')
      ? true
      : undefined
  }, 30_000, 500)
}

function requireStructuredContent(result: McpResult, label: string): Record<string, unknown> {
  if (!isRecord(result.structuredContent))
    throw new Error(`${label} missing structuredContent`)

  if (result.structuredContent.status && result.structuredContent.status !== 'ok')
    throw new Error(`${label} expected status=ok, got ${String(result.structuredContent.status)}`)

  return result.structuredContent
}

function requireRunState(result: McpResult, label: string): Record<string, unknown> {
  const structuredContent = requireStructuredContent(result, label)
  if (!isRecord(structuredContent.runState))
    throw new Error(`${label} missing runState`)
  return structuredContent.runState
}

function startStage(debugPort: number, heartbeatLines: string[]): ChildProcessWithoutNullStreams {
  const stageProcess = spawn('pnpm', ['-F', '@proj-airi/stage-tamagotchi', 'dev'], {
    cwd: repoDir,
    detached: true,
    env: {
      ...env,
      APP_REMOTE_DEBUG: 'true',
      APP_REMOTE_DEBUG_PORT: String(debugPort),
      APP_REMOTE_DEBUG_NO_OPEN: 'true',
      APP_USER_DATA_PATH: userDataDir,
      AIRI_DESKTOP_OVERLAY: '1',
      AIRI_DESKTOP_OVERLAY_POLL_HEARTBEAT: '1',
    },
    stdio: 'pipe',
  })

  const stageLogStream = createWriteStream(stageLogPath, { flags: 'a' })
  const capture = (chunk: Buffer) => {
    const text = chunk.toString('utf-8')
    stageLogStream.write(text)
    for (const line of text.split(/\r?\n/u)) {
      if (line.includes(desktopOverlayPollHeartbeatMarker)) {
        heartbeatLines.push(line)
      }
    }
  }
  stageProcess.stdout.on('data', capture)
  stageProcess.stderr.on('data', capture)
  stageProcess.on('close', () => stageLogStream.end())

  return stageProcess
}

async function stopStage(stageProcess: ChildProcessWithoutNullStreams | undefined) {
  if (!stageProcess || stageProcess.exitCode !== null)
    return

  const signalStageProcessGroup = (signal: NodeJS.Signals) => {
    try {
      if (stageProcess.pid) {
        killProcess(-stageProcess.pid, signal)
        return
      }
    }
    catch {
      // Fall back to the pnpm wrapper process if process-group signalling is
      // unavailable. The smoke starts a detached group to make this reliable on
      // macOS, but the fallback keeps the helper safe on other local setups.
    }

    stageProcess.kill(signal)
  }

  signalStageProcessGroup('SIGTERM')
  await Promise.race([
    new Promise(resolve => stageProcess.once('exit', resolve)),
    sleep(5_000).then(() => signalStageProcessGroup('SIGKILL')),
  ])
}

function rejectWhenStageExits(stageProcess: ChildProcessWithoutNullStreams): Promise<never> {
  return new Promise((_, reject) => {
    stageProcess.once('exit', (code, signal) => {
      reject(new Error(`stage-tamagotchi exited with code=${String(code)} signal=${String(signal)}`))
    })
  })
}

async function main() {
  let stageProcess: ChildProcessWithoutNullStreams | undefined
  let overlayClient: CdpClient | undefined
  let stoppingStage = false
  const heartbeatLines: string[] = []

  try {
    await ensureSmokePrerequisites()
    await mkdir(reportDir, { recursive: true })
    await prepareMcpConfig()

    const debugPort = await findAvailablePort()
    stageProcess = startStage(debugPort, heartbeatLines)
    const stageExited = rejectWhenStageExits(stageProcess)
    stageProcess.once('exit', (code, signal) => {
      if (!stoppingStage && code !== null && code !== 0)
        console.error(`APP_START_FAILED: stage-tamagotchi exited with code=${code} signal=${String(signal)}`)
    })

    await Promise.race([
      waitForRemoteDebug(debugPort),
      stageExited,
    ]).catch((error) => {
      throw new Error(`APP_START_FAILED: ${error instanceof Error ? error.message : String(error)}`)
    })

    overlayClient = await Promise.race([
      connectOverlayClient(debugPort),
      stageExited,
    ]).catch((error) => {
      throw new Error(`APP_START_FAILED: ${error instanceof Error ? error.message : String(error)}`)
    })

    // NOTICE:
    // Vite's dev optimizer can trigger one renderer reload shortly after the
    // Electron window first exposes the smoke bridge. Reconnect once after a
    // short settle window so the following MCP calls do not race a closing CDP
    // target. This is local smoke harness discipline, not product runtime.
    await sleep(5_000)
    overlayClient.close()
    overlayClient = await Promise.race([
      connectOverlayClient(debugPort),
      stageExited,
    ]).catch((error) => {
      throw new Error(`APP_START_FAILED: ${error instanceof Error ? error.message : String(error)}`)
    })

    const readiness = await overlayClient.evaluate<{ state: 'booting' | 'ready' | 'degraded', error?: string }>('window.__AIRI_DESKTOP_OVERLAY_SMOKE__.getReadiness()')
    if (readiness.state !== 'ready') {
      throw new Error(`OVERLAY_READINESS_DEGRADED: state=${readiness.state}${readiness.error ? ` error=${readiness.error}` : ''}`)
    }

    try {
      await ensureOverlayMcpServerReady(overlayClient)
      await callOverlayMcpTool(overlayClient, 'computer_use::desktop_ensure_chrome', { url: smokeUrl })
      await sleep(750)
      await callOverlayMcpTool(overlayClient, 'computer_use::desktop_observe', { includeChrome: true })
      const preClickRunState = requireRunState(
        await callOverlayMcpTool(overlayClient, 'computer_use::desktop_get_state'),
        'computer_use::desktop_get_state before click',
      )
      const candidateId = selectDesktopOverlaySmokeCandidateId(preClickRunState)
      await callOverlayMcpTool(overlayClient, 'computer_use::desktop_click_target', {
        candidateId,
        button: 'left',
        clickCount: 1,
      })
      const postClickRunState = requireRunState(
        await callOverlayMcpTool(overlayClient, 'computer_use::desktop_get_state'),
        'computer_use::desktop_get_state after click',
      )
      const pointerIntent = postClickRunState.lastPointerIntent
      assert(isRecord(pointerIntent), 'computer_use::desktop_get_state missing lastPointerIntent after click')
      assert(pointerIntent.candidateId === candidateId, `lastPointerIntent candidate mismatch: expected ${candidateId}, got ${String(pointerIntent.candidateId)}`)
    }
    catch (error) {
      throw new Error(`MCP_CALL_FAILED: ${error instanceof Error ? error.message : String(error)}`)
    }

    const heartbeat = await waitFor('overlay poll heartbeat', () => {
      return heartbeatLines.find(line => line.includes('snapshotId=') && line.includes('pointerIntent=yes'))
    }, 30_000, 250).catch((error) => {
      throw new Error(`HEARTBEAT_TIMEOUT: ${error instanceof Error ? error.message : String(error)}`)
    })

    console.info(JSON.stringify({
      ok: true,
      reportDir,
      stageLogPath,
      heartbeat,
    }, null, 2))
  }
  finally {
    overlayClient?.close()
    stoppingStage = true
    await stopStage(stageProcess)
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    console.error(`stage log: ${stageLogPath}`)
    exit(1)
  })
}

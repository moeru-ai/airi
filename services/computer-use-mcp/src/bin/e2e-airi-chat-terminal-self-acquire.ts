import type { ChildProcessWithoutNullStreams } from 'node:child_process'

import type { AiriDebugSnapshotLike, DebugTargetLike } from '../e2e/debug-targets'

import { Buffer } from 'node:buffer'
import { execFile, spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { env, exit } from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import WebSocket from 'ws'

import { hasCompletedChatTurn } from '../e2e/chat-turn'
import {
  isChatSurfaceTarget,
  prioritizeInspectableAiriTargets,
} from '../e2e/debug-targets'
import { getProviderBootstrapConfig, resolvePreferredChatProviderId } from '../e2e/provider-bootstrap'

interface DebugTarget extends DebugTargetLike {
  webSocketDebuggerUrl?: string
}

interface TimelineEntry {
  at: string
  event: string
  detail?: Record<string, unknown>
}

interface ReportShape {
  startedAt: string
  finishedAt?: string
  status: 'running' | 'completed' | 'failed'
  prompt: string
  reportDir: string
  paths: {
    reportPath: string
    demoSummaryPath: string
    screenshotsDir: string
    stageLogPath: string
    userDataDir: string
    mcpConfigPath: string
    mcpSessionRoot: string
  }
  timeline: TimelineEntry[]
  debugSnapshots: unknown[]
  internalMcp: {
    tools?: unknown
    ptyStatus?: unknown
    desktopState?: unknown
    sessionTrace?: unknown
  }
  final?: {
    providerConfigured?: boolean
    providerId?: string
    modelId?: string
    messageCount?: number
    lastMessageRole?: string
    lastMessageText?: string
    lastTurnOutput?: string
    ptySessionId?: string
    demoSummaryText?: string
    screenshotPaths?: string[]
  }
  error?: string
}

const execFileAsync = promisify(execFile)
const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const repoDir = resolve(packageDir, '../..')
const preferredDebugPort = Number(env.AIRI_E2E_DEBUG_PORT || '9222')
const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const repoChangesCommand = 'git diff --stat -- services/computer-use-mcp packages/stage-ui apps/stage-tamagotchi'
const summaryMarker = 'Terminal self-acquire demo complete.'
const promptText = [
  `Use MCP tools to validate the AIRI repository at ${repoDir}.`,
  'Call the real workflow, do not narrate or simulate tool results.',
  '1. Call computer_use::workflow_validate_workspace with these exact arguments:',
  `   - projectPath: ${repoDir}`,
  '   - ideApp: Visual Studio Code',
  `   - changesCommand: ${repoChangesCommand}`,
  '   - checkCommand: vim --version',
  '   - autoApprove: true',
  '2. Do not call pty_create manually. The workflow should acquire PTY by itself if needed.',
  '3. Do not call any more tools after the workflow returns.',
  '4. Reply in plain text with 3 short bullet points for a management audience.',
  '5. Mention that validation started on exec, the workflow self-acquired PTY for the interactive validation command, and the workflow completed successfully.',
].join('\n')
const reportDir = resolve(packageDir, '.computer-use-mcp', 'reports', `airi-chat-terminal-self-acquire-${runId}`)
const reportPath = resolve(reportDir, 'report.json')
const demoSummaryPath = resolve(reportDir, 'demo-summary.md')
const screenshotsDir = resolve(reportDir, 'screenshots')
const stageLogPath = resolve(reportDir, 'stage-tamagotchi.log')
const userDataDir = resolve(reportDir, 'stage-user-data')
const mcpConfigPath = resolve(userDataDir, 'mcp.json')
const mcpSessionRoot = resolve(reportDir, 'computer-use-session')
const rootEnvPath = resolve(repoDir, '.env')

const report: ReportShape = {
  startedAt: new Date().toISOString(),
  status: 'running',
  prompt: promptText,
  reportDir,
  paths: {
    reportPath,
    demoSummaryPath,
    screenshotsDir,
    stageLogPath,
    userDataDir,
    mcpConfigPath,
    mcpSessionRoot,
  },
  timeline: [],
  debugSnapshots: [],
  internalMcp: {},
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`)
  }
}

function addTimeline(event: string, detail?: Record<string, unknown>) {
  report.timeline.push({
    at: new Date().toISOString(),
    event,
    detail,
  })
}

function parseDotEnv(text: string) {
  const values: Record<string, string> = {}

  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex <= 0) {
      continue
    }

    const key = trimmed.slice(0, separatorIndex).trim()
    const rawValue = trimmed.slice(separatorIndex + 1).trim()
    const unwrapped = rawValue.replace(/^['"]|['"]$/gu, '')
    values[key] = unwrapped
  }

  return values
}

async function readRootEnvValues() {
  try {
    const raw = await readFile(rootEnvPath, 'utf-8')
    return parseDotEnv(raw)
  }
  catch {
    return {}
  }
}

function sleep(ms: number) {
  return new Promise(resolvePromise => setTimeout(resolvePromise, ms))
}

async function withTimeout<T>(label: string, task: Promise<T>, timeoutMs: number) {
  let timeoutHandle: NodeJS.Timeout | undefined

  try {
    return await Promise.race([
      task,
      new Promise<never>((_resolvePromise, rejectPromise) => {
        timeoutHandle = setTimeout(() => rejectPromise(new Error(`Timed out waiting for ${label}`)), timeoutMs)
      }),
    ])
  }
  finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle)
    }
  }
}

async function writeReport() {
  report.finishedAt = new Date().toISOString()
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8')
}

async function canListenOnPort(port: number) {
  return await new Promise<boolean>((resolvePromise) => {
    const server = createServer()
    server.once('error', () => {
      resolvePromise(false)
    })
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolvePromise(true))
    })
  })
}

async function findAvailablePort(preferredPort: number, attempts = 20) {
  for (let index = 0; index < attempts; index += 1) {
    const candidate = preferredPort + index
    if (await canListenOnPort(candidate)) {
      return candidate
    }
  }

  throw new Error(`Could not find an available remote debug port starting from ${preferredPort}`)
}

async function terminateExistingStageTamagotchiInstances() {
  const patterns = [
    resolve(repoDir, 'apps', 'stage-tamagotchi'),
    '@proj-airi/stage-tamagotchi',
    resolve(repoDir, 'node_modules', '.pnpm', 'electron@'),
  ]

  for (const pattern of patterns) {
    await execFileAsync('pkill', ['-f', pattern]).catch(() => {})
  }

  await sleep(1_500)
}

async function waitFor<T>(label: string, task: () => Promise<T | undefined>, timeoutMs = 60_000, intervalMs = 500) {
  const startedAt = Date.now()

  while ((Date.now() - startedAt) < timeoutMs) {
    const value = await task()
    if (value !== undefined) {
      return value
    }

    await sleep(intervalMs)
  }

  throw new Error(`Timed out waiting for ${label}`)
}

function summarizeMessageText(value: unknown) {
  if (typeof value !== 'string') {
    return ''
  }

  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > 280 ? `${normalized.slice(0, 277)}...` : normalized
}

function getPreferredModels(providerId: string) {
  const requested = env.AIRI_E2E_MODELS?.trim()
    ? env.AIRI_E2E_MODELS.split(',')
    : [env.AIRI_E2E_MODEL?.trim() || '']

  const explicit = requested
    .map(model => model?.trim())
    .filter((model): model is string => Boolean(model))
  if (explicit.length > 0) {
    return explicit
  }

  if (providerId === 'google-generative-ai') {
    return ['gemini-2.5-flash', 'models/gemini-2.5-flash', 'gemini-2.5-pro']
  }

  return ['openai/gpt-4o-mini', 'openai/gpt-4.1-mini']
}

function requireStructuredContent(result: unknown, label: string) {
  if (!result || typeof result !== 'object') {
    throw new Error(`${label} did not return an object result`)
  }

  const structuredContent = (result as { structuredContent?: unknown }).structuredContent
  if (!structuredContent || typeof structuredContent !== 'object') {
    throw new Error(`${label} missing structuredContent`)
  }

  return structuredContent as Record<string, unknown>
}

class CdpClient {
  private ws: any
  private nextId = 0
  private pending = new Map<number, { resolve: (value: unknown) => void, reject: (error: Error) => void }>()

  static async connectToUrl(webSocketUrl: string, options: { enableRuntime?: boolean, enablePage?: boolean } = {}) {
    const client = new CdpClient()
    client.ws = new WebSocket(webSocketUrl)

    await new Promise<void>((resolvePromise, rejectPromise) => {
      const onOpen = () => resolvePromise()
      const onError = (error: Error) => rejectPromise(error)

      client.ws.addEventListener('open', onOpen, { once: true })
      client.ws.addEventListener('error', onError, { once: true })
    })

    client.ws.addEventListener('message', (event: { data: string }) => {
      const payload = JSON.parse(event.data)
      if (typeof payload.id === 'number') {
        const pending = client.pending.get(payload.id)
        if (!pending) {
          return
        }

        client.pending.delete(payload.id)
        if (payload.error) {
          pending.reject(new Error(String(payload.error.message || 'Unknown CDP error')))
          return
        }

        pending.resolve(payload.result)
      }
    })

    if (options.enableRuntime !== false) {
      await client.send('Runtime.enable')
    }

    if (options.enablePage !== false) {
      await client.send('Page.enable')
    }

    return client
  }

  static async connect(target: DebugTarget) {
    if (!target.webSocketDebuggerUrl) {
      throw new Error(`Debug target ${target.title || target.id} does not expose webSocketDebuggerUrl`)
    }

    return await CdpClient.connectToUrl(target.webSocketDebuggerUrl)
  }

  async send(method: string, params?: Record<string, unknown>) {
    const id = ++this.nextId
    const payload = { id, method, params }

    return await new Promise<any>((resolvePromise, rejectPromise) => {
      this.pending.set(id, { resolve: resolvePromise, reject: rejectPromise })
      this.ws.send(JSON.stringify(payload))
    })
  }

  async evaluate<T>(expression: string): Promise<T> {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    })

    if (result?.exceptionDetails) {
      const text = result.exceptionDetails.text || 'Runtime.evaluate exception'
      throw new Error(String(text))
    }

    return result?.result?.value as T
  }

  async close() {
    if (this.ws?.readyState === 1) {
      this.ws.close()
    }
  }
}

function toSafeFileStem(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'capture'
}

async function captureChatScreenshot(client: CdpClient, label: string) {
  await mkdir(screenshotsDir, { recursive: true })
  const filePath = resolve(screenshotsDir, `${String(report.timeline.length).padStart(3, '0')}-${toSafeFileStem(label)}.png`)
  const result = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    fromSurface: true,
  }) as { data?: string }

  assert(typeof result.data === 'string' && result.data.length > 0, `Page.captureScreenshot returned no data for ${label}`)
  await writeFile(filePath, Buffer.from(result.data, 'base64'))
  addTimeline('chat-screenshot-captured', {
    label,
    path: filePath,
  })
  return filePath
}

async function writeDemoSummary(params: {
  providerId: string
  modelId: string
  ptySessionId: string
  recentSurfaceDecision: Record<string, unknown>
  auditDeltaCount: number
  newTraceCount: number
  screenContent: string
  demoSummaryText?: string
  screenshotPaths: string[]
}) {
  const lines = [
    '# AIRI Terminal Self-Acquire Demo',
    '',
    `Report: ${reportPath}`,
    `Provider: ${params.providerId}`,
    `Model: ${params.modelId}`,
    `PTY session: ${params.ptySessionId}`,
    '',
    '## What This Demonstrates',
    '- AIRI started on the normal workflow terminal path (`exec`).',
    '- The workflow recognized that the validation step needed an interactive terminal and self-acquired PTY inside the workflow.',
    `- The validation step executed on PTY session \`${params.ptySessionId}\` without an outward reroute.`,
    `- Verification evidence included ${params.auditDeltaCount} PTY audit entries and ${params.newTraceCount} new trace entries.`,
    '',
    '## Surface Decision',
    `- Surface: ${String(params.recentSurfaceDecision.surface || '')}`,
    `- Transport: ${String(params.recentSurfaceDecision.transport || '')}`,
    `- Reason: ${String(params.recentSurfaceDecision.reason || '')}`,
    '',
    '## PTY Evidence',
    '```text',
    params.screenContent,
    '```',
  ]

  if (params.demoSummaryText?.trim()) {
    lines.push('', '## AIRI Final Visible Summary', '', params.demoSummaryText.trim())
  }

  if (params.screenshotPaths.length > 0) {
    lines.push('', '## Screenshots')
    for (const screenshotPath of params.screenshotPaths) {
      lines.push(`- ${screenshotPath}`)
    }
  }

  await writeFile(demoSummaryPath, `${lines.join('\n')}\n`, 'utf-8')
}

async function listDebugTargets(browserWsUrl: string) {
  const browserClient = await CdpClient.connectToUrl(browserWsUrl, {
    enableRuntime: false,
    enablePage: false,
  })

  try {
    const result = await browserClient.send('Target.getTargets') as { targetInfos?: Array<Record<string, unknown>> }
    const targetInfos = Array.isArray(result.targetInfos) ? result.targetInfos : []

    return targetInfos
      .filter(target => target.type === 'page')
      .map((target) => {
        const targetId = String(target.targetId || '')
        return {
          id: targetId,
          title: String(target.title || ''),
          type: String(target.type || ''),
          url: String(target.url || ''),
          webSocketDebuggerUrl: browserWsUrl.replace(/\/devtools\/browser\/[^/]+$/, `/devtools/page/${targetId}`),
        } satisfies DebugTarget
      })
  }
  finally {
    await browserClient.close().catch(() => {})
  }
}

async function bringTargetToFront(client: CdpClient, label: string) {
  await client.send('Page.bringToFront')
  addTimeline('target-brought-to-front', { label })
  await sleep(750)
}

async function getAiriDebugSnapshot(client: CdpClient) {
  return await client.evaluate<AiriDebugSnapshotLike | undefined>(`(() => {
    const bridge = window.__AIRI_DEBUG__
    if (!bridge || typeof bridge.getSnapshot !== 'function') {
      return undefined
    }

    return bridge.getSnapshot()
  })()`)
}

async function callAiriDebugBridge<T>(client: CdpClient, method: string, args: unknown[] = []) {
  return await client.evaluate<T>(`(async () => {
    const bridge = window.__AIRI_DEBUG__
    if (!bridge) {
      throw new Error('AIRI debug bridge is unavailable')
    }

    const fn = bridge[${JSON.stringify(method)}]
    if (typeof fn !== 'function') {
      throw new Error('AIRI debug bridge method is unavailable: ${method}')
    }

    return await fn.apply(bridge, ${JSON.stringify(args)})
  })()`)
}

async function waitForChatSurfaceReady(client: CdpClient, label: string) {
  return await waitFor(label, async () => {
    try {
      const snapshot = await callAiriDebugBridge<Record<string, any>>(client, 'getSnapshot')
      if (snapshot.dom?.hasTextarea) {
        return snapshot
      }

      return undefined
    }
    catch {
      return undefined
    }
  }, 30_000, 250)
}

async function findTargetWithAiriDebugBridge(
  browserWsUrl: string,
  label: string,
  predicate?: (target: DebugTarget, snapshot: AiriDebugSnapshotLike) => boolean,
) {
  return await waitFor(label, async () => {
    const targets = prioritizeInspectableAiriTargets(await listDebugTargets(browserWsUrl).catch(() => []))

    for (const target of targets) {
      let client: CdpClient | undefined

      try {
        client = await withTimeout(
          `${label} connect ${target.title || target.url || target.id}`,
          CdpClient.connect(target),
          2_500,
        )
        const snapshot = await withTimeout(
          `${label} snapshot ${target.title || target.url || target.id}`,
          getAiriDebugSnapshot(client),
          2_500,
        )
        if (!snapshot) {
          continue
        }

        if (predicate && !predicate(target, snapshot)) {
          continue
        }

        return {
          target,
          snapshot,
        }
      }
      catch {
        continue
      }
      finally {
        await client?.close().catch(() => {})
      }
    }

    return undefined
  }, 90_000, 750)
}

async function prepareMcpConfig() {
  await mkdir(userDataDir, { recursive: true })
  await mkdir(mcpSessionRoot, { recursive: true })

  const config = {
    mcpServers: {
      computer_use: {
        command: 'pnpm',
        args: ['-F', '@proj-airi/computer-use-mcp', 'start'],
        cwd: repoDir,
        enabled: true,
        env: {
          COMPUTER_USE_EXECUTOR: 'dry-run',
          COMPUTER_USE_APPROVAL_MODE: 'never',
          COMPUTER_USE_SESSION_TAG: `airi-chat-terminal-self-acquire-${runId}`,
          COMPUTER_USE_ALLOWED_BOUNDS: '0,0,1920,1080',
          COMPUTER_USE_OPENABLE_APPS: 'Finder,Terminal,Visual Studio Code,Cursor',
          COMPUTER_USE_SESSION_ROOT: mcpSessionRoot,
        },
      },
    },
  }

  await writeFile(mcpConfigPath, `${JSON.stringify(config, null, 2)}\n`, 'utf-8')
  addTimeline('prepared-mcp-config', {
    mcpConfigPath,
    mcpSessionRoot,
  })
}

function extractTextContent(result: Record<string, unknown>) {
  const content = Array.isArray(result.content) ? result.content : []
  return content
    .filter(item => item && typeof item === 'object' && item.type === 'text' && typeof item.text === 'string')
    .map(item => String(item.text))
    .join('\n')
}

function traceHasTerminalExecCommand(trace: Array<Record<string, unknown>>, commandFragment: string) {
  return trace.some((entry) => {
    const action = entry.action as Record<string, unknown> | undefined
    const input = action?.input as Record<string, unknown> | undefined
    return action?.kind === 'terminal_exec'
      && typeof input?.command === 'string'
      && input.command.includes(commandFragment)
  })
}

let exitCode = 0

async function main() {
  let stageProcess: ChildProcessWithoutNullStreams | undefined
  let mainTargetClient: CdpClient | undefined
  let chatTargetClient: CdpClient | undefined
  let chatClientSharesMainTarget = false
  let browserWsUrl: string | undefined
  const screenshotPaths: string[] = []
  const debugPort = await findAvailablePort(preferredDebugPort)
  const rootEnvValues = await readRootEnvValues()
  const resolvedPreferredProviderId = resolvePreferredChatProviderId({
    requestedProviderId: env.AIRI_E2E_PROVIDER?.trim(),
    processEnv: env,
    dotenvValues: rootEnvValues,
  })
  const providerAttemptOrder = Array.from(new Set([
    env.AIRI_E2E_PROVIDER?.trim(),
    resolvedPreferredProviderId,
    'google-generative-ai',
    'github-models',
  ].filter((providerId): providerId is string => Boolean(providerId))))

  try {
    await mkdir(reportDir, { recursive: true })
    await prepareMcpConfig()

    addTimeline('bootstrap', { reportDir, debugPort, userDataDir })
    await terminateExistingStageTamagotchiInstances()
    addTimeline('terminated-stale-stage-tamagotchi-instances')

    const stageLogStream = createWriteStream(stageLogPath, { flags: 'a' })
    addTimeline('start-stage-tamagotchi')

    stageProcess = spawn('pnpm', ['-F', '@proj-airi/stage-tamagotchi', 'dev'], {
      cwd: repoDir,
      env: {
        ...env,
        APP_REMOTE_DEBUG: 'true',
        APP_REMOTE_DEBUG_PORT: String(debugPort),
        APP_REMOTE_DEBUG_NO_OPEN: 'true',
        APP_USER_DATA_PATH: userDataDir,
      },
      stdio: 'pipe',
    })

    stageProcess.stdout.on('data', (chunk) => {
      stageLogStream.write(chunk)
      const match = chunk.toString('utf-8').match(/DevTools listening on (ws:\/\/\S+)/)
      if (match?.[1]) {
        browserWsUrl = match[1]
      }
    })
    stageProcess.stderr.on('data', (chunk) => {
      stageLogStream.write(chunk)
      const match = chunk.toString('utf-8').match(/DevTools listening on (ws:\/\/\S+)/)
      if (match?.[1]) {
        browserWsUrl = match[1]
      }
    })

    stageProcess.on('exit', (code, signal) => {
      addTimeline('stage-tamagotchi-exit', {
        code: code ?? undefined,
        signal: signal ?? undefined,
      })
    })

    const activeBrowserWsUrl = await waitFor('remote debug browser websocket', async () => {
      return browserWsUrl
    }, 120_000, 500)
    addTimeline('remote-debug-browser-ready', { browserWsUrl: activeBrowserWsUrl, debugPort })

    const mainTargetMatch = await findTargetWithAiriDebugBridge(
      activeBrowserWsUrl,
      'AIRI main target',
      (_target, snapshot) => !String(snapshot.route || '').includes('/chat'),
    )
    const mainTarget = mainTargetMatch.target
    addTimeline('main-target-ready', {
      title: mainTarget.title,
      url: mainTarget.url,
      route: mainTargetMatch.snapshot.route,
      documentTitle: mainTargetMatch.snapshot.documentTitle,
    })

    mainTargetClient = await CdpClient.connect(mainTarget)
    await bringTargetToFront(mainTargetClient, 'main')

    try {
      await withTimeout(
        'AIRI debug bridge openChat',
        callAiriDebugBridge(mainTargetClient, 'openChat'),
        8_000,
      )
      addTimeline('chat-open-requested', { mode: 'separate-window' })

      const chatTargetMatch = await findTargetWithAiriDebugBridge(
        activeBrowserWsUrl,
        'Chat target',
        (target, snapshot) => isChatSurfaceTarget(target, snapshot),
      )
      const chatTarget = chatTargetMatch.target
      addTimeline('chat-target-ready', {
        title: chatTarget.title,
        url: chatTarget.url,
        route: chatTargetMatch.snapshot.route,
        documentTitle: chatTargetMatch.snapshot.documentTitle,
        mode: 'separate-window',
      })

      chatTargetClient = await CdpClient.connect(chatTarget)
      await bringTargetToFront(chatTargetClient, 'chat')
      const readyChatSnapshot = await waitForChatSurfaceReady(chatTargetClient, 'chat surface ready')
      report.debugSnapshots.push(readyChatSnapshot)
      addTimeline('chat-surface-ready', {
        route: String(readyChatSnapshot.route || ''),
        hasTextarea: Boolean(readyChatSnapshot.dom?.hasTextarea),
      })
    }
    catch (error) {
      addTimeline('chat-open-fallback', {
        mode: 'same-window-route',
        reason: error instanceof Error ? error.message : String(error),
      })

      await mainTargetClient.close().catch(() => {})
      const refreshedMainTargetMatch = await findTargetWithAiriDebugBridge(
        activeBrowserWsUrl,
        'AIRI main target (fallback refresh)',
        (_target, snapshot) => !String(snapshot.route || '').includes('/chat'),
      )
      mainTargetClient = await CdpClient.connect(refreshedMainTargetMatch.target)
      await bringTargetToFront(mainTargetClient, 'main-fallback-refresh')

      await callAiriDebugBridge(mainTargetClient, 'navigateTo', ['/chat'])

      await waitFor('chat route in main AIRI window', async () => {
        try {
          const snapshot = await callAiriDebugBridge<Record<string, any>>(mainTargetClient!, 'getSnapshot')
          const onChatRoute = String(snapshot.route || '').includes('/chat')
          const hasTextarea = Boolean(snapshot.dom?.hasTextarea)
          return onChatRoute && hasTextarea ? snapshot : undefined
        }
        catch {
          return undefined
        }
      }, 30_000, 750)

      chatTargetClient = mainTargetClient
      await bringTargetToFront(chatTargetClient, 'main-chat-fallback')
      const readyChatSnapshot = await waitForChatSurfaceReady(chatTargetClient, 'fallback chat surface ready')
      report.debugSnapshots.push(readyChatSnapshot)
      addTimeline('chat-surface-ready', {
        route: String(readyChatSnapshot.route || ''),
        hasTextarea: Boolean(readyChatSnapshot.dom?.hasTextarea),
        mode: 'same-window-route',
      })
      chatClientSharesMainTarget = true
      addTimeline('chat-target-ready', {
        title: 'AIRI',
        url: 'http://localhost:5173/#/chat',
        mode: 'same-window-route',
      })
    }

    screenshotPaths.push(await captureChatScreenshot(chatTargetClient, 'chat-ready'))
    await callAiriDebugBridge(chatTargetClient, 'clearEvents')
    let selectionSnapshot: Record<string, any> | undefined
    let selectedProviderId = ''
    let selectedModelCandidates: string[] = []

    for (const providerId of providerAttemptOrder) {
      const providerBootstrapConfig = getProviderBootstrapConfig({
        providerId,
        processEnv: env,
        dotenvValues: rootEnvValues,
      })
      const candidateModels = getPreferredModels(providerId)
      const candidateSnapshot = await callAiriDebugBridge<Record<string, any>>(chatTargetClient, 'ensureConsciousnessSelection', [{
        provider: providerId,
        preferredModels: candidateModels,
        providerConfig: providerBootstrapConfig,
      }])

      report.debugSnapshots.push(candidateSnapshot)
      addTimeline('consciousness-selection-attempt', {
        providerId,
        modelCandidates: candidateModels,
        resolvedModelId: String(candidateSnapshot.provider?.activeModel || ''),
        providerAvailable: Boolean(candidateSnapshot.provider?.providerAvailable),
        providerBootstrapped: Boolean(providerBootstrapConfig),
      })

      if (candidateSnapshot.provider?.providerAvailable) {
        selectionSnapshot = candidateSnapshot
        selectedProviderId = providerId
        selectedModelCandidates = candidateModels
        break
      }
    }

    if (!selectionSnapshot) {
      throw new Error(`No chat provider is available for AIRI chat E2E. Tried: ${providerAttemptOrder.join(', ')}`)
    }

    addTimeline('consciousness-selection-ready', {
      providerId: selectedProviderId,
      modelId: String(selectionSnapshot.provider?.activeModel || ''),
      modelCandidates: selectedModelCandidates,
      providerAvailable: Boolean(selectionSnapshot.provider?.providerAvailable),
    })

    await callAiriDebugBridge(chatTargetClient, 'clearEvents')
    const resetSnapshot = await callAiriDebugBridge<Record<string, any>>(chatTargetClient, 'resetChatSession')
    report.debugSnapshots.push(resetSnapshot)
    addTimeline('chat-session-reset', {
      providerConfigured: Boolean(resetSnapshot.provider?.configured),
      providerId: String(resetSnapshot.provider?.activeProvider || ''),
      modelId: String(resetSnapshot.provider?.activeModel || ''),
      messageCount: Number(resetSnapshot.chat?.messageCount || 0),
      activeSessionId: String(resetSnapshot.chat?.activeSessionId || ''),
    })

    const availableTools = await waitFor('computer_use tools inside AIRI', async () => {
      try {
        const tools = await callAiriDebugBridge<Array<Record<string, unknown>>>(chatTargetClient!, 'listMcpTools')
        const names = new Set(tools.map(tool => String(tool.name || '')))
        const requiredTools = [
          'computer_use::workflow_validate_workspace',
          'computer_use::pty_get_status',
          'computer_use::pty_read_screen',
          'computer_use::pty_destroy',
          'computer_use::desktop_get_state',
          'computer_use::desktop_get_session_trace',
        ]
        const ready = requiredTools.every(name => names.has(name))
        addTimeline('mcp-tool-list-poll', {
          toolCount: tools.length,
          ready,
        })
        return ready ? tools : undefined
      }
      catch {
        return undefined
      }
    }, 120_000, 1_000)
    report.internalMcp.tools = availableTools
    addTimeline('internal-mcp-ready', {
      toolCount: Array.isArray(availableTools) ? availableTools.length : 0,
    })

    const ptyStatusResult = await callAiriDebugBridge<Record<string, unknown>>(chatTargetClient, 'callMcpTool', [{
      name: 'computer_use::pty_get_status',
      arguments: {},
    }])
    const ptyStatusData = requireStructuredContent(ptyStatusResult, 'computer_use::pty_get_status')
    report.internalMcp.ptyStatus = ptyStatusData
    addTimeline('pty-status-probed', {
      ptyAvailable: Boolean(ptyStatusData.ptyAvailable),
      error: typeof ptyStatusData.error === 'string' ? ptyStatusData.error : undefined,
      sessionCount: Array.isArray(ptyStatusData.sessions) ? ptyStatusData.sessions.length : 0,
    })
    assert(
      ptyStatusData.ptyAvailable === true,
      `pty_get_status expected ptyAvailable=true, got ${String(ptyStatusData.ptyAvailable)}${typeof ptyStatusData.error === 'string' ? ` (${ptyStatusData.error})` : ''}`,
    )

    const baselineStateResult = await callAiriDebugBridge<Record<string, unknown>>(chatTargetClient, 'callMcpTool', [{
      name: 'computer_use::desktop_get_state',
      arguments: {},
    }])
    const baselineState = requireStructuredContent(baselineStateResult, 'computer_use::desktop_get_state (baseline)')
    const baselineRunState = (baselineState.runState || {}) as Record<string, unknown>
    const baselineAuditCount = Array.isArray(baselineRunState.ptyAuditLog) ? baselineRunState.ptyAuditLog.length : 0
    const baselinePtySessionCount = Array.isArray(baselineRunState.ptySessions) ? baselineRunState.ptySessions.length : 0

    const baselineTraceResult = await callAiriDebugBridge<Record<string, unknown>>(chatTargetClient, 'callMcpTool', [{
      name: 'computer_use::desktop_get_session_trace',
      arguments: { limit: 200 },
    }])
    const baselineTrace = requireStructuredContent(baselineTraceResult, 'computer_use::desktop_get_session_trace (baseline)')
    const baselineTraceCount = Array.isArray(baselineTrace.trace) ? baselineTrace.trace.length : 0
    addTimeline('baseline-state-captured', {
      baselineAuditCount,
      baselineTraceCount,
      baselinePtySessionCount,
    })

    const baselineMessageCount = Number(resetSnapshot.chat?.messageCount || 0)
    await callAiriDebugBridge(chatTargetClient, 'sendChatPrompt', [promptText])
    addTimeline('chat-send-dispatched', {
      baselineMessageCount,
    })

    await waitFor('chat submission', async () => {
      const snapshot = await callAiriDebugBridge<Record<string, any>>(chatTargetClient!, 'getSnapshot')
      report.debugSnapshots.push(snapshot)

      const messageCount = Number(snapshot.chat?.messageCount || 0)
      const sending = Boolean(snapshot.chat?.sending)
      const recentEvents = Array.isArray(snapshot.chat?.recentEvents) ? snapshot.chat.recentEvents as Array<Record<string, any>> : []
      const sawBeforeSend = recentEvents.some(event => String(event?.type || '') === 'before-send')

      addTimeline('chat-submit-poll', {
        sending,
        messageCount,
        sawBeforeSend,
      })

      return sending || sawBeforeSend || messageCount > baselineMessageCount
        ? snapshot
        : undefined
    }, 20_000, 500)

    const finalSnapshot = await waitFor('chat completion after terminal self-acquire turn', async () => {
      const snapshot = await callAiriDebugBridge<Record<string, any>>(chatTargetClient!, 'getSnapshot')
      report.debugSnapshots.push(snapshot)

      const sending = Boolean(snapshot.chat?.sending)
      const outputText = String(snapshot.chat?.lastTurnComplete?.outputText || '')
      const lastMessageRole = String(snapshot.chat?.lastMessage?.role || '')
      const lastMessageText = String(snapshot.chat?.lastMessage?.text || '')
      const completed = hasCompletedChatTurn(snapshot)
      const messageCount = Number(snapshot.chat?.messageCount || 0)

      addTimeline('chat-completion-poll', {
        sending,
        completed,
        messageCount,
        lastMessageRole,
        outputPreview: summarizeMessageText(outputText),
        lastMessagePreview: summarizeMessageText(lastMessageText),
      })

      if (!sending && lastMessageRole === 'error') {
        return snapshot
      }

      if (!sending && completed && messageCount > baselineMessageCount) {
        return snapshot
      }

      return undefined
    }, 240_000, 1_000)

    const finalStateResult = await callAiriDebugBridge<Record<string, unknown>>(chatTargetClient, 'callMcpTool', [{
      name: 'computer_use::desktop_get_state',
      arguments: {},
    }])
    report.internalMcp.desktopState = requireStructuredContent(finalStateResult, 'computer_use::desktop_get_state (final)')

    const finalTraceResult = await callAiriDebugBridge<Record<string, unknown>>(chatTargetClient, 'callMcpTool', [{
      name: 'computer_use::desktop_get_session_trace',
      arguments: { limit: 200 },
    }])
    report.internalMcp.sessionTrace = requireStructuredContent(finalTraceResult, 'computer_use::desktop_get_session_trace (final)')

    report.final = {
      providerConfigured: Boolean(finalSnapshot.provider?.configured),
      providerId: String(finalSnapshot.provider?.activeProvider || ''),
      modelId: String(finalSnapshot.provider?.activeModel || ''),
      messageCount: Number(finalSnapshot.chat?.messageCount || 0),
      lastMessageRole: String(finalSnapshot.chat?.lastMessage?.role || ''),
      lastMessageText: summarizeMessageText(finalSnapshot.chat?.lastMessage?.text),
      lastTurnOutput: summarizeMessageText(finalSnapshot.chat?.lastTurnComplete?.outputText),
    }

    if (report.final.lastMessageRole === 'error') {
      throw new Error(`AIRI chat failed on ${report.final.providerId}/${report.final.modelId}: ${report.final.lastMessageText || 'unknown error'}`)
    }

    const finalRunState = ((report.internalMcp.desktopState as Record<string, unknown>).runState || {}) as Record<string, unknown>
    const recentSurfaceDecision = (finalRunState.recentSurfaceDecision || {}) as Record<string, unknown>
    const stepBindings = Array.isArray(finalRunState.workflowStepTerminalBindings)
      ? finalRunState.workflowStepTerminalBindings as Array<Record<string, unknown>>
      : []
    const ptySessions = Array.isArray(finalRunState.ptySessions)
      ? finalRunState.ptySessions as Array<Record<string, unknown>>
      : []
    const ptyAuditLog = Array.isArray(finalRunState.ptyAuditLog)
      ? finalRunState.ptyAuditLog as Array<Record<string, unknown>>
      : []
    const auditDelta = ptyAuditLog.slice(baselineAuditCount)
    const traceEntries = Array.isArray((report.internalMcp.sessionTrace as Record<string, unknown>).trace)
      ? (report.internalMcp.sessionTrace as Record<string, unknown>).trace as Array<Record<string, unknown>>
      : []
    const newTraceEntries = traceEntries.slice(baselineTraceCount)
    const ptyBinding = stepBindings.find(binding => binding.surface === 'pty' && typeof binding.ptySessionId === 'string')
    const ptySessionId = String(ptyBinding?.ptySessionId || '')

    assert(
      recentSurfaceDecision.surface === 'pty',
      `recentSurfaceDecision.surface must be pty, got ${String(recentSurfaceDecision.surface)}`,
    )
    assert(
      ptySessionId.length > 0,
      'workflowStepTerminalBindings must contain a PTY binding from workflow self-acquire',
    )
    assert(
      traceHasTerminalExecCommand(newTraceEntries, 'pwd'),
      'session trace must show terminal_exec for pwd before PTY self-acquire',
    )
    assert(
      traceHasTerminalExecCommand(newTraceEntries, repoChangesCommand),
      'session trace must show terminal_exec for git diff before PTY self-acquire',
    )
    assert(
      !traceHasTerminalExecCommand(newTraceEntries, 'vim --version'),
      'session trace must not show terminal_exec for vim --version once workflow self-acquires PTY',
    )
    assert(
      ptySessions.length > baselinePtySessionCount,
      `run-state must show a newly created PTY session, baseline=${baselinePtySessionCount}, current=${ptySessions.length}`,
    )
    assert(
      auditDelta.some(entry => entry.event === 'create'),
      'PTY audit delta must include create from workflow self-acquire',
    )
    assert(
      auditDelta.some(entry => entry.event === 'read_screen'),
      'PTY audit delta must include read_screen',
    )
    assert(
      auditDelta.some(entry => entry.event === 'send_input' && String(entry.inputPreview || '').includes('vim --version')),
      'PTY audit delta must include send_input for vim --version',
    )

    const ptyReadResult = await callAiriDebugBridge<Record<string, unknown>>(chatTargetClient, 'callMcpTool', [{
      name: 'computer_use::pty_read_screen',
      arguments: { sessionId: ptySessionId },
    }])
    const ptyReadData = requireStructuredContent(ptyReadResult, 'computer_use::pty_read_screen (verify)')
    const screenContent = String(ptyReadData.screenContent || extractTextContent(ptyReadResult))
    assert(
      ptyReadData.status === 'ok' && screenContent.trim().length > 0,
      'final PTY screen must remain readable after workflow self-acquire execution',
    )

    addTimeline('terminal-self-acquire-verified', {
      ptySessionId,
      recentSurfaceDecision,
      auditDeltaCount: auditDelta.length,
      newTraceCount: newTraceEntries.length,
    })

    screenshotPaths.push(await captureChatScreenshot(chatTargetClient, 'post-workflow-self-acquire-turn'))

    await callAiriDebugBridge(chatTargetClient, 'clearEvents')
    const summaryPrompt = [
      'Do not call any more tools.',
      'Reply in plain text only.',
      'Summarize this demo in exactly 4 short bullet points for a management audience.',
      'Mention that the workflow started on exec, self-acquired PTY for the interactive validation command, and then completed successfully.',
      `Mention the PTY session id ${ptySessionId}.`,
      'Mention that the PTY session remained readable after the workflow completed.',
      `End with EXACTLY: ${summaryMarker}`,
    ].join('\n')
    const summaryBaselineMessageCount = Number(finalSnapshot.chat?.messageCount || 0)

    await callAiriDebugBridge(chatTargetClient, 'sendChatPrompt', [summaryPrompt])
    addTimeline('demo-summary-send-dispatched', {
      baselineMessageCount: summaryBaselineMessageCount,
      summaryMarker,
    })

    await waitFor('demo summary submission', async () => {
      const snapshot = await callAiriDebugBridge<Record<string, any>>(chatTargetClient!, 'getSnapshot')
      report.debugSnapshots.push(snapshot)

      const messageCount = Number(snapshot.chat?.messageCount || 0)
      const sending = Boolean(snapshot.chat?.sending)
      const recentEvents = Array.isArray(snapshot.chat?.recentEvents) ? snapshot.chat.recentEvents as Array<Record<string, any>> : []
      const sawBeforeSend = recentEvents.some(event => String(event?.type || '') === 'before-send')

      addTimeline('demo-summary-submit-poll', {
        sending,
        messageCount,
        sawBeforeSend,
      })

      return sending || sawBeforeSend || messageCount > summaryBaselineMessageCount
        ? snapshot
        : undefined
    }, 20_000, 500)

    const demoSummarySnapshot = await waitFor('demo summary completion', async () => {
      const snapshot = await callAiriDebugBridge<Record<string, any>>(chatTargetClient!, 'getSnapshot')
      report.debugSnapshots.push(snapshot)

      const sending = Boolean(snapshot.chat?.sending)
      const outputText = String(snapshot.chat?.lastTurnComplete?.outputText || '')
      const lastMessageRole = String(snapshot.chat?.lastMessage?.role || '')
      const lastMessageText = String(snapshot.chat?.lastMessage?.text || '')
      const messageCount = Number(snapshot.chat?.messageCount || 0)
      const completed = hasCompletedChatTurn(snapshot)

      addTimeline('demo-summary-completion-poll', {
        sending,
        completed,
        messageCount,
        lastMessageRole,
        outputPreview: summarizeMessageText(outputText),
        lastMessagePreview: summarizeMessageText(lastMessageText),
      })

      if (!sending && lastMessageRole === 'error') {
        return snapshot
      }

      if (!sending && completed && messageCount > summaryBaselineMessageCount && lastMessageRole === 'assistant') {
        return snapshot
      }

      return undefined
    }, 120_000, 1_000)

    const chatMessages = await callAiriDebugBridge<Array<Record<string, unknown>>>(chatTargetClient, 'getChatMessages', [6])
    const latestAssistantSummary = [...chatMessages]
      .reverse()
      .find(message => String(message.role || '') === 'assistant' && String(message.text || '').includes(summaryMarker))
    const demoSummaryText = String(
      latestAssistantSummary?.text
      || demoSummarySnapshot.chat?.lastMessage?.text
      || demoSummarySnapshot.chat?.lastTurnComplete?.outputText
      || '',
    ).trim()
    assert(
      demoSummaryText.includes(summaryMarker),
      `demo summary text must include "${summaryMarker}"`,
    )

    screenshotPaths.push(await captureChatScreenshot(chatTargetClient, 'demo-summary'))

    report.final = {
      providerConfigured: Boolean(demoSummarySnapshot.provider?.configured),
      providerId: String(demoSummarySnapshot.provider?.activeProvider || report.final?.providerId || ''),
      modelId: String(demoSummarySnapshot.provider?.activeModel || report.final?.modelId || ''),
      messageCount: Number(demoSummarySnapshot.chat?.messageCount || report.final?.messageCount || 0),
      lastMessageRole: String(demoSummarySnapshot.chat?.lastMessage?.role || report.final?.lastMessageRole || ''),
      lastMessageText: summarizeMessageText(demoSummarySnapshot.chat?.lastMessage?.text || report.final?.lastMessageText),
      lastTurnOutput: summarizeMessageText(demoSummarySnapshot.chat?.lastTurnComplete?.outputText || report.final?.lastTurnOutput),
      ptySessionId,
      demoSummaryText,
      screenshotPaths: [...screenshotPaths],
    }

    await writeDemoSummary({
      providerId: String(report.final.providerId || ''),
      modelId: String(report.final.modelId || ''),
      ptySessionId,
      recentSurfaceDecision,
      auditDeltaCount: auditDelta.length,
      newTraceCount: newTraceEntries.length,
      screenContent,
      demoSummaryText,
      screenshotPaths,
    })

    await callAiriDebugBridge(chatTargetClient, 'callMcpTool', [{
      name: 'computer_use::pty_destroy',
      arguments: { sessionId: ptySessionId },
    }]).catch(() => undefined)

    report.status = 'completed'
    await writeReport()

    console.info(JSON.stringify({
      ok: true,
      reportPath,
      demoSummaryPath,
      providerId: report.final.providerId,
      modelId: report.final.modelId,
      ptySessionId,
      demoSummaryText: report.final.demoSummaryText,
      screenshotPaths: report.final.screenshotPaths,
      lastTurnOutput: report.final.lastTurnOutput,
      lastMessageText: report.final.lastMessageText,
    }, null, 2))
  }
  catch (error) {
    report.status = 'failed'
    report.error = error instanceof Error ? error.stack || error.message : String(error)
    addTimeline('failure', { error: report.error })
    await writeReport()
    console.error(report.error)
    exitCode = 1
  }
  finally {
    if (chatTargetClient && !chatClientSharesMainTarget) {
      await chatTargetClient.close().catch(() => {})
    }
    await mainTargetClient?.close().catch(() => {})

    if (stageProcess && !stageProcess.killed) {
      stageProcess.kill('SIGINT')
      await sleep(1_500)
      if (stageProcess.exitCode == null) {
        stageProcess.kill('SIGTERM')
      }
    }

    await writeReport().catch(() => {})
  }
}

main().finally(() => {
  exit(exitCode)
})

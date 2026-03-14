import type { ChildProcessWithoutNullStreams } from 'node:child_process'

import type { AiriDebugSnapshotLike } from '../e2e/debug-targets'

import { execFile, spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { env, exit } from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import WebSocket from 'ws'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

import { hasCompletedChatTurn } from '../e2e/chat-turn'
import {

  isChatSurfaceTarget,
  prioritizeInspectableAiriTargets,
} from '../e2e/debug-targets'
import { getProviderBootstrapConfig } from '../e2e/provider-bootstrap'

interface DebugTarget {
  id: string
  title: string
  type: string
  url: string
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
    stageLogPath: string
    mcpSessionRoot: string
    auditLogPath?: string
    screenshotsDir?: string
  }
  timeline: TimelineEntry[]
  debugSnapshots: unknown[]
  mcp: {
    capabilities?: unknown
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
  }
  error?: string
}

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const repoDir = resolve(packageDir, '../..')
const preferredDebugPort = Number(env.AIRI_E2E_DEBUG_PORT || '9222')
const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const preferredProviderId = env.AIRI_E2E_PROVIDER?.trim() || 'github-models'
const preferredModelCandidates = Array.from(new Set(
  (env.AIRI_E2E_MODELS?.trim()
    ? env.AIRI_E2E_MODELS.split(',')
    : [env.AIRI_E2E_MODEL?.trim() || 'openai/gpt-4o-mini', 'openai/gpt-4.1-mini'])
    .map(model => model?.trim())
    .filter((model): model is string => Boolean(model)),
))
const promptMarker = `airi-e2e-${runId.slice(-8)}`
// NOTICE: keep the default prompt ASCII-only. On macOS, injecting non-ASCII
// text through Quartz events can interact with the active IME composition state,
// which makes the follow-up Enter key commit composition instead of submitting
// the AIRI chat textarea. The prompt remains overrideable via AIRI_E2E_PROMPT.
const promptBaseText = env.AIRI_E2E_PROMPT?.trim() || 'Reply with one short sentence only: hello from AIRI desktop E2E.'
const promptText = `${promptBaseText} [${promptMarker}]`
const reportDir = resolve(packageDir, '.computer-use-mcp', 'reports', `airi-chat-observable-${runId}`)
const reportPath = resolve(reportDir, 'report.json')
const stageLogPath = resolve(reportDir, 'stage-tamagotchi.log')
const mcpSessionRoot = resolve(reportDir, 'computer-use-session')
const rootEnvPath = resolve(repoDir, '.env')

const report: ReportShape = {
  startedAt: new Date().toISOString(),
  status: 'running',
  prompt: promptText,
  reportDir,
  paths: {
    reportPath,
    stageLogPath,
    mcpSessionRoot,
  },
  timeline: [],
  debugSnapshots: [],
  mcp: {},
}

const execFileAsync = promisify(execFile)

function addTimeline(event: string, detail?: Record<string, unknown>) {
  report.timeline.push({
    at: new Date().toISOString(),
    event,
    detail,
  })
}

function parseCommandArgs(raw: string | undefined, fallback: string[]) {
  if (!raw?.trim()) {
    return fallback
  }

  return raw
    .split(/\s+/)
    .map(item => item.trim())
    .filter(Boolean)
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
  // TODO: Replace this whole observable harness with an actual Electron E2E
  // testing utility so process lifecycle and interaction orchestration happen
  // through supported test hooks instead of ad-hoc process discovery.
  // TODO: Replace this forced process cleanup with an app-provided shutdown command
  // (prefer RPC/Eventa or a dedicated MCP/debug command) so AIRI can exit
  // gracefully and clean up state, sockets, and child processes.
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

async function waitForChatSurfaceReady(client: CdpClient, label: string) {
  return await waitFor(label, async () => {
    try {
      const snapshot = await client.evaluate<Record<string, any>>('window.__AIRI_DEBUG__.getSnapshot()')
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

function summarizeMessageText(value: unknown) {
  if (typeof value !== 'string') {
    return ''
  }

  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > 240 ? `${normalized.slice(0, 237)}...` : normalized
}

let exitCode = 0

async function main() {
  let stageProcess: ChildProcessWithoutNullStreams | undefined
  let mcpClient: Client | undefined
  let mainTargetClient: CdpClient | undefined
  let chatTargetClient: CdpClient | undefined
  let chatClientSharesMainTarget = false
  let chatSurfaceMode: 'separate-window' | 'same-window-route' = 'separate-window'
  let browserWsUrl: string | undefined
  const debugPort = await findAvailablePort(preferredDebugPort)
  const rootEnvValues = await readRootEnvValues()
  const providerBootstrapConfig = getProviderBootstrapConfig({
    providerId: preferredProviderId,
    processEnv: env,
    dotenvValues: rootEnvValues,
  })

  try {
    await mkdir(reportDir, { recursive: true })
    await mkdir(mcpSessionRoot, { recursive: true })

    addTimeline('bootstrap', { reportDir, debugPort })
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

    const command = env.COMPUTER_USE_SMOKE_SERVER_COMMAND?.trim() || 'pnpm'
    const args = parseCommandArgs(env.COMPUTER_USE_SMOKE_SERVER_ARGS, ['start'])
    const cwd = env.COMPUTER_USE_SMOKE_SERVER_CWD?.trim() || packageDir

    const transport = new StdioClientTransport({
      command,
      args,
      cwd,
      env: {
        ...env,
        COMPUTER_USE_EXECUTOR: 'macos-local',
        COMPUTER_USE_APPROVAL_MODE: 'never',
        COMPUTER_USE_OPENABLE_APPS: 'Terminal,Cursor,Google Chrome,Electron',
        COMPUTER_USE_DENY_APPS: '1Password,Keychain,System Settings,Activity Monitor',
        COMPUTER_USE_SESSION_TAG: `airi-e2e-${runId}`,
        COMPUTER_USE_ALLOWED_BOUNDS: env.COMPUTER_USE_ALLOWED_BOUNDS || '0,0,2560,1600',
        COMPUTER_USE_SESSION_ROOT: mcpSessionRoot,
      },
      stderr: 'pipe',
    })

    mcpClient = new Client({
      name: '@proj-airi/computer-use-mcp-e2e-airi-chat',
      version: '0.1.0',
    })

    transport.stderr?.on('data', (chunk: { toString: (encoding: string) => string }) => {
      const text = chunk.toString('utf-8').trim()
      if (text) {
        addTimeline('computer-use-mcp-stderr', { text })
      }
    })

    await mcpClient.connect(transport)
    addTimeline('computer-use-mcp-connected')

    const capabilities = await mcpClient.callTool({
      name: 'desktop_get_capabilities',
      arguments: {},
    })
    const capabilitiesData = requireStructuredContent(capabilities, 'desktop_get_capabilities')
    report.mcp.capabilities = capabilitiesData
    report.paths.auditLogPath = String((capabilitiesData.session as Record<string, unknown> | undefined)?.auditLogPath || '') || undefined
    report.paths.screenshotsDir = String((capabilitiesData.session as Record<string, unknown> | undefined)?.screenshotsDir || '') || undefined
    addTimeline('desktop-capabilities', {
      executionMode: (capabilitiesData.executionTarget as Record<string, unknown> | undefined)?.mode,
      auditLogPath: report.paths.auditLogPath,
      screenshotsDir: report.paths.screenshotsDir,
    })

    await mcpClient.callTool({
      name: 'desktop_screenshot',
      arguments: { label: 'before-open-chat' },
    })
    addTimeline('screenshot-captured', { label: 'before-open-chat' })

    try {
      await withTimeout(
        'AIRI debug bridge openChat',
        mainTargetClient.evaluate('window.__AIRI_DEBUG__.openChat()'),
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
      chatSurfaceMode = 'same-window-route'
      addTimeline('chat-open-fallback', {
        mode: 'same-window-route',
        reason: error instanceof Error ? error.message : String(error),
      })

      await mainTargetClient.evaluate(`window.__AIRI_DEBUG__.navigateTo('/chat')`)

      await waitFor('chat route in main AIRI window', async () => {
        try {
          const snapshot = await mainTargetClient!.evaluate<Record<string, any>>('window.__AIRI_DEBUG__.getSnapshot()')
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

    const focusedDesktop = await mcpClient.callTool({
      name: 'desktop_focus_app',
      arguments: { app: 'Electron' },
    })
    const focusedDesktopData = requireStructuredContent(focusedDesktop, 'desktop_focus_app')
    addTimeline('desktop-focus-app', {
      app: 'Electron',
      status: focusedDesktopData.status,
    })

    const observation = await waitFor('Chat window observation', async () => {
      const result = await mcpClient!.callTool({
        name: 'desktop_observe_windows',
        arguments: { limit: 24 },
      })
      const data = requireStructuredContent(result, 'desktop_observe_windows')
      const observationPayload = ((data.backendResult as Record<string, unknown> | undefined)?.observation
        || data.observation) as Record<string, unknown> | undefined
      const windows = Array.isArray(observationPayload?.windows) ? observationPayload.windows as Array<Record<string, unknown>> : []
      const frontmostAppName = String(observationPayload?.frontmostAppName || '')
      const chatWindow = windows.find(window => String(window.title || '').includes('AIRI'))
      if (!frontmostAppName.includes('Electron')) {
        return undefined
      }
      if (!chatWindow) {
        return undefined
      }

      return {
        full: data,
        chatWindow,
      }
    }, 30_000, 1_000)
    addTimeline('chat-window-observed', {
      ...observation.chatWindow,
      mode: chatSurfaceMode,
    })

    await chatTargetClient.evaluate('window.__AIRI_DEBUG__.clearEvents()')
    const selectionSnapshot = await chatTargetClient.evaluate<Record<string, any>>(`window.__AIRI_DEBUG__.ensureConsciousnessSelection(${JSON.stringify({
      provider: preferredProviderId,
      preferredModels: preferredModelCandidates,
      providerConfig: providerBootstrapConfig,
    })})`)
    report.debugSnapshots.push(selectionSnapshot)
    addTimeline('consciousness-selection-ready', {
      providerId: String(selectionSnapshot.provider?.activeProvider || ''),
      modelId: String(selectionSnapshot.provider?.activeModel || ''),
      preferredProviderId,
      preferredModelCandidates,
      providerAvailable: Boolean(selectionSnapshot.provider?.providerAvailable),
      providerBootstrapped: Boolean(providerBootstrapConfig),
    })

    if (preferredProviderId === 'github-models' && !selectionSnapshot.provider?.providerAvailable) {
      throw new Error(`GitHub Models provider is unavailable before chat send. Checked .env at ${rootEnvPath} for bootstrap credentials, but AIRI still did not validate github-models.`)
    }

    await chatTargetClient.evaluate('window.__AIRI_DEBUG__.clearEvents()')
    const resetSnapshot = await chatTargetClient.evaluate<Record<string, any>>('window.__AIRI_DEBUG__.resetChatSession()')
    report.debugSnapshots.push(resetSnapshot)
    addTimeline('chat-session-reset', {
      providerConfigured: Boolean(resetSnapshot.provider?.configured),
      providerId: String(resetSnapshot.provider?.activeProvider || ''),
      modelId: String(resetSnapshot.provider?.activeModel || ''),
      messageCount: Number(resetSnapshot.chat?.messageCount || 0),
      activeSessionId: String(resetSnapshot.chat?.activeSessionId || ''),
    })

    const focusState = await waitFor('chat textarea focus', async () => {
      const state = await chatTargetClient!.evaluate<Record<string, any>>(`(() => {
        window.focus()
        const textarea = document.querySelector('textarea.ph-no-capture')
        if (!(textarea instanceof HTMLTextAreaElement)) {
          return {
            ok: false,
            reason: 'textarea-not-found',
          }
        }

        textarea.click()
        textarea.focus()

        return {
          ok: document.activeElement === textarea,
          placeholder: textarea.getAttribute('placeholder'),
          valueLength: textarea.value.length,
          disabled: textarea.disabled,
          readOnly: textarea.readOnly,
          focusedTagName: document.activeElement?.tagName || '',
        }
      })()`)

      addTimeline('textarea-focus-poll', {
        ok: Boolean(state.ok),
        disabled: Boolean(state.disabled),
        readOnly: Boolean(state.readOnly),
        focusedTagName: String(state.focusedTagName || ''),
      })

      return state.ok ? state : undefined
    }, 15_000, 250)
    addTimeline('textarea-focused', {
      placeholder: String(focusState.placeholder || ''),
      valueLength: Number(focusState.valueLength || 0),
    })

    await mcpClient.callTool({
      name: 'desktop_screenshot',
      arguments: { label: 'chat-before-type' },
    })
    addTimeline('screenshot-captured', { label: 'chat-before-type' })

    const baselineMessageCount = Number(resetSnapshot.chat?.messageCount || 0)

    const typed = await mcpClient.callTool({
      name: 'desktop_type_text',
      arguments: {
        text: promptText,
        pressEnter: false,
        captureAfter: true,
      },
    })
    const typedData = requireStructuredContent(typed, 'desktop_type_text')
    addTimeline('desktop-type-text', {
      status: typedData.status,
      screenshotPath: (typedData.screenshot as Record<string, unknown> | undefined)?.path,
    })

    const typedSnapshot = await waitFor('typed prompt to settle in textarea', async () => {
      const typedState = await chatTargetClient!.evaluate<Record<string, any>>(`(() => {
        const textarea = document.querySelector('textarea.ph-no-capture')
        const value = textarea instanceof HTMLTextAreaElement ? textarea.value : ''
        return {
          value,
          valueLength: value.length,
          containsPromptMarker: value.includes(${JSON.stringify(promptMarker)}),
        }
      })()`)

      addTimeline('textarea-poll', {
        valueLength: Number(typedState.valueLength || 0),
        containsPromptMarker: Boolean(typedState.containsPromptMarker),
      })

      if (typedState.containsPromptMarker === true) {
        return typedState
      }

      return undefined
    }, 10_000, 250)
    addTimeline('textarea-filled', {
      valueLength: Number(typedSnapshot.valueLength || 0),
    })

    const submit = await mcpClient.callTool({
      name: 'desktop_press_keys',
      arguments: {
        keys: ['enter'],
        captureAfter: true,
      },
    })
    const submitData = requireStructuredContent(submit, 'desktop_press_keys')
    addTimeline('desktop-press-keys', {
      status: submitData.status,
      screenshotPath: (submitData.screenshot as Record<string, unknown> | undefined)?.path,
    })

    const submittedSnapshot = await waitFor('chat submit', async () => {
      const snapshot = await chatTargetClient!.evaluate<Record<string, any>>('window.__AIRI_DEBUG__.getSnapshot()')
      report.debugSnapshots.push(snapshot)

      const messageCount = Number(snapshot.chat?.messageCount || 0)
      const sending = Boolean(snapshot.chat?.sending)
      const lastMessageRole = String(snapshot.chat?.lastMessage?.role || '')
      const lastMessageText = String(snapshot.chat?.lastMessage?.text || '')
      const recentEvents = Array.isArray(snapshot.chat?.recentEvents) ? snapshot.chat.recentEvents as Array<Record<string, any>> : []
      const sawBeforeSend = recentEvents.some(event => String(event?.type || '') === 'before-send')

      addTimeline('chat-submit-poll', {
        sending,
        messageCount,
        lastMessageRole,
        sawBeforeSend,
        textareaValueLength: Number(snapshot.dom?.textareaValueLength || 0),
      })

      if (sending || sawBeforeSend) {
        return snapshot
      }

      if (messageCount > baselineMessageCount && lastMessageRole === 'user' && lastMessageText.includes(promptMarker)) {
        return snapshot
      }

      return undefined
    }, 15_000, 500)
    addTimeline('chat-submit-observed', {
      sending: Boolean(submittedSnapshot.chat?.sending),
      messageCount: Number(submittedSnapshot.chat?.messageCount || 0),
      lastMessageRole: String(submittedSnapshot.chat?.lastMessage?.role || ''),
    })

    let capturedStreamingScreenshot = false
    const finalSnapshot = await waitFor('chat completion or error', async () => {
      const snapshot = await chatTargetClient!.evaluate<Record<string, any>>('window.__AIRI_DEBUG__.getSnapshot()')
      report.debugSnapshots.push(snapshot)

      if (!capturedStreamingScreenshot && snapshot.chat?.sending && typeof snapshot.chat?.streamingText === 'string' && snapshot.chat.streamingText.trim().length > 0) {
        capturedStreamingScreenshot = true
        await mcpClient!.callTool({
          name: 'desktop_screenshot',
          arguments: { label: 'chat-during-stream' },
        })
        addTimeline('screenshot-captured', {
          label: 'chat-during-stream',
          streamingLength: snapshot.chat.streamingText.length,
        })
      }

      const messageCount = Number(snapshot.chat?.messageCount || 0)
      const sending = Boolean(snapshot.chat?.sending)
      const lastMessageRole = String(snapshot.chat?.lastMessage?.role || '')
      const hasTurnCompletion = hasCompletedChatTurn(snapshot)
      const recentEvents = Array.isArray(snapshot.chat?.recentEvents)
        ? snapshot.chat.recentEvents as Array<Record<string, unknown>>
        : []
      const abortedByUser = recentEvents.some(event => String(event?.type || '') === 'chat-abort-requested')

      addTimeline('chat-completion-poll', {
        sending,
        messageCount,
        streamingLength: Number(snapshot.chat?.streamingText?.length || 0),
        lastMessageRole,
        turnCompleted: hasTurnCompletion,
        toolCallCount: Number(snapshot.chat?.lastTurnComplete?.toolCallCount || 0),
        toolResultCount: Number(snapshot.chat?.lastTurnComplete?.toolResultCount || 0),
        abortedByUser,
      })

      if (!sending && messageCount > baselineMessageCount && hasTurnCompletion) {
        return snapshot
      }

      if (!sending && lastMessageRole === 'error') {
        return snapshot
      }

      if (!sending && abortedByUser) {
        return snapshot
      }

      return undefined
    }, 90_000, 1_000)

    await mcpClient.callTool({
      name: 'desktop_screenshot',
      arguments: { label: 'chat-final' },
    })
    addTimeline('screenshot-captured', { label: 'chat-final' })

    const desktopState = await mcpClient.callTool({
      name: 'desktop_get_state',
      arguments: {},
    })
    report.mcp.desktopState = requireStructuredContent(desktopState, 'desktop_get_state')

    const sessionTrace = await mcpClient.callTool({
      name: 'desktop_get_session_trace',
      arguments: { limit: 200 },
    })
    report.mcp.sessionTrace = requireStructuredContent(sessionTrace, 'desktop_get_session_trace')

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

    if (report.paths.auditLogPath) {
      const audit = await readFile(report.paths.auditLogPath, 'utf-8').catch(() => '')
      addTimeline('audit-log-summary', {
        lineCount: audit ? audit.trim().split('\n').filter(Boolean).length : 0,
      })
    }

    report.status = 'completed'
    await writeReport()

    console.info(JSON.stringify({
      ok: true,
      reportPath,
      providerConfigured: report.final.providerConfigured,
      providerId: report.final.providerId,
      modelId: report.final.modelId,
      lastMessageRole: report.final.lastMessageRole,
      lastMessageText: report.final.lastMessageText,
      lastTurnOutput: report.final.lastTurnOutput,
      auditLogPath: report.paths.auditLogPath,
      screenshotsDir: report.paths.screenshotsDir,
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
    await mcpClient?.close().catch(() => {})

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

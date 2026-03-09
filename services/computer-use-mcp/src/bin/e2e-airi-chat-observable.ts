import type { ChildProcessWithoutNullStreams } from 'node:child_process'

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
const promptText = env.AIRI_E2E_PROMPT?.trim() || '请用一句中文简短回复：你好，我正在做 AIRI 桌面端到端可观测测试。'
const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const reportDir = resolve(packageDir, '.computer-use-mcp', 'reports', `airi-chat-observable-${runId}`)
const reportPath = resolve(reportDir, 'report.json')
const stageLogPath = resolve(reportDir, 'stage-tamagotchi.log')
const mcpSessionRoot = resolve(reportDir, 'computer-use-session')

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

async function waitForTarget(browserWsUrl: string, predicate: (target: DebugTarget) => boolean, label: string) {
  return await waitFor(label, async () => {
    const targets = await listDebugTargets(browserWsUrl).catch(() => [])
    return targets.find(predicate)
  }, 90_000, 750)
}

function summarizeMessageText(value: unknown) {
  if (typeof value !== 'string') {
    return ''
  }

  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > 240 ? `${normalized.slice(0, 237)}...` : normalized
}

async function main() {
  let stageProcess: ChildProcessWithoutNullStreams | undefined
  let mcpClient: Client | undefined
  let mainTargetClient: CdpClient | undefined
  let chatTargetClient: CdpClient | undefined
  let chatClientSharesMainTarget = false
  let chatSurfaceMode: 'separate-window' | 'same-window-route' = 'separate-window'
  let browserWsUrl: string | undefined
  const debugPort = await findAvailablePort(preferredDebugPort)

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

    const mainTarget = await waitForTarget(
      activeBrowserWsUrl,
      (target) => {
        if (target.type !== 'page') {
          return false
        }

        if (!target.url.startsWith('http://localhost:5173/')) {
          return false
        }

        return !target.url.includes('/__inspect__')
          && !target.url.includes('/__devtools__')
          && !target.url.includes('/__unocss')
      },
      'AIRI main target',
    )
    addTimeline('main-target-ready', { title: mainTarget.title, url: mainTarget.url })

    mainTargetClient = await CdpClient.connect(mainTarget)

    await waitFor('AIRI debug bridge (main window)', async () => {
      try {
        const exists = await mainTargetClient!.evaluate<boolean>('Boolean(window.__AIRI_DEBUG__ && typeof window.__AIRI_DEBUG__.getSnapshot === "function")')
        return exists ? true : undefined
      }
      catch {
        return undefined
      }
    }, 60_000, 750)

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
        COMPUTER_USE_OPENABLE_APPS: 'Terminal,Cursor,Google Chrome,AIRI,Chat',
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
      await mainTargetClient.evaluate('window.__AIRI_DEBUG__.openChat()')
      addTimeline('chat-open-requested', { mode: 'separate-window' })

      const chatTarget = await waitForTarget(
        activeBrowserWsUrl,
        target => target.type === 'page' && (target.title === 'Chat' || target.url.includes('#/chat')),
        'Chat target',
      )
      addTimeline('chat-target-ready', { title: chatTarget.title, url: chatTarget.url, mode: 'separate-window' })

      chatTargetClient = await CdpClient.connect(chatTarget)
      await chatTargetClient.send('Page.bringToFront')

      await waitFor('AIRI debug bridge (chat window)', async () => {
        try {
          const exists = await chatTargetClient!.evaluate<boolean>('Boolean(window.__AIRI_DEBUG__ && typeof window.__AIRI_DEBUG__.getSnapshot === "function")')
          return exists ? true : undefined
        }
        catch {
          return undefined
        }
      }, 60_000, 750)
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
      chatClientSharesMainTarget = true
      addTimeline('chat-target-ready', {
        title: 'AIRI',
        url: 'http://localhost:5173/#/chat',
        mode: 'same-window-route',
      })
    }

    const observation = await waitFor('Chat window observation', async () => {
      const result = await mcpClient!.callTool({
        name: 'desktop_observe_windows',
        arguments: { limit: 24 },
      })
      const data = requireStructuredContent(result, 'desktop_observe_windows')
      const observationPayload = ((data.backendResult as Record<string, unknown> | undefined)?.observation
        || data.observation) as Record<string, unknown> | undefined
      const windows = Array.isArray(observationPayload?.windows) ? observationPayload.windows as Array<Record<string, unknown>> : []
      const expectedWindowTitle = chatSurfaceMode === 'same-window-route' ? 'AIRI' : 'Chat'
      const chatWindow = windows.find(window => String(window.title || '').includes(expectedWindowTitle))
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

    const initialSnapshot = await chatTargetClient.evaluate<Record<string, any>>('window.__AIRI_DEBUG__.getSnapshot()')
    report.debugSnapshots.push(initialSnapshot)
    addTimeline('initial-chat-snapshot', {
      providerConfigured: Boolean(initialSnapshot.provider?.configured),
      providerId: String(initialSnapshot.provider?.activeProvider || ''),
      modelId: String(initialSnapshot.provider?.activeModel || ''),
      messageCount: Number(initialSnapshot.chat?.messageCount || 0),
    })

    await chatTargetClient.evaluate(`(() => {
      window.focus()
      const textarea = document.querySelector('textarea.ph-no-capture')
      if (!textarea) {
        return { ok: false, reason: 'textarea-not-found' }
      }
      textarea.focus()
      return {
        ok: document.activeElement === textarea,
        placeholder: textarea.getAttribute('placeholder'),
        valueLength: textarea.value.length,
      }
    })()`)
    addTimeline('textarea-focused')

    await mcpClient.callTool({
      name: 'desktop_screenshot',
      arguments: { label: 'chat-before-type' },
    })
    addTimeline('screenshot-captured', { label: 'chat-before-type' })

    const baselineMessageCount = Number(initialSnapshot.chat?.messageCount || 0)

    const typed = await mcpClient.callTool({
      name: 'desktop_type_text',
      arguments: {
        text: promptText,
        pressEnter: true,
        captureAfter: true,
      },
    })
    const typedData = requireStructuredContent(typed, 'desktop_type_text')
    addTimeline('desktop-type-text', {
      status: typedData.status,
      screenshotPath: (typedData.screenshot as Record<string, unknown> | undefined)?.path,
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
      const hasTurnOutput = Boolean(snapshot.chat?.lastTurnComplete?.outputText)

      addTimeline('chat-poll', {
        sending,
        messageCount,
        streamingLength: Number(snapshot.chat?.streamingText?.length || 0),
        lastMessageRole,
      })

      if (hasTurnOutput) {
        return snapshot
      }

      if (!sending && (messageCount > baselineMessageCount || lastMessageRole === 'error')) {
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

let exitCode = 0

main().finally(() => {
  exit(exitCode)
})

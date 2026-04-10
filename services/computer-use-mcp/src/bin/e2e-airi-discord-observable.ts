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

import {
  prioritizeInspectableAiriTargets,
} from '../e2e/debug-targets'

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

interface DiscordBotRuntimeState {
  attemptedConnect: boolean
  connected: boolean
  receivedConfig: boolean
  readyUserTag?: string
  waitingForConfiguration: boolean
  applyFailure?: string
}

interface ReportShape {
  startedAt: string
  finishedAt?: string
  status: 'running' | 'completed' | 'failed'
  scenario: 'discord-enable'
  reportDir: string
  paths: {
    reportPath: string
    stageLogPath: string
    discordBotLogPath: string
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
  discord: {
    allowLoginFailure: boolean
    expectedTokenLength: number
    providerServerUrl: string
    ui?: {
      route?: string
      enabled?: boolean
      configured?: boolean
      tokenLength?: number
    }
    bot?: DiscordBotRuntimeState
  }
  error?: string
}

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const repoDir = resolve(packageDir, '../..')
const preferredDebugPort = Number(env.AIRI_E2E_DEBUG_PORT || '9222')
const runId = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-')
const reportDir = resolve(packageDir, '.computer-use-mcp', 'reports', `airi-discord-observable-${runId}`)
const reportPath = resolve(reportDir, 'report.json')
const stageLogPath = resolve(reportDir, 'stage-tamagotchi.log')
const discordBotLogPath = resolve(reportDir, 'discord-bot.log')
const mcpSessionRoot = resolve(reportDir, 'computer-use-session')
const rootEnvPath = resolve(repoDir, '.env')

const execFileAsync = promisify(execFile)

const report: ReportShape = {
  startedAt: new Date().toISOString(),
  status: 'running',
  scenario: 'discord-enable',
  reportDir,
  paths: {
    reportPath,
    stageLogPath,
    discordBotLogPath,
    mcpSessionRoot,
  },
  timeline: [],
  debugSnapshots: [],
  mcp: {},
  discord: {
    allowLoginFailure: false,
    expectedTokenLength: 0,
    providerServerUrl: env.AIRI_URL || 'ws://localhost:6121/ws',
  },
}

function addTimeline(event: string, detail?: Record<string, unknown>) {
  report.timeline.push({
    at: new Date().toISOString(),
    event,
    detail,
  })
}

function parseBooleanEnv(value: string | undefined, fallback = false) {
  if (!value?.trim()) {
    return fallback
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
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

async function terminateExistingDiscordBotInstances() {
  const patterns = [
    resolve(repoDir, 'services', 'discord-bot'),
    '@proj-airi/discord-bot',
  ]

  for (const pattern of patterns) {
    await execFileAsync('pkill', ['-f', pattern]).catch(() => {})
  }

  await sleep(1_000)
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

function resolveConfigValue(name: string, fallbackValues: Record<string, string>) {
  const processValue = env[name]?.trim()
  if (processValue) {
    return processValue
  }

  const fileValue = fallbackValues[name]?.trim()
  if (fileValue) {
    return fileValue
  }

  return ''
}

function looksLikePlaceholderSecret(value: string) {
  const normalized = value.trim().toLowerCase()
  if (!normalized) {
    return true
  }

  return normalized.includes('replace')
    || normalized.includes('placeholder')
    || normalized.includes('example')
    || normalized.includes('your-')
    || normalized === 'changeme'
}

function createLineListener(onLine: (line: string) => void) {
  let buffer = ''

  return (chunk: { toString: (encoding: string) => string }) => {
    buffer += chunk.toString('utf-8')
    const lines = buffer.split(/\r?\n/u)
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed) {
        onLine(trimmed)
      }
    }
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

let exitCode = 0

async function main() {
  let stageProcess: ChildProcessWithoutNullStreams | undefined
  let discordBotProcess: ChildProcessWithoutNullStreams | undefined
  let mcpClient: Client | undefined
  let mainTargetClient: CdpClient | undefined
  let browserWsUrl: string | undefined
  const debugPort = await findAvailablePort(preferredDebugPort)
  const rootEnvValues = await readRootEnvValues()
  const allowLoginFailure = parseBooleanEnv(resolveConfigValue('AIRI_E2E_DISCORD_ALLOW_LOGIN_FAILURE', rootEnvValues), false)
  const openDiscordClient = parseBooleanEnv(resolveConfigValue('AIRI_E2E_DISCORD_OPEN_CLIENT', rootEnvValues), true)
  const discordToken = resolveConfigValue('AIRI_E2E_DISCORD_TOKEN', rootEnvValues)
    || resolveConfigValue('DISCORD_TOKEN', rootEnvValues)
  const discordRuntimeState: DiscordBotRuntimeState = {
    attemptedConnect: false,
    connected: false,
    receivedConfig: false,
    waitingForConfiguration: false,
  }

  report.discord.allowLoginFailure = allowLoginFailure
  report.discord.expectedTokenLength = discordToken.length

  if (looksLikePlaceholderSecret(discordToken)) {
    throw new Error(`Discord demo requires AIRI_E2E_DISCORD_TOKEN (or DISCORD_TOKEN) in process env or ${rootEnvPath}. The current value is missing or still a placeholder.`)
  }

  try {
    await mkdir(reportDir, { recursive: true })
    await mkdir(mcpSessionRoot, { recursive: true })

    addTimeline('bootstrap', { reportDir, debugPort, allowLoginFailure })
    await terminateExistingStageTamagotchiInstances()
    await terminateExistingDiscordBotInstances()
    addTimeline('terminated-stale-processes', { stage: true, discordBot: true })

    const stageLogStream = createWriteStream(stageLogPath, { flags: 'a' })
    const discordBotLogStream = createWriteStream(discordBotLogPath, { flags: 'a' })

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

    const onStageChunk = createLineListener((line) => {
      const match = line.match(/DevTools listening on (ws:\/\/\S+)/)
      if (match?.[1]) {
        browserWsUrl = match[1]
      }
    })

    stageProcess.stdout.on('data', (chunk) => {
      stageLogStream.write(chunk)
      onStageChunk(chunk)
    })
    stageProcess.stderr.on('data', (chunk) => {
      stageLogStream.write(chunk)
      onStageChunk(chunk)
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

    addTimeline('start-discord-bot')
    discordBotProcess = spawn('pnpm', ['-F', '@proj-airi/discord-bot', 'start'], {
      cwd: repoDir,
      env: {
        ...env,
        DISCORD_TOKEN: '',
        AIRI_TOKEN: env.AIRI_TOKEN || 'abcd',
        AIRI_URL: report.discord.providerServerUrl,
      },
      stdio: 'pipe',
    })

    const onDiscordBotChunk = createLineListener((line) => {
      if (line.includes('Waiting for configuration from UI')) {
        discordRuntimeState.waitingForConfiguration = true
        addTimeline('discord-bot-waiting-for-ui-config')
      }
      if (line.includes('Received Discord configuration:')) {
        discordRuntimeState.receivedConfig = true
        addTimeline('discord-bot-received-config')
      }
      if (line.includes('Connecting Discord client...')) {
        discordRuntimeState.attemptedConnect = true
        addTimeline('discord-bot-connecting')
      }
      if (line.includes('Discord client connected.')) {
        discordRuntimeState.connected = true
        addTimeline('discord-bot-connected')
      }
      if (line.includes('Discord bot ready! User:')) {
        discordRuntimeState.connected = true
        discordRuntimeState.readyUserTag = line.split('Discord bot ready! User:').at(1)?.trim() || undefined
        addTimeline('discord-bot-ready', {
          userTag: discordRuntimeState.readyUserTag,
        })
      }
      if (line.includes('Failed to apply Discord configuration.')) {
        discordRuntimeState.applyFailure = line
        addTimeline('discord-bot-apply-failure', { line })
      }
    })

    discordBotProcess.stdout.on('data', (chunk) => {
      discordBotLogStream.write(chunk)
      onDiscordBotChunk(chunk)
    })
    discordBotProcess.stderr.on('data', (chunk) => {
      discordBotLogStream.write(chunk)
      onDiscordBotChunk(chunk)
    })

    discordBotProcess.on('exit', (code, signal) => {
      addTimeline('discord-bot-exit', {
        code: code ?? undefined,
        signal: signal ?? undefined,
      })
    })

    await waitFor('discord bot startup', async () => {
      return discordRuntimeState.waitingForConfiguration ? true : undefined
    }, 45_000, 500)

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
        COMPUTER_USE_OPENABLE_APPS: 'Terminal,Cursor,Google Chrome,Electron,Discord',
        COMPUTER_USE_DENY_APPS: '1Password,Keychain,System Settings,Activity Monitor',
        COMPUTER_USE_SESSION_TAG: `airi-discord-e2e-${runId}`,
        COMPUTER_USE_ALLOWED_BOUNDS: env.COMPUTER_USE_ALLOWED_BOUNDS || '0,0,2560,1600',
        COMPUTER_USE_SESSION_ROOT: mcpSessionRoot,
      },
      stderr: 'pipe',
    })

    mcpClient = new Client({
      name: '@proj-airi/computer-use-mcp-e2e-airi-discord',
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
      name: 'desktop_focus_app',
      arguments: { app: 'Electron' },
    })
    addTimeline('desktop-focus-app', { app: 'Electron' })

    await mcpClient.callTool({
      name: 'desktop_screenshot',
      arguments: { label: 'discord-before-route' },
    })
    addTimeline('screenshot-captured', { label: 'discord-before-route' })

    await mainTargetClient.evaluate(`window.__AIRI_DEBUG__.navigateTo('/settings/modules/messaging-discord')`)
    addTimeline('navigate-to-discord-settings')

    const settingsSnapshot = await waitFor('discord settings route', async () => {
      const snapshot = await mainTargetClient!.evaluate<Record<string, any>>('window.__AIRI_DEBUG__.getSnapshot()')
      report.debugSnapshots.push(snapshot)

      const onRoute = String(snapshot.route || '').includes('/settings/modules/messaging-discord')
      const hasControls = Boolean(snapshot.discord?.hasTokenInput)
        && Boolean(snapshot.discord?.hasSaveButton)

      return onRoute && hasControls ? snapshot : undefined
    }, 30_000, 500)
    addTimeline('discord-settings-ready', {
      route: String(settingsSnapshot.route || ''),
      enabled: Boolean(settingsSnapshot.discord?.enabled),
      configured: Boolean(settingsSnapshot.discord?.configured),
    })

    await mcpClient.callTool({
      name: 'desktop_observe_windows',
      arguments: { limit: 24 },
    })
    addTimeline('desktop-observed-windows')

    if (!settingsSnapshot.discord?.enabled) {
      const checkboxFocused = await waitFor('discord checkbox focus', async () => {
        const state = await mainTargetClient!.evaluate<Record<string, any>>(`(() => {
          const checkbox = document.querySelector('input[type="checkbox"], [role="switch"], button[aria-checked], button[data-state]')
          if (!(checkbox instanceof HTMLElement)) {
            return { ok: false }
          }

          checkbox.focus()
          return {
            ok: document.activeElement === checkbox,
            checked: checkbox instanceof HTMLInputElement ? checkbox.checked : checkbox.getAttribute('aria-checked') === 'true',
            role: checkbox.getAttribute('role') || '',
            tagName: checkbox.tagName,
          }
        })()`)

        return state.ok ? state : undefined
      }, 10_000, 250)
      addTimeline('discord-checkbox-focused', {
        checked: Boolean(checkboxFocused.checked),
        role: String(checkboxFocused.role || ''),
        tagName: String(checkboxFocused.tagName || ''),
      })

      const toggle = await mcpClient.callTool({
        name: 'desktop_press_keys',
        arguments: {
          keys: ['space'],
          captureAfter: true,
        },
      })
      const toggleData = requireStructuredContent(toggle, 'desktop_press_keys')
      addTimeline('discord-checkbox-toggled', {
        status: toggleData.status,
        screenshotPath: (toggleData.screenshot as Record<string, unknown> | undefined)?.path,
      })

      const enabledSnapshot = await waitFor('discord enabled state', async () => {
        const snapshot = await mainTargetClient!.evaluate<Record<string, any>>('window.__AIRI_DEBUG__.getSnapshot()')
        report.debugSnapshots.push(snapshot)
        return snapshot.discord?.enabled ? snapshot : undefined
      }, 5_000, 250).catch(async () => {
        addTimeline('discord-toggle-keyboard-fallback')

        const fallbackSnapshot = await mainTargetClient!.evaluate<Record<string, any>>(`(() => {
          const checkbox = document.querySelector('input[type="checkbox"], [role="switch"], button[aria-checked], button[data-state]')
          if (!(checkbox instanceof HTMLElement)) {
            throw new Error('Discord toggle not found')
          }

          checkbox.click()
          return window.__AIRI_DEBUG__.getSnapshot()
        })()`)

        report.debugSnapshots.push(fallbackSnapshot)

        return await waitFor('discord enabled state after fallback click', async () => {
          const snapshot = await mainTargetClient!.evaluate<Record<string, any>>('window.__AIRI_DEBUG__.getSnapshot()')
          report.debugSnapshots.push(snapshot)
          return snapshot.discord?.enabled ? snapshot : undefined
        }, 5_000, 250)
      })

      addTimeline('discord-enabled-confirmed', {
        enabled: Boolean(enabledSnapshot.discord?.enabled),
      })
    }
    else {
      addTimeline('discord-already-enabled')
    }

    const tokenAppliedSnapshot = await mainTargetClient.evaluate<Record<string, any>>(`(() => {
      const input = document.querySelector('input[type="password"]')
      if (!(input instanceof HTMLInputElement)) {
        throw new Error('Discord token input not found')
      }

      input.focus()
      input.value = ${JSON.stringify(discordToken)}
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))

      return window.__AIRI_DEBUG__.getSnapshot()
    })()`)
    report.debugSnapshots.push(tokenAppliedSnapshot)
    addTimeline('discord-token-applied', {
      tokenLength: discordToken.length,
      appliedVia: 'renderer-evaluate',
    })

    const tokenSnapshot = await waitFor('discord token to settle', async () => {
      const snapshot = await mainTargetClient!.evaluate<Record<string, any>>('window.__AIRI_DEBUG__.getSnapshot()')
      report.debugSnapshots.push(snapshot)
      return Number(snapshot.discord?.tokenLength || 0) === discordToken.length ? snapshot : undefined
    }, 10_000, 250)
    addTimeline('discord-token-confirmed', {
      tokenLength: Number(tokenSnapshot.discord?.tokenLength || 0),
    })

    await mcpClient.callTool({
      name: 'desktop_screenshot',
      arguments: { label: 'discord-before-save' },
    })
    addTimeline('screenshot-captured', { label: 'discord-before-save' })

    const saveButtonFocused = await waitFor('discord save button focus', async () => {
      const state = await mainTargetClient!.evaluate<Record<string, any>>(`(() => {
        const passwordInput = document.querySelector('input[type="password"]')
        const buttons = Array.from(document.querySelectorAll('button'))
        const button = buttons.find((candidate) => {
          const text = candidate.textContent?.trim().toLowerCase() || ''
          if (text === 'save' || text.includes('保存')) {
            return true
          }

          if (!passwordInput) {
            return false
          }

          return Boolean(passwordInput.compareDocumentPosition(candidate) & Node.DOCUMENT_POSITION_FOLLOWING)
        })

        if (!(button instanceof HTMLButtonElement)) {
          return { ok: false }
        }

        button.focus()
        return {
          ok: document.activeElement === button,
          text: button.textContent?.trim() || '',
        }
      })()`)

      return state.ok ? state : undefined
    }, 10_000, 250)
    addTimeline('discord-save-button-focused', {
      text: String(saveButtonFocused.text || ''),
    })

    const saveResult = await mcpClient.callTool({
      name: 'desktop_press_keys',
      arguments: {
        keys: ['enter'],
        captureAfter: true,
      },
    })
    const saveData = requireStructuredContent(saveResult, 'desktop_press_keys')
    addTimeline('discord-save-submitted', {
      status: saveData.status,
      screenshotPath: (saveData.screenshot as Record<string, unknown> | undefined)?.path,
    })

    const configuredSnapshot = await waitFor('discord configured state', async () => {
      const snapshot = await mainTargetClient!.evaluate<Record<string, any>>('window.__AIRI_DEBUG__.getSnapshot()')
      report.debugSnapshots.push(snapshot)

      const tokenLength = Number(snapshot.discord?.tokenLength || 0)
      const configured = Boolean(snapshot.discord?.configured)
      const enabledState = Boolean(snapshot.discord?.enabled)

      return enabledState && configured && tokenLength === discordToken.length ? snapshot : undefined
    }, 10_000, 250)
    addTimeline('discord-ui-configured', {
      enabled: Boolean(configuredSnapshot.discord?.enabled),
      configured: Boolean(configuredSnapshot.discord?.configured),
      tokenLength: Number(configuredSnapshot.discord?.tokenLength || 0),
    })

    const botOutcome = await waitFor('discord bot configuration outcome', async () => {
      if (discordRuntimeState.connected) {
        return {
          status: 'connected',
        }
      }

      if (allowLoginFailure && discordRuntimeState.receivedConfig && discordRuntimeState.attemptedConnect && discordRuntimeState.applyFailure) {
        return {
          status: 'login-failed-but-allowed',
        }
      }

      return undefined
    }, 60_000, 500)
    addTimeline('discord-bot-outcome', botOutcome)

    if (openDiscordClient) {
      try {
        const openDiscordAppResult = await mcpClient.callTool({
          name: 'desktop_open_app',
          arguments: { app: 'Discord' },
        })
        const openDiscordAppData = requireStructuredContent(openDiscordAppResult, 'desktop_open_app')
        addTimeline('discord-client-opened', {
          status: openDiscordAppData.status,
          appName: openDiscordAppData.appName,
          windowTitle: openDiscordAppData.windowTitle,
        })

        await mcpClient.callTool({
          name: 'desktop_observe_windows',
          arguments: { limit: 24, app: 'Discord' },
        }).catch(() => undefined)

        await mcpClient.callTool({
          name: 'desktop_screenshot',
          arguments: { label: 'discord-client-opened' },
        }).catch(() => undefined)
      }
      catch (error) {
        addTimeline('discord-client-open-skipped', {
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    await mcpClient.callTool({
      name: 'desktop_screenshot',
      arguments: { label: 'discord-final' },
    })
    addTimeline('screenshot-captured', { label: 'discord-final' })

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

    report.discord.ui = {
      route: String(configuredSnapshot.route || ''),
      enabled: Boolean(configuredSnapshot.discord?.enabled),
      configured: Boolean(configuredSnapshot.discord?.configured),
      tokenLength: Number(configuredSnapshot.discord?.tokenLength || 0),
    }
    report.discord.bot = {
      ...discordRuntimeState,
    }

    if (!allowLoginFailure && !discordRuntimeState.connected) {
      throw new Error('Discord bot did not finish connecting. Provide a valid Discord bot token or rerun with AIRI_E2E_DISCORD_ALLOW_LOGIN_FAILURE=true for plumbing-only validation.')
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
      discordUiConfigured: report.discord.ui?.configured,
      discordUiEnabled: report.discord.ui?.enabled,
      tokenLength: report.discord.ui?.tokenLength,
      discordBotConnected: report.discord.bot?.connected,
      discordBotReadyUserTag: report.discord.bot?.readyUserTag,
      discordBotApplyFailure: report.discord.bot?.applyFailure,
      allowLoginFailure,
      auditLogPath: report.paths.auditLogPath,
      screenshotsDir: report.paths.screenshotsDir,
    }, null, 2))
  }
  catch (error) {
    report.status = 'failed'
    report.discord.bot = {
      ...discordRuntimeState,
    }
    report.error = error instanceof Error ? error.stack || error.message : String(error)
    addTimeline('failure', { error: report.error })
    await writeReport()
    console.error(report.error)
    exitCode = 1
  }
  finally {
    await mainTargetClient?.close().catch(() => {})
    await mcpClient?.close().catch(() => {})

    if (discordBotProcess && !discordBotProcess.killed) {
      discordBotProcess.kill('SIGINT')
      await sleep(1_500)
      if (discordBotProcess.exitCode == null) {
        discordBotProcess.kill('SIGTERM')
      }
    }

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

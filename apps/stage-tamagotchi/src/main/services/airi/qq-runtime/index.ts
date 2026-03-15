import type { ChildProcess } from 'node:child_process'

import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type {
  ElectronEnsureQqOfficialRuntimePayload,
  ElectronEnsureQqOfficialRuntimeResult,
  ElectronGetQqOfficialRuntimeLogsPayload,
  ElectronGetQqOfficialRuntimeLogsResult,
  ElectronQqRuntimeLogEntry,
} from '../../../../shared/eventa'
import type { ServerChannel } from '../channel-server'

import process, { env } from 'node:process'

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { Socket } from 'node:net'
import { dirname, join, resolve } from 'node:path'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { app } from 'electron'

import { electronEnsureQqOfficialRuntime, electronGetQqOfficialRuntimeLogs } from '../../../../shared/eventa'
import { onAppBeforeQuit } from '../../../libs/bootkit/lifecycle'

export interface QqRuntimeManager {
  ensureOfficialRuntime: (payload?: ElectronEnsureQqOfficialRuntimePayload) => Promise<ElectronEnsureQqOfficialRuntimeResult>
  getRuntimeLogs: (payload?: ElectronGetQqOfficialRuntimeLogsPayload) => ElectronGetQqOfficialRuntimeLogsResult
  stop: () => Promise<void>
}

function resolveWorkspaceRoot(): string {
  const cwd = env.PWD || process.cwd()
  if (existsSync(join(cwd, 'pnpm-workspace.yaml')))
    return cwd

  const appPath = app.getAppPath()
  const candidates = [
    resolve(appPath, '..', '..'),
    resolve(appPath, '..'),
    dirname(appPath),
  ]

  for (const candidate of candidates) {
    if (existsSync(join(candidate, 'pnpm-workspace.yaml')))
      return candidate
  }

  return cwd
}

function isRunning(processRef: ChildProcess | null): processRef is ChildProcess {
  return Boolean(processRef && !processRef.killed && processRef.exitCode === null)
}

function buildAiriWebSocketUrl(): string {
  const port = env.PORT ? Number.parseInt(env.PORT) : 6121
  const hostname = env.SERVER_RUNTIME_HOSTNAME && env.SERVER_RUNTIME_HOSTNAME !== '0.0.0.0'
    ? env.SERVER_RUNTIME_HOSTNAME
    : '127.0.0.1'

  return `ws://${hostname}:${port}/ws`
}

export function createQqRuntimeManager(params: { serverChannel: ServerChannel }): QqRuntimeManager {
  const log = useLogg('main/qq-runtime').useGlobalConfig()
  const workspaceRoot = resolveWorkspaceRoot()
  let processRef: ChildProcess | null = null
  let lastError = ''
  let processAiriUrl: string | null = null
  let runtimeReady = false
  let logSeq = 0
  const runtimeLogs: ElectronQqRuntimeLogEntry[] = []

  function appendRuntimeLog(
    level: 'info' | 'warn' | 'error',
    source: 'manager' | 'qq-bot:stdout' | 'qq-bot:stderr',
    message: string,
  ) {
    const entry: ElectronQqRuntimeLogEntry = {
      id: ++logSeq,
      at: new Date().toISOString(),
      level,
      source,
      message,
    }
    runtimeLogs.push(entry)
    if (runtimeLogs.length > 2000) {
      runtimeLogs.splice(0, runtimeLogs.length - 2000)
    }
  }

  async function waitForStartup(process: ChildProcess, timeoutMs = 1500): Promise<{ ok: boolean, error?: string }> {
    return await new Promise((resolve) => {
      let settled = false
      const timer = setTimeout(() => {
        if (settled)
          return
        settled = true
        resolve({ ok: true })
      }, timeoutMs)

      const done = (result: { ok: boolean, error?: string }) => {
        if (settled)
          return
        settled = true
        clearTimeout(timer)
        resolve(result)
      }

      process.once('error', (error) => {
        done({ ok: false, error: error.message })
      })

      process.once('exit', (code, signal) => {
        done({ ok: false, error: `qq-bot exited with code=${code ?? 'null'}, signal=${signal ?? 'none'}` })
      })
    })
  }

  async function waitForAiriWsReady(url: string, timeoutMs = 8000): Promise<void> {
    const target = new URL(url)
    const port = Number(target.port || (target.protocol === 'wss:' ? 443 : 80))
    const host = target.hostname
    const deadline = Date.now() + timeoutMs
    let lastError = 'unknown'

    while (Date.now() < deadline) {
      const ok = await new Promise<boolean>((resolve) => {
        const socket = new Socket()
        let settled = false

        const done = (result: boolean, error?: string) => {
          if (settled)
            return
          settled = true
          if (error)
            lastError = error
          socket.destroy()
          resolve(result)
        }

        socket.setTimeout(1000)
        socket.once('connect', () => done(true))
        socket.once('timeout', () => done(false, 'tcp connect timeout'))
        socket.once('error', error => done(false, error.message))
        socket.connect(port, host)
      })

      if (ok)
        return

      await new Promise(resolve => setTimeout(resolve, 200))
    }

    throw new Error(`AIRI websocket endpoint is not ready (${host}:${port}), lastError=${lastError}`)
  }

  async function ensureOfficialRuntime(payload?: ElectronEnsureQqOfficialRuntimePayload): Promise<ElectronEnsureQqOfficialRuntimeResult> {
    await params.serverChannel.start()
    let airiUrl = buildAiriWebSocketUrl()
    appendRuntimeLog('info', 'manager', `Ensuring runtime, AIRI_URL=${airiUrl}`)

    if (isRunning(processRef)) {
      if (!processAiriUrl || processAiriUrl !== airiUrl) {
        const from = processAiriUrl || 'unknown'
        appendRuntimeLog('warn', 'manager', `AIRI_URL changed/unknown (${from} -> ${airiUrl}), restarting qq-bot`)
        await stop()
      }
      else {
        appendRuntimeLog('info', 'manager', `qq-bot already running (pid=${processRef.pid ?? 'unknown'})`)
        return {
          running: true,
          ready: runtimeReady,
          pid: processRef.pid ?? null,
          airiUrl,
          error: lastError || undefined,
        }
      }
    }

    lastError = ''
    runtimeReady = false
    appendRuntimeLog('info', 'manager', `Waiting AIRI websocket endpoint ready: ${airiUrl}`)
    try {
      await waitForAiriWsReady(airiUrl)
    }
    catch (error) {
      const firstError = error instanceof Error ? error.message : String(error)
      appendRuntimeLog('warn', 'manager', `AIRI websocket not ready on first check: ${firstError}`)
      appendRuntimeLog('info', 'manager', 'Retrying AIRI websocket readiness without restarting server...')

      try {
        await params.serverChannel.start()
      }
      catch (ensureError) {
        const message = ensureError instanceof Error ? ensureError.message : String(ensureError)
        appendRuntimeLog('error', 'manager', `Failed to ensure AIRI websocket server: ${message}`)
        return {
          running: false,
          ready: runtimeReady,
          pid: null,
          airiUrl,
          error: `Failed to ensure AIRI websocket server: ${message}`,
        }
      }

      airiUrl = buildAiriWebSocketUrl()
      appendRuntimeLog('info', 'manager', `Retrying AIRI websocket readiness: ${airiUrl}`)

      try {
        await waitForAiriWsReady(airiUrl)
      }
      catch (secondError) {
        const message = secondError instanceof Error ? secondError.message : String(secondError)
        appendRuntimeLog('error', 'manager', message)
        return {
          running: false,
          ready: runtimeReady,
          pid: null,
          airiUrl,
          error: message,
        }
      }
    }

    log.log(`Starting qq-bot process with AIRI_URL=${airiUrl}`)
    appendRuntimeLog('info', 'manager', `Starting qq-bot process from workspace root: ${workspaceRoot}`)
    const officialToken = payload?.officialToken?.trim() ?? ''
    appendRuntimeLog('info', 'manager', `Bootstrapping qq-bot with QQ_OFFICIAL_TOKEN=${officialToken ? 'provided' : 'empty'}`)
    const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
    processRef = spawn(pnpmCommand, ['-F', '@proj-airi/qq-bot', 'start'], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        AIRI_URL: airiUrl,
        QQ_OFFICIAL_TOKEN: officialToken,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    processRef.stdout?.on('data', (data) => {
      const text = data.toString('utf-8').trim()
      if (text) {
        if (text.includes('QQ gateway session is ready')) {
          runtimeReady = true
          lastError = ''
        }

        log.log(`[qq-bot] ${text}`)
        appendRuntimeLog('info', 'qq-bot:stdout', text)
      }
    })

    processRef.stderr?.on('data', (data) => {
      const text = data.toString('utf-8').trim()
      if (text) {
        if (text.includes('AIRI websocket error') || text.includes('Failed to connect QQ gateway')) {
          runtimeReady = false
          lastError = text
        }

        log.warn(`[qq-bot] ${text}`)
        appendRuntimeLog('warn', 'qq-bot:stderr', text)
      }
    })

    processRef.on('error', (error) => {
      lastError = error.message
      log.withError(error).error('qq-bot process error')
      appendRuntimeLog('error', 'manager', `qq-bot process error: ${error.message}`)
    })

    processRef.on('exit', (code, signal) => {
      if (code && code !== 0) {
        lastError = `qq-bot exited with code=${code}, signal=${signal ?? 'none'}`
        log.warn(lastError)
        appendRuntimeLog('error', 'manager', lastError)
      }
      else {
        appendRuntimeLog('warn', 'manager', `qq-bot process exited (code=${code ?? 'null'}, signal=${signal ?? 'none'})`)
      }
      processRef = null
      processAiriUrl = null
      runtimeReady = false
    })

    const spawnedProcess = processRef
    if (!spawnedProcess) {
      appendRuntimeLog('error', 'manager', 'qq-bot process failed to spawn')
      return {
        running: false,
        ready: runtimeReady,
        pid: null,
        airiUrl,
        error: 'qq-bot process failed to spawn',
      }
    }

    const startupResult = await waitForStartup(spawnedProcess)
    if (!startupResult.ok) {
      lastError = startupResult.error || 'qq-bot failed to start'
      appendRuntimeLog('error', 'manager', lastError)
      return {
        running: false,
        ready: runtimeReady,
        pid: spawnedProcess.pid ?? null,
        airiUrl,
        error: lastError,
      }
    }

    processAiriUrl = airiUrl
    appendRuntimeLog('info', 'manager', `qq-bot started successfully (pid=${spawnedProcess.pid ?? 'unknown'})`)

    return {
      running: true,
      ready: runtimeReady,
      pid: processRef.pid ?? null,
      airiUrl,
      error: lastError || undefined,
    }
  }

  function getRuntimeLogs(payload?: ElectronGetQqOfficialRuntimeLogsPayload): ElectronGetQqOfficialRuntimeLogsResult {
    const afterId = payload?.afterId ?? 0
    const limit = Math.max(1, Math.min(payload?.limit ?? 200, 1000))
    const logs = runtimeLogs.filter(log => log.id > afterId).slice(-limit)

    return {
      logs,
      running: isRunning(processRef),
      pid: processRef?.pid ?? null,
    }
  }

  async function stop(): Promise<void> {
    if (!isRunning(processRef))
      return

    const pid = processRef.pid
    processRef.kill('SIGTERM')
    log.log(`Stopped qq-bot process pid=${pid ?? 'unknown'}`)
    appendRuntimeLog('info', 'manager', `Stopped qq-bot process pid=${pid ?? 'unknown'}`)
    processRef = null
    processAiriUrl = null
    runtimeReady = false
  }

  onAppBeforeQuit(async () => {
    await stop()
  })

  return {
    ensureOfficialRuntime,
    getRuntimeLogs,
    stop,
  }
}

export function createQqRuntimeService(params: { context: ReturnType<typeof createContext>['context'], manager: QqRuntimeManager }) {
  defineInvokeHandler(params.context, electronEnsureQqOfficialRuntime, async (payload) => {
    return await params.manager.ensureOfficialRuntime(payload)
  })
  defineInvokeHandler(params.context, electronGetQqOfficialRuntimeLogs, async (payload) => {
    return params.manager.getRuntimeLogs(payload)
  })
}

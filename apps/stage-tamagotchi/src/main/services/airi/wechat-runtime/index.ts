import type { ChildProcess } from 'node:child_process'

import type { createContext } from '@moeru/eventa/adapters/electron/main'

import type { ElectronEnsureWeChatRuntimePayload, ElectronEnsureWeChatRuntimeResult } from '../../../../shared/eventa'
import type { ServerChannel } from '../channel-server'

import process, { env } from 'node:process'

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { app } from 'electron'

import { electronEnsureWeChatRuntime } from '../../../../shared/eventa'
import { onAppBeforeQuit } from '../../../libs/bootkit/lifecycle'

export interface WeChatRuntimeManager {
  ensureRuntime: (payload?: ElectronEnsureWeChatRuntimePayload) => Promise<ElectronEnsureWeChatRuntimeResult>
  stop: () => Promise<void>
}

function resolveWorkspaceRoot(): string {
  if (env.AIRI_WORKSPACE_ROOT)
    return env.AIRI_WORKSPACE_ROOT

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

function isRunning(proc: ChildProcess | null): boolean {
  if (!proc)
    return false
  if (proc.exitCode !== null)
    return false
  if (proc.signalCode !== null)
    return false
  if (proc.killed)
    return false
  return true
}

export function createWeChatRuntimeManager(params: { serverChannel: ServerChannel }): WeChatRuntimeManager {
  const log = useLogg('main/wechat-runtime').useGlobalConfig()
  const workspaceRoot = resolveWorkspaceRoot()
  const sessionStoragePath = join(app.getPath('userData'), 'airi', 'wechat-session.json')
  let processRef: ChildProcess | null = null
  let lastError = ''
  let processAiriUrl: string | null = null
  let runtimeReady = false

  function buildAiriWebSocketUrl(): string {
    const port = env.PORT ? Number.parseInt(env.PORT) : 6121
    const hostname = env.SERVER_RUNTIME_HOSTNAME && env.SERVER_RUNTIME_HOSTNAME !== '0.0.0.0'
      ? env.SERVER_RUNTIME_HOSTNAME
      : '127.0.0.1'

    return `ws://${hostname}:${port}/ws`
  }

  async function ensureRuntime(_payload?: ElectronEnsureWeChatRuntimePayload): Promise<ElectronEnsureWeChatRuntimeResult> {
    await params.serverChannel.start()
    const airiUrl = buildAiriWebSocketUrl()

    if (isRunning(processRef)) {
      if (!processAiriUrl || processAiriUrl !== airiUrl) {
        log.warn(`AIRI_URL changed (${processAiriUrl} -> ${airiUrl}), restarting wechat-bot`)
        await stop()
      }
      else {
        return {
          running: true,
          ready: runtimeReady,
          pid: processRef?.pid ?? null,
          airiUrl,
          error: lastError || undefined,
        }
      }
    }

    lastError = ''
    runtimeReady = false

    log.log(`Starting wechat-bot process with AIRI_URL=${airiUrl}, session=${sessionStoragePath}`)
    const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
    processRef = spawn(pnpmCommand, ['-F', '@proj-airi/wechat-bot', 'start'], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        AIRI_URL: airiUrl,
        AIRI_WECHAT_SESSION_PATH: sessionStoragePath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    processRef.stdout?.on('data', (data) => {
      const text = data.toString('utf-8').trim()
      if (text) {
        if (
          text.includes('Connected to WeChat')
          || text.includes('微信已连接')
          || text.includes('微信会话已恢复')
          || text.includes('[wechat:session] restored successfully')
        ) {
          runtimeReady = true
        }
      }
    })

    processRef.stderr?.on('data', (data) => {
      const text = data.toString('utf-8').trim()
      if (text) {
        if (text.includes('[wechat:monitor] session expired')) {
          runtimeReady = false
          lastError = 'wechat session expired'
        }
      }
    })

    processRef.on('error', (error) => {
      lastError = error.message
      log.withError(error).error('wechat-bot process error')
    })

    processRef.on('exit', (code, signal) => {
      if (code && code !== 0) {
        lastError = `wechat-bot exited with code=${code}, signal=${signal ?? 'none'}`
        log.warn(lastError)
      }
      processRef = null
      processAiriUrl = null
      runtimeReady = false
    })

    if (!processRef) {
      return {
        running: false,
        ready: false,
        pid: null,
        airiUrl,
        error: 'wechat-bot process failed to spawn',
      }
    }

    processAiriUrl = airiUrl

    return {
      running: true,
      ready: runtimeReady,
      pid: processRef.pid ?? null,
      airiUrl,
      error: lastError || undefined,
    }
  }

  async function stop(): Promise<void> {
    if (!isRunning(processRef))
      return

    const pid = processRef?.pid
    processRef?.kill('SIGTERM')
    log.log(`Stopped wechat-bot process pid=${pid ?? 'unknown'}`)
    processRef = null
    processAiriUrl = null
    runtimeReady = false
  }

  onAppBeforeQuit(async () => {
    await stop()
  })

  return {
    ensureRuntime,
    stop,
  }
}

export function createWeChatRuntimeService(params: { context: ReturnType<typeof createContext>['context'], manager: WeChatRuntimeManager }) {
  defineInvokeHandler(params.context, electronEnsureWeChatRuntime, async (payload) => {
    return await params.manager.ensureRuntime(payload)
  })
}

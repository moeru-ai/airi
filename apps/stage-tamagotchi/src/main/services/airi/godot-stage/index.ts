import type { ChildProcessByStdio } from 'node:child_process'
import type { Readable } from 'node:stream'

import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'

import type {
  ElectronGodotStageSceneInputPayload,
  ElectronGodotStageStatus,
} from '../../../../shared/eventa'

import process from 'node:process'

import { spawn } from 'node:child_process'
import { access, mkdir, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { Mutex } from 'async-mutex'
import { plugin as ws } from 'crossws/server'
import { app } from 'electron'
import { getRandomPort } from 'get-port-please'
import { defineWebSocketHandler, H3, serve } from 'h3'

import {
  electronGodotStageApplySceneInput,
  electronGodotStageGetStatus,
  electronGodotStageStart,
  electronGodotStageStatusChanged,
  electronGodotStageStop,
} from '../../../../shared/eventa'
import { onAppBeforeQuit } from '../../../libs/bootkit/lifecycle'
import { getElectronMainDirname } from '../../../libs/electron/location'

type MainContext = ReturnType<typeof createContext>['context']
type GodotStageWebSocketHooks = Exclude<Parameters<typeof defineWebSocketHandler>[0], (...args: never[]) => unknown>
type GodotStagePeer = Parameters<NonNullable<GodotStageWebSocketHooks['open']>>[0]
type GodotStageMessage = Parameters<NonNullable<GodotStageWebSocketHooks['message']>>[1]
type GodotStageProcess = ChildProcessByStdio<null, Readable, Readable>

interface Deferred<T> {
  promise: Promise<T>
  reject: (error?: unknown) => void
  resolve: (value: T | PromiseLike<T>) => void
}

interface GodotStageSocketRuntime {
  port: number
  server: ReturnType<typeof serve>
  token: string
}

interface GodotStageSceneApplyPayload {
  format: string
  modelId: string
  name: string
  path: string
}

interface GodotStageSocketEnvelope {
  payload?: unknown
  type: string
}

/**
 * Godot sidecar lifecycle controller owned by Electron main.
 *
 * Use when:
 * - Renderer windows need to start or stop the external Godot stage
 * - The selected model should be materialized and forwarded to the Godot runtime
 *
 * Expects:
 * - Production: pre-exported binary in `extraResources/godot-stage/`
 * - Dev: `GODOT4` env var points to a local Godot 4.x .NET/Mono executable
 * - The current workspace contains `engines/stage-tamagotchi-godot/project.godot` (dev mode only)
 *
 * Returns:
 * - Lifecycle helpers, scene-input forwarding, and status subscriptions
 */
export interface GodotStageManager {
  applySceneInput: (payload: ElectronGodotStageSceneInputPayload) => Promise<void>
  getStatus: () => ElectronGodotStageStatus
  start: () => Promise<ElectronGodotStageStatus>
  stop: () => Promise<ElectronGodotStageStatus>
  subscribe: (callback: (status: ElectronGodotStageStatus) => void) => () => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve']
  let reject!: Deferred<T>['reject']

  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return {
    promise,
    reject,
    resolve,
  }
}

function createInitialStatus(): ElectronGodotStageStatus {
  return {
    state: 'stopped',
    pid: null,
    updatedAt: Date.now(),
  }
}

function createSocketEnvelope(type: string, payload?: unknown) {
  return JSON.stringify({ type, payload })
}

function normalizeFileName(fileName: string) {
  const normalized = basename(fileName.trim())
  return normalized || 'model.bin'
}

function parseSocketMessage(message: GodotStageMessage): GodotStageSocketEnvelope {
  const text = message.text()
  return JSON.parse(text) as GodotStageSocketEnvelope
}

function getPayloadMessage(payload: unknown) {
  if (!payload || typeof payload !== 'object') {
    return undefined
  }

  const message = (payload as Record<string, unknown>).message
  return typeof message === 'string' ? message : undefined
}

interface GodotBinaryResolution {
  executable: string
  mode: 'engine' | 'exported'
}

/**
 * Resolves the Godot project path by walking up from the Electron main
 * bundle directory until `engines/stage-tamagotchi-godot/project.godot` is found.
 *
 * Use when:
 * - Dev mode needs to point the Godot engine at the project directory
 *
 * Returns:
 * - Absolute path to the Godot project directory
 */
async function resolveGodotProjectPath() {
  let currentDirectory = getElectronMainDirname()

  while (true) {
    const projectPath = resolve(currentDirectory, 'engines', 'stage-tamagotchi-godot')

    try {
      await access(join(projectPath, 'project.godot'))
      return projectPath
    }
    catch {}

    const parentDirectory = dirname(currentDirectory)
    if (parentDirectory === currentDirectory) {
      break
    }

    currentDirectory = parentDirectory
  }

  throw new Error(`Unable to locate engines/stage-tamagotchi-godot/project.godot from ${getElectronMainDirname()}.`)
}

/**
 * Resolves the Godot binary for production mode.
 *
 * Looks for the pre-exported standalone binary bundled via electron-builder
 * `extraResources` at `<resourcesPath>/godot-stage/`.
 *
 * Returns:
 * - Path to the exported binary, or undefined if not found
 */
async function resolveExportedGodotBinary(): Promise<string | undefined> {
  const platform = process.platform
  let binaryName: string

  if (platform === 'win32') {
    binaryName = 'godot-stage.exe'
  }
  else if (platform === 'darwin') {
    binaryName = join('godot-stage.app', 'Contents', 'MacOS', 'godot-stage')
  }
  else {
    binaryName = 'godot-stage'
  }

  const binaryPath = join(process.resourcesPath, 'godot-stage', binaryName)

  try {
    await access(binaryPath)
    return binaryPath
  }
  catch {
    return undefined
  }
}

/**
 * Validates the explicitly configured dev-mode Godot executable.
 *
 * Use when:
 * - Dev mode is about to spawn the local Godot engine
 *
 * Expects:
 * - `GODOT4` points to a Godot 4.x .NET/Mono executable file
 *
 * Returns:
 * - Throws a configuration error before spawn when the path is invalid
 */
async function validateConfiguredGodotEnginePath(executable: string) {
  let executableStats
  try {
    executableStats = await stat(executable)
  }
  catch (error) {
    throw new Error(
      'GODOT4 points to a missing Godot executable.\n'
      + `Configured path: ${executable}\n`
      + 'Set GODOT4 to the absolute path of your Godot 4.x .NET/Mono executable before starting dev mode.\n'
      + `Original error: ${errorMessageFrom(error) ?? 'unknown error'}`,
    )
  }

  if (!executableStats.isFile()) {
    throw new Error(
      'GODOT4 must point to the Godot executable file, not a directory or app bundle.\n'
      + `Configured path: ${executable}\n`
      + 'Examples:\n'
      + '  Windows: C:\\Path\\To\\Godot_v4.x-stable_mono_win64.exe\n'
      + '  macOS: /Applications/Godot_mono.app/Contents/MacOS/Godot\n'
      + '  Linux: /path/to/Godot_v4.x-stable_mono_linux.x86_64',
    )
  }
}

/**
 * Resolves the Godot binary and execution mode.
 *
 * Use when:
 * - The Godot stage is about to be spawned
 *
 * Expects:
 * - Production: exported binary in `extraResources/godot-stage/`
 * - Dev: `GODOT4` env var points to a local Godot 4.x .NET/Mono executable
 *
 * Returns:
 * - `{ executable, mode }` where mode determines spawn arguments
 */
async function resolveGodotBinary(): Promise<GodotBinaryResolution> {
  if (app.isPackaged) {
    const exported = await resolveExportedGodotBinary()
    if (exported) {
      return { executable: exported, mode: 'exported' }
    }

    throw new Error(
      'Godot stage exported binary not found. '
      + `Expected at: ${join(process.resourcesPath, 'godot-stage')}`,
    )
  }

  const envPath = process.env.GODOT4?.trim()
  if (!envPath) {
    throw new Error(
      'GODOT4 is required to start Godot Stage in development mode.\n'
      + 'Set GODOT4 to the absolute path of your Godot 4.x .NET/Mono executable, then restart the Electron dev app.\n'
      + 'Examples:\n'
      + '  PowerShell: $env:GODOT4 = "C:\\Path\\To\\Godot_v4.x-stable_mono_win64.exe"\n'
      + '  Bash: export GODOT4="/path/to/godot"',
    )
  }

  await validateConfiguredGodotEnginePath(envPath)
  return { executable: envPath, mode: 'engine' }
}

/**
 * Creates the shared Godot stage manager.
 *
 * Call stack:
 *
 * setupGodotStageManager
 *   -> {@link createGodotStageManager}
 *     -> renderer invoke handlers
 *       -> Godot sidecar process + websocket bridge
 */
export function createGodotStageManager(): GodotStageManager {
  const log = useLogg('main/godot-stage').useGlobalConfig()
  const lifecycleMutex = new Mutex()
  const listeners = new Set<(status: ElectronGodotStageStatus) => void>()
  let currentStatus = createInitialStatus()
  let currentProcess: GodotStageProcess | undefined
  let currentProcessExit = createDeferred<void>()
  let currentReady: Deferred<void> | undefined
  let currentSceneInput: GodotStageSceneApplyPayload | undefined
  let currentSocketRuntime: GodotStageSocketRuntime | undefined
  let currentSocketPeer: GodotStagePeer | undefined
  let expectedProcessExit = false

  function broadcastStatus(status: ElectronGodotStageStatus) {
    currentStatus = status

    for (const listener of listeners) {
      try {
        listener(currentStatus)
      }
      catch (error) {
        log.withError(error).warn('failed to publish Godot stage status change')
      }
    }
  }

  function setStatus(next: Partial<ElectronGodotStageStatus> & Pick<ElectronGodotStageStatus, 'state'>) {
    broadcastStatus({
      ...currentStatus,
      ...next,
      updatedAt: Date.now(),
    })
  }

  function clearProcessState() {
    currentProcess = undefined
    currentSocketPeer = undefined
    currentProcessExit.resolve()
    currentProcessExit = createDeferred<void>()
  }

  async function stopSocketRuntime() {
    const runtime = currentSocketRuntime
    currentSocketRuntime = undefined
    currentSocketPeer = undefined

    if (!runtime) {
      return
    }

    await runtime.server.close(true).catch(() => {})
  }

  async function stopProcessAfterFailedStart() {
    if (!currentProcess) {
      return
    }

    const activeProcess = currentProcess
    const exitPromise = currentProcessExit.promise
    expectedProcessExit = true

    // Startup failed after spawning Godot; release the child process before
    // allowing the renderer to retry and create another stage runtime.
    activeProcess.kill()

    await Promise.race([
      exitPromise,
      new Promise<void>(resolve => setTimeout(resolve, 2_000)),
    ]).catch(() => {})
  }

  function sendSocketMessage(type: string, payload?: unknown) {
    if (!currentSocketPeer) {
      return
    }

    currentSocketPeer.send(createSocketEnvelope(type, payload))
  }

  async function sendSceneInputToGodot(payload: GodotStageSceneApplyPayload) {
    currentSceneInput = payload

    if (!currentSocketPeer) {
      return
    }

    sendSocketMessage('host.scene.apply', payload)
  }

  function handleSocketMessage(message: GodotStageSocketEnvelope) {
    switch (message.type) {
      case 'stage.ready': {
        setStatus({
          state: 'running',
          pid: currentProcess?.pid ?? null,
          lastError: undefined,
        })
        currentReady?.resolve()
        currentReady = undefined

        if (currentSceneInput) {
          void sendSceneInputToGodot(currentSceneInput)
        }
        return
      }
      case 'stage.fatal': {
        const error = getPayloadMessage(message.payload) ?? 'Godot stage reported a fatal startup error.'
        setStatus({
          state: 'error',
          pid: currentProcess?.pid ?? null,
          lastError: error,
        })
        currentReady?.reject(new Error(error))
        currentReady = undefined
        currentProcess?.kill()
        return
      }
      case 'scene.applied': {
        if (currentStatus.state === 'running' && currentStatus.lastError) {
          setStatus({
            state: 'running',
            pid: currentProcess?.pid ?? null,
            lastError: undefined,
          })
        }
        return
      }
      case 'scene.error': {
        const error = getPayloadMessage(message.payload) ?? 'Godot stage failed to apply scene input.'
        setStatus({
          state: currentStatus.state === 'running' ? 'running' : currentStatus.state,
          pid: currentProcess?.pid ?? null,
          lastError: error,
        })
        return
      }
      default: {
        log.withFields({ type: message.type }).debug('received unknown Godot stage message')
      }
    }
  }

  async function startSocketRuntime() {
    if (currentSocketRuntime) {
      return currentSocketRuntime
    }

    const host = '127.0.0.1'
    const port = await getRandomPort(host)
    const token = Math.random().toString(36).slice(2)
    const appServer = new H3()

    appServer.get('/ws', defineWebSocketHandler({
      open: (peer) => {
        const requestUrl = peer.request.url ?? ''
        const url = new URL(requestUrl, `ws://${host}:${port}`)
        if (url.searchParams.get('token') !== token) {
          peer.close?.()
          return
        }

        currentSocketPeer = peer
        log.withFields({ peer: peer.id }).debug('Godot websocket connected')
      },
      message: (_peer, message) => {
        try {
          handleSocketMessage(parseSocketMessage(message))
        }
        catch (error) {
          log.withError(error).warn('failed to parse Godot websocket message')
        }
      },
      close: (peer) => {
        if (currentSocketPeer?.id === peer.id) {
          currentSocketPeer = undefined
        }
      },
    }))

    const server = serve(appServer, {
      // @ts-expect-error - h3 does not extend the crossws response type.
      plugins: [ws({ resolve: async req => (await appServer.fetch(req)).crossws })],
      port,
      hostname: host,
      manual: true,
      reusePort: false,
      silent: true,
      gracefulShutdown: {
        forceTimeout: 0.25,
        gracefulTimeout: 0.25,
      },
    })

    await server.serve()

    currentSocketRuntime = {
      port,
      server,
      token,
    }

    return currentSocketRuntime
  }

  function attachProcessListeners(processHandle: GodotStageProcess) {
    processHandle.stdout.on('data', (data) => {
      const message = data.toString('utf-8').trim()
      if (message) {
        log.log(message)
      }
    })

    processHandle.stderr.on('data', (data) => {
      const message = data.toString('utf-8').trim()
      if (message) {
        log.warn(message)
      }
    })

    processHandle.on('error', (error) => {
      const message = errorMessageFrom(error) ?? 'Failed to spawn Godot stage process.'
      setStatus({
        state: 'error',
        pid: processHandle.pid ?? null,
        lastError: message,
      })
      currentReady?.reject(error)
      currentReady = undefined
    })

    processHandle.on('close', (code, signal) => {
      const exitMessage = signal
        ? `Godot stage exited with signal ${signal}.`
        : `Godot stage exited with code ${code ?? 0}.`

      clearProcessState()
      void stopSocketRuntime()

      if (expectedProcessExit) {
        setStatus({
          state: 'stopped',
          pid: null,
          lastError: undefined,
        })
      }
      else {
        setStatus({
          state: 'error',
          pid: null,
          lastError: exitMessage,
        })
      }

      currentReady?.reject(new Error(exitMessage))
      currentReady = undefined
      expectedProcessExit = false
    })
  }

  return {
    subscribe(callback) {
      listeners.add(callback)
      callback(currentStatus)

      return () => {
        listeners.delete(callback)
      }
    },
    getStatus() {
      return currentStatus
    },
    async start() {
      return await lifecycleMutex.runExclusive(async () => {
        try {
          if (currentProcess && currentStatus.state === 'running') {
            return currentStatus
          }

          if (currentProcess && currentStatus.state === 'starting' && currentReady) {
            await currentReady.promise
            return currentStatus
          }

          await stopSocketRuntime()

          const socketRuntime = await startSocketRuntime()
          const godotBinary = await resolveGodotBinary()
          const websocketUrl = `ws://127.0.0.1:${socketRuntime.port}/ws?token=${socketRuntime.token}`
          const readyDeferred = createDeferred<void>()
          const readyTimeout = setTimeout(() => {
            readyDeferred.reject(new Error('Godot stage did not report ready in time.'))
          }, 20_000)

          currentReady = readyDeferred
          expectedProcessExit = false
          setStatus({
            state: 'starting',
            pid: null,
            lastError: undefined,
          })

          let spawnArgs: string[]
          let spawnCwd: string | undefined

          if (godotBinary.mode === 'engine') {
            const godotProjectPath = await resolveGodotProjectPath()
            spawnArgs = ['--path', godotProjectPath, '--', `--airi-ws-url=${websocketUrl}`]
            spawnCwd = godotProjectPath
          }
          else {
            spawnArgs = ['--', `--airi-ws-url=${websocketUrl}`]
          }

          log.withFields({ executable: godotBinary.executable, mode: godotBinary.mode }).log('spawning Godot stage')

          const processHandle = spawn(
            godotBinary.executable,
            spawnArgs,
            {
              cwd: spawnCwd,
              stdio: ['ignore', 'pipe', 'pipe'],
              windowsHide: false,
            },
          )

          currentProcess = processHandle
          attachProcessListeners(processHandle)

          setStatus({
            state: 'starting',
            pid: processHandle.pid ?? null,
            lastError: undefined,
          })

          try {
            await readyDeferred.promise
          }
          finally {
            if (currentReady === readyDeferred)
              currentReady = undefined
            clearTimeout(readyTimeout)
          }

          return currentStatus
        }
        catch (error) {
          await stopProcessAfterFailedStart()
          await stopSocketRuntime()
          setStatus({
            state: 'error',
            pid: null,
            lastError: errorMessageFrom(error) ?? 'Failed to start Godot stage.',
          })
          throw error
        }
      })
    },
    async stop() {
      return await lifecycleMutex.runExclusive(async () => {
        if (!currentProcess) {
          await stopSocketRuntime()
          setStatus({
            state: 'stopped',
            pid: null,
            lastError: undefined,
          })
          return currentStatus
        }

        const activeProcess = currentProcess
        const exitPromise = currentProcessExit.promise

        expectedProcessExit = true
        setStatus({
          state: 'stopping',
          pid: activeProcess.pid ?? null,
          lastError: undefined,
        })

        try {
          sendSocketMessage('host.shutdown')

          const exited = await Promise.race([
            exitPromise.then(() => true),
            new Promise<boolean>(resolve => setTimeout(resolve, 2_000, false)),
          ])

          if (!exited) {
            activeProcess.kill()
            await exitPromise.catch(() => {})
          }
        }
        catch (error) {
          setStatus({
            state: 'error',
            pid: activeProcess.pid ?? null,
            lastError: errorMessageFrom(error) ?? 'Failed to stop Godot stage.',
          })
          throw error
        }
        finally {
          await stopSocketRuntime()
        }

        setStatus({
          state: 'stopped',
          pid: null,
          lastError: undefined,
        })

        return currentStatus
      })
    },
    async applySceneInput(payload) {
      await lifecycleMutex.runExclusive(async () => {
        if (currentStatus.state !== 'starting' && currentStatus.state !== 'running') {
          throw new Error('Godot stage is not running.')
        }

        const fileName = normalizeFileName(payload.fileName)
        const modelDirectory = join(app.getPath('userData'), 'godot-stage', 'models', payload.modelId)
        const materializedPath = join(modelDirectory, fileName)

        await mkdir(modelDirectory, { recursive: true })
        await writeFile(materializedPath, payload.data)

        await sendSceneInputToGodot({
          modelId: payload.modelId,
          format: payload.format,
          name: payload.name,
          path: materializedPath,
        })
      })
    },
  }
}

/**
 * Creates and wires the shared Godot stage manager into app lifecycle hooks.
 *
 * Use when:
 * - Electron main needs one app-wide Godot sidecar lifecycle owner
 *
 * Expects:
 * - App shutdown to call the registered `onAppBeforeQuit` hook
 *
 * Returns:
 * - The ready-to-use Godot stage manager
 */
export function setupGodotStageManager() {
  const manager = createGodotStageManager()

  onAppBeforeQuit(async () => {
    await manager.stop()
  })

  return manager
}

/**
 * Registers Godot stage invoke handlers for one Electron window context.
 *
 * Call stack:
 *
 * createGodotStageService
 *   -> renderer invoke/eventa handlers
 *     -> {@link GodotStageManager}
 */
export function createGodotStageService(params: {
  context: MainContext
  manager: GodotStageManager
  window: BrowserWindow
}) {
  const unsubscribe = params.manager.subscribe((status) => {
    if (!params.window.isDestroyed()) {
      params.context.emit(electronGodotStageStatusChanged, status)
    }
  })

  const cleanups: Array<() => void> = [
    unsubscribe,
    defineInvokeHandler(params.context, electronGodotStageStart, async () => await params.manager.start()),
    defineInvokeHandler(params.context, electronGodotStageStop, async () => await params.manager.stop()),
    defineInvokeHandler(params.context, electronGodotStageGetStatus, async () => params.manager.getStatus()),
    defineInvokeHandler(params.context, electronGodotStageApplySceneInput, async (payload) => {
      await params.manager.applySceneInput(payload)
    }),
  ]

  const cleanup = () => {
    for (const fn of cleanups) {
      fn()
    }
  }

  params.window.on('closed', cleanup)
  return cleanup
}

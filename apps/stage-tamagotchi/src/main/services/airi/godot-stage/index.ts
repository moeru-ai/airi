import type { ChildProcessByStdio } from 'node:child_process'
import type { Readable } from 'node:stream'

import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type {
  StageViewErrorPayload,
  StageViewPatch,
  StageViewRequestAckPayload,
  StageViewSnapshotPayload,
} from '@proj-airi/stage-shared/godot-stage'
import type { BrowserWindow } from 'electron'
import type { InferOutput } from 'valibot'

import type {
  ElectronGodotStageSceneInputPayload,
  ElectronGodotStageStatus,
} from '../../../../shared/eventa'

import process from 'node:process'

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { access, mkdir, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'

import { useLogg } from '@guiiai/logg'
import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import {
  parseStageViewErrorPayload,
  parseStageViewPatchPayload,
  parseStageViewSnapshotPayload,
} from '@proj-airi/stage-shared/godot-stage'
import { Mutex } from 'async-mutex'
import { plugin as ws } from 'crossws/server'
import { safeDestr } from 'destr'
import { app } from 'electron'
import { getRandomPort } from 'get-port-please'
import { defineWebSocketHandler, H3, serve } from 'h3'
import { instance, literal, object, optional, safeParse, string, unknown as unknownSchema } from 'valibot'

import {
  electronGodotStageApplySceneInput,
  electronGodotStageApplyViewPatch,
  electronGodotStageGetStatus,
  electronGodotStageGetViewSnapshot,
  electronGodotStageRequestViewSnapshot,
  electronGodotStageStart,
  electronGodotStageStatusChanged,
  electronGodotStageStop,
  electronGodotStageViewSnapshotChanged,
  electronGodotStageViewStateError,
} from '../../../../shared/eventa'
import { onAppBeforeQuit } from '../../../libs/bootkit/lifecycle'
import { getElectronMainDirname } from '../../../libs/electron/location'

type MainContext = ReturnType<typeof createContext>['context']
type GodotStageWebSocketHooks = Exclude<Parameters<typeof defineWebSocketHandler>[0], (...args: never[]) => unknown>
type GodotStagePeer = Parameters<NonNullable<GodotStageWebSocketHooks['open']>>[0]
type GodotStageMessage = Parameters<NonNullable<GodotStageWebSocketHooks['message']>>[1]
type GodotStageProcess = ChildProcessByStdio<null, Readable, Readable>

const DEFAULT_GODOT_REMOTE_DEBUG_URI = 'tcp://127.0.0.1:6007'

interface Deferred<T> {
  promise: Promise<T>
  reject: (error?: unknown) => void
  resolve: (value: T | PromiseLike<T>) => void
}

interface ListenerChannel<T> {
  publish: (payload: T) => void
  subscribe: (callback: (payload: T) => void) => () => void
}

interface GodotStageSocketRuntime {
  port: number
  server: ReturnType<typeof serve>
  token: string
}

interface GodotStageSceneApplyPayload {
  format: 'vrm'
  modelId: string
  name: string
  path: string
}

const godotStageSceneInputPayloadSchema = object({
  modelId: string(),
  format: literal('vrm'),
  name: string(),
  fileName: string(),
  data: instance(Uint8Array),
})

const godotStageSocketEnvelopeSchema = object({
  payload: optional(unknownSchema()),
  type: string(),
})

const godotStagePayloadMessageSchema = object({
  message: string(),
})

type GodotStageSocketEnvelope = InferOutput<typeof godotStageSocketEnvelopeSchema>

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
  applyViewPatch: (payload: StageViewPatch) => Promise<StageViewRequestAckPayload>
  getStatus: () => ElectronGodotStageStatus
  getViewSnapshot: () => StageViewSnapshotPayload | null
  requestViewSnapshot: () => Promise<StageViewRequestAckPayload>
  start: () => Promise<ElectronGodotStageStatus>
  stop: () => Promise<ElectronGodotStageStatus>
  subscribe: (callback: (status: ElectronGodotStageStatus) => void) => () => void
  subscribeViewError: (callback: (payload: StageViewErrorPayload) => void) => () => void
  subscribeViewSnapshot: (callback: (snapshot: StageViewSnapshotPayload) => void) => () => void
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

function createListenerChannel<T>(onListenerError: (error: unknown) => void): ListenerChannel<T> {
  const listeners = new Set<(payload: T) => void>()

  return {
    publish(payload) {
      for (const listener of listeners) {
        try {
          listener(payload)
        }
        catch (error) {
          onListenerError(error)
        }
      }
    },
    subscribe(callback) {
      listeners.add(callback)

      return () => {
        listeners.delete(callback)
      }
    },
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

function waitForProcessExit(exitPromise: Promise<void>, timeoutMs: number) {
  return Promise.race([
    exitPromise.then(() => true, () => false),
    new Promise<boolean>(resolve => setTimeout(resolve, timeoutMs, false)),
  ])
}

function pipeProcessLog(stream: Readable, write: (message: string) => void) {
  stream.on('data', (data) => {
    const message = data.toString('utf-8').trim()
    if (message) {
      write(message)
    }
  })
}

function normalizeFileName(fileName: string) {
  const normalized = basename(fileName.trim())
  return normalized || 'model.bin'
}

function parseSocketMessage(message: GodotStageMessage): GodotStageSocketEnvelope {
  const parsed = safeDestr<unknown>(message.text(), { strict: true })
  const result = safeParse(godotStageSocketEnvelopeSchema, parsed)
  if (!result.success)
    throw new Error('Invalid Godot stage WebSocket envelope.')

  return result.output
}

function getPayloadMessage(payload: unknown) {
  const result = safeParse(godotStagePayloadMessageSchema, payload)
  if (!result.success) {
    return undefined
  }

  return result.output.message
}

function parseSceneInputPayload(payload: unknown): ElectronGodotStageSceneInputPayload {
  const result = safeParse(godotStageSceneInputPayloadSchema, payload)
  if (!result.success)
    throw new Error('Invalid Godot stage scene input payload.')

  return result.output
}

function resolveGodotStageStorageRoot() {
  return join(app.getPath('userData'), 'godot-stage')
}

function resolveGodotStageDebugLaunchOptions() {
  const remoteDebugEnabled = ['1', 'true', 'yes', 'on'].includes(
    (process.env.GODOT_STAGE_REMOTE_DEBUG ?? '').trim().toLowerCase(),
  )
  const remoteDebugUri = remoteDebugEnabled
    ? process.env.GODOT_STAGE_REMOTE_DEBUG_URI?.trim() || DEFAULT_GODOT_REMOTE_DEBUG_URI
    : undefined

  // Godot engine/debugger flags must stay before `--`; StageRoot arguments stay
  // after it and are assembled next to the WebSocket URL.
  return {
    engineArgs: remoteDebugUri ? ['--remote-debug', remoteDebugUri] : [],
    remoteDebugUri,
  }
}

function resolveGodotStageProcessEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    AIRI_GODOT_STAGE_DEV_MODE: app.isPackaged
      ? process.env.AIRI_GODOT_STAGE_DEV_MODE ?? '0'
      : process.env.AIRI_GODOT_STAGE_DEV_MODE ?? '1',
  }
}

interface GodotBinaryResolution {
  executable: string
  mode: 'engine' | 'exported'
}

// Dev builds run the Godot engine against the workspace project.godot.
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

// Packaged builds ship a pre-exported sidecar under Electron resources.
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
  const statusListeners = createListenerChannel<ElectronGodotStageStatus>(
    error => log.withError(error).warn('failed to publish Godot stage status change'),
  )
  const viewErrorListeners = createListenerChannel<StageViewErrorPayload>(
    error => log.withError(error).warn('failed to publish Godot stage view-state error'),
  )
  const viewSnapshotListeners = createListenerChannel<StageViewSnapshotPayload>(
    error => log.withError(error).warn('failed to publish Godot stage view-state snapshot'),
  )
  let currentStatus = createInitialStatus()
  let currentProcess: GodotStageProcess | undefined
  let currentProcessExit = createDeferred<void>()
  let currentReady: Deferred<void> | undefined
  let currentSocketRuntime: GodotStageSocketRuntime | undefined
  let currentSocketPeer: GodotStagePeer | undefined
  let currentViewSnapshot: StageViewSnapshotPayload | null = null
  let expectedProcessExit = false

  function setStatus(next: Partial<ElectronGodotStageStatus> & Pick<ElectronGodotStageStatus, 'state'>) {
    currentStatus = {
      ...currentStatus,
      ...next,
      updatedAt: Date.now(),
    }
    statusListeners.publish(currentStatus)
  }

  function broadcastViewSnapshot(snapshot: StageViewSnapshotPayload) {
    currentViewSnapshot = snapshot
    viewSnapshotListeners.publish(snapshot)
  }

  function broadcastViewError(payload: StageViewErrorPayload) {
    viewErrorListeners.publish(payload)
  }

  function broadcastInvalidViewPayloadError(error: unknown) {
    broadcastViewError({
      code: 'invalid-payload',
      message: errorMessageFrom(error) ?? 'Invalid Godot stage view-state payload.',
    })
  }

  function clearProcessState() {
    currentProcess = undefined
    currentSocketPeer = undefined
    currentViewSnapshot = null
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

    await waitForProcessExit(exitPromise, 2_000)
  }

  function sendSocketMessage(type: string, payload?: unknown) {
    if (!currentSocketPeer) {
      return false
    }

    currentSocketPeer.send(createSocketEnvelope(type, payload))
    return true
  }

  function sendViewRequest(type: 'host.view.patch' | 'host.view.request_snapshot', payload: Record<string, unknown> = {}) {
    if (currentStatus.state !== 'running') {
      throw new Error('Godot stage is not running.')
    }

    const requestId = randomUUID()
    if (!sendSocketMessage(type, { requestId, ...payload })) {
      throw new Error('Godot stage bridge is not connected.')
    }

    return { requestId }
  }

  function sendSceneInputToGodot(payload: GodotStageSceneApplyPayload) {
    if (!sendSocketMessage('host.scene.apply', payload)) {
      throw new Error('Godot stage bridge is not connected.')
    }
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
          state: currentStatus.state,
          pid: currentProcess?.pid ?? null,
          lastError: error,
        })
        return
      }
      case 'stage.view.snapshot': {
        try {
          broadcastViewSnapshot(parseStageViewSnapshotPayload(message.payload))
        }
        catch (error) {
          broadcastInvalidViewPayloadError(error)
        }
        return
      }
      case 'stage.view.error': {
        try {
          broadcastViewError(parseStageViewErrorPayload(message.payload))
        }
        catch (error) {
          broadcastInvalidViewPayloadError(error)
        }
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
    const token = randomUUID()
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
    pipeProcessLog(processHandle.stdout, message => log.log(message))
    pipeProcessLog(processHandle.stderr, message => log.warn(message))

    processHandle.on('error', (error) => {
      if (currentProcess !== processHandle) {
        log.withError(error).debug('ignored stale Godot stage process error')
        return
      }

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
      if (currentProcess !== processHandle) {
        log.withFields({
          code,
          pid: processHandle.pid ?? null,
          signal,
        }).debug('ignored stale Godot stage process close')
        return
      }

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
      const unsubscribe = statusListeners.subscribe(callback)
      callback(currentStatus)
      return unsubscribe
    },
    getStatus() {
      return currentStatus
    },
    getViewSnapshot() {
      return currentViewSnapshot
    },
    subscribeViewSnapshot(callback) {
      return viewSnapshotListeners.subscribe(callback)
    },
    subscribeViewError(callback) {
      return viewErrorListeners.subscribe(callback)
    },
    async start() {
      return await lifecycleMutex.runExclusive(async () => {
        let spawnedProcess: GodotStageProcess | undefined

        try {
          if (currentProcess && currentStatus.state === 'running') {
            return currentStatus
          }

          if (currentProcess && currentStatus.state === 'starting' && currentReady) {
            await currentReady.promise
            return currentStatus
          }

          if (currentProcess) {
            const activeProcess = currentProcess
            await stopProcessAfterFailedStart()

            if (currentProcess === activeProcess) {
              throw new Error('Previous Godot stage process is still shutting down. Retry after it exits.')
            }
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
          const debugLaunchOptions = resolveGodotStageDebugLaunchOptions()
          const sidecarArgs = [
            ...debugLaunchOptions.engineArgs,
            '--',
            `--airi-ws-url=${websocketUrl}`,
            `--airi-storage-root=${resolveGodotStageStorageRoot()}`,
          ]

          if (godotBinary.mode === 'engine') {
            const godotProjectPath = await resolveGodotProjectPath()
            spawnArgs = ['--path', godotProjectPath, ...sidecarArgs]
            spawnCwd = godotProjectPath
          }
          else {
            spawnArgs = sidecarArgs
          }

          log.withFields({
            executable: godotBinary.executable,
            mode: godotBinary.mode,
            remoteDebugUri: debugLaunchOptions.remoteDebugUri,
          }).log('spawning Godot stage')

          const processHandle = spawn(
            godotBinary.executable,
            spawnArgs,
            {
              cwd: spawnCwd,
              env: resolveGodotStageProcessEnv(),
              stdio: ['ignore', 'pipe', 'pipe'],
              windowsHide: false,
            },
          )

          spawnedProcess = processHandle
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
          if (spawnedProcess && currentProcess === spawnedProcess) {
            await stopProcessAfterFailedStart()
          }
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

          const exited = await waitForProcessExit(exitPromise, 2_000)

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
        if (currentStatus.state !== 'running') {
          throw new Error('Godot stage is not running.')
        }

        const sceneInputPayload = parseSceneInputPayload(payload)

        const fileName = normalizeFileName(sceneInputPayload.fileName)
        const modelDirectory = join(resolveGodotStageStorageRoot(), 'models', sceneInputPayload.modelId)
        const materializedPath = join(modelDirectory, fileName)

        await mkdir(modelDirectory, { recursive: true })
        await writeFile(materializedPath, sceneInputPayload.data)

        sendSceneInputToGodot({
          modelId: sceneInputPayload.modelId,
          format: sceneInputPayload.format,
          name: sceneInputPayload.name,
          path: materializedPath,
        })
      })
    },
    async applyViewPatch(payload) {
      return await lifecycleMutex.runExclusive(async () => {
        const patch = parseStageViewPatchPayload(payload)
        return sendViewRequest('host.view.patch', { patch })
      })
    },
    async requestViewSnapshot() {
      return await lifecycleMutex.runExclusive(async () => {
        return sendViewRequest('host.view.request_snapshot')
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
  const unsubscribeViewSnapshot = params.manager.subscribeViewSnapshot((snapshot) => {
    if (!params.window.isDestroyed()) {
      params.context.emit(electronGodotStageViewSnapshotChanged, snapshot)
    }
  })
  const unsubscribeViewError = params.manager.subscribeViewError((payload) => {
    if (!params.window.isDestroyed()) {
      params.context.emit(electronGodotStageViewStateError, payload)
    }
  })

  const cleanups: Array<() => void> = [
    unsubscribe,
    unsubscribeViewSnapshot,
    unsubscribeViewError,
    defineInvokeHandler(params.context, electronGodotStageStart, () => params.manager.start()),
    defineInvokeHandler(params.context, electronGodotStageStop, () => params.manager.stop()),
    defineInvokeHandler(params.context, electronGodotStageGetStatus, () => params.manager.getStatus()),
    defineInvokeHandler(params.context, electronGodotStageApplySceneInput, payload => params.manager.applySceneInput(payload)),
    defineInvokeHandler(params.context, electronGodotStageGetViewSnapshot, () => params.manager.getViewSnapshot()),
    defineInvokeHandler(params.context, electronGodotStageApplyViewPatch, payload => params.manager.applyViewPatch(payload)),
    defineInvokeHandler(params.context, electronGodotStageRequestViewSnapshot, () => params.manager.requestViewSnapshot()),
  ]

  const cleanup = () => {
    for (const fn of cleanups) {
      fn()
    }
  }

  params.window.on('closed', cleanup)
  return cleanup
}

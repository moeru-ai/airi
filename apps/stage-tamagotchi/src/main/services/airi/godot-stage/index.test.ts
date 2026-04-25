import { EventEmitter } from 'node:events'

import { beforeEach, describe, expect, it, vi } from 'vitest'

interface TestWebSocketMessage {
  text: () => string
}

interface TestWebSocketPeer {
  close: ReturnType<typeof vi.fn>
  id: string
  request: {
    url?: string
  }
  send: ReturnType<typeof vi.fn>
}

interface TestWebSocketHooks {
  close?: (peer: TestWebSocketPeer) => void
  message?: (peer: TestWebSocketPeer, message: TestWebSocketMessage) => void
  open?: (peer: TestWebSocketPeer) => void
}

const appMock = vi.hoisted(() => ({
  getPath: vi.fn((name: string) => `/tmp/airi/${name}`),
  isPackaged: false,
}))

const serverState = vi.hoisted(() => ({
  close: vi.fn(async () => {}),
  serve: vi.fn(async () => {}),
  webSocketHooks: undefined as TestWebSocketHooks | undefined,
}))

const spawnMock = vi.hoisted(() => vi.fn())

const logMock = vi.hoisted(() => {
  const logger = {
    debug: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
    withError: vi.fn(),
    withFields: vi.fn(),
  }
  logger.withError.mockReturnValue(logger)
  logger.withFields.mockReturnValue(logger)
  return logger
})

vi.mock('electron', () => ({
  app: appMock,
}))

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}))

vi.mock('node:fs/promises', () => ({
  access: vi.fn(async () => {}),
  mkdir: vi.fn(async () => {}),
  stat: vi.fn(async () => ({ isFile: () => true })),
  writeFile: vi.fn(async () => {}),
}))

vi.mock('@guiiai/logg', () => ({
  useLogg: () => ({
    useGlobalConfig: () => logMock,
  }),
}))

vi.mock('crossws/server', () => ({
  plugin: vi.fn(() => ({})),
}))

vi.mock('get-port-please', () => ({
  getRandomPort: vi.fn(async () => 48123),
}))

vi.mock('h3', () => ({
  H3: class {
    get = vi.fn()
  },
  defineWebSocketHandler: vi.fn((hooks: TestWebSocketHooks) => {
    serverState.webSocketHooks = hooks
    return hooks
  }),
  serve: vi.fn(() => ({
    close: serverState.close,
    serve: serverState.serve,
  })),
}))

vi.mock('../../../libs/bootkit/lifecycle', () => ({
  onAppBeforeQuit: vi.fn(),
}))

vi.mock('../../../libs/electron/location', () => ({
  getElectronMainDirname: () => '/tmp/airi/out/main',
}))

function createFakeGodotProcess() {
  const processHandle = new EventEmitter() as EventEmitter & {
    kill: ReturnType<typeof vi.fn>
    pid: number
    stderr: EventEmitter
    stdout: EventEmitter
  }

  processHandle.pid = 4321
  processHandle.stdout = new EventEmitter()
  processHandle.stderr = new EventEmitter()
  processHandle.kill = vi.fn(() => {
    queueMicrotask(() => processHandle.emit('close', null, 'SIGTERM'))
    return true
  })

  return processHandle
}

function createTestPeer(url: string): TestWebSocketPeer {
  return {
    id: 'godot-test-peer',
    request: { url },
    send: vi.fn(),
    close: vi.fn(),
  }
}

function readSpawnedWebSocketUrl() {
  const spawnArgs = spawnMock.mock.calls.at(-1)?.[1]
  if (!Array.isArray(spawnArgs)) {
    throw new TypeError('Expected Godot spawn arguments to be recorded.')
  }

  const websocketArgument = spawnArgs.find((arg): arg is string => (
    typeof arg === 'string' && arg.startsWith('--airi-ws-url=')
  ))
  if (!websocketArgument) {
    throw new Error('Expected Godot spawn arguments to include --airi-ws-url.')
  }

  return websocketArgument.slice('--airi-ws-url='.length)
}

async function waitForSpawnedGodotProcess() {
  await waitForSpawnedGodotProcessCount(1)
}

async function waitForSpawnedGodotProcessCount(expectedCount: number) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (spawnMock.mock.calls.length >= expectedCount) {
      return
    }

    await Promise.resolve()
  }

  throw new Error('Expected Godot process to be spawned.')
}

async function startRunningGodotStage() {
  const { createGodotStageManager } = await import('./index')
  const manager = createGodotStageManager()
  const startPromise = manager.start()

  await waitForSpawnedGodotProcess()

  const peer = createTestPeer(readSpawnedWebSocketUrl())
  serverState.webSocketHooks?.open?.(peer)
  serverState.webSocketHooks?.message?.(peer, {
    text: () => JSON.stringify({ type: 'stage.ready' }),
  })

  await startPromise

  return {
    manager,
    peer,
  }
}

describe('createGodotStageManager lifecycle cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    appMock.isPackaged = false
    serverState.webSocketHooks = undefined
    delete process.env.GODOT4
  })

  it('closes the websocket runtime when dev-mode Godot binary resolution fails', async () => {
    // ROOT CAUSE:
    //
    // `start()` creates the websocket runtime before resolving the Godot binary.
    // If `GODOT4` is missing, binary resolution throws and previously left the
    // websocket server alive until the next start attempt or app quit.
    const { createGodotStageManager } = await import('./index')
    const manager = createGodotStageManager()

    await expect(manager.start()).rejects.toThrow('GODOT4 is required')
    expect(serverState.close).toHaveBeenCalledWith(true)
    expect(manager.getStatus()).toMatchObject({
      state: 'error',
      pid: null,
      lastError: expect.stringContaining('GODOT4 is required'),
    })
  })

  it('kills the Godot process and closes the websocket runtime when startup readiness times out', async () => {
    // ROOT CAUSE:
    //
    // If Godot starts but never sends `stage.ready`, `start()` rejects after the
    // readiness timeout. The startup transaction must still release the process
    // and websocket runtime created for that failed attempt.
    vi.useFakeTimers()
    process.env.GODOT4 = '/tmp/godot'

    const processHandle = createFakeGodotProcess()
    spawnMock.mockReturnValue(processHandle)

    const { createGodotStageManager } = await import('./index')
    const manager = createGodotStageManager()
    const startPromise = manager.start()
    const startExpectation = expect(startPromise).rejects.toThrow('Godot stage did not report ready in time.')

    await vi.advanceTimersByTimeAsync(20_000)

    await startExpectation
    expect(processHandle.kill).toHaveBeenCalled()
    expect(serverState.close).toHaveBeenCalledWith(true)
    expect(manager.getStatus()).toMatchObject({
      state: 'error',
      pid: null,
      lastError: expect.stringContaining('Godot stage did not report ready in time.'),
    })
  })

  it('closes the websocket runtime when stop fails while force-killing Godot', async () => {
    // ROOT CAUSE:
    //
    // `stop()` can enter the force-kill path after waiting for graceful shutdown.
    // Cleanup must not depend on that branch completing successfully; the
    // websocket runtime belongs to the stopping session and must be released.
    vi.useFakeTimers()
    process.env.GODOT4 = '/tmp/godot'

    const processHandle = createFakeGodotProcess()
    processHandle.kill.mockImplementation(() => {
      throw new Error('kill failed')
    })
    spawnMock.mockReturnValue(processHandle)

    const { manager } = await startRunningGodotStage()
    const stopPromise = manager.stop()
    const stopExpectation = expect(stopPromise).rejects.toThrow('kill failed')

    await vi.advanceTimersByTimeAsync(2_000)

    await stopExpectation
    expect(serverState.close).toHaveBeenCalledWith(true)
    expect(manager.getStatus()).toMatchObject({
      state: 'error',
      pid: processHandle.pid,
      lastError: expect.stringContaining('kill failed'),
    })
  })

  it('does not spawn a second process while a failed startup process is still shutting down', async () => {
    // ROOT CAUSE:
    //
    // A timed-out startup kills the old Godot process, but only waits a bounded
    // 2 seconds for its close event. A retry can start a new process before the
    // old process emits close. The retry must not spawn another child process
    // while the previous process is still tracked by the manager.
    vi.useFakeTimers()
    process.env.GODOT4 = '/tmp/godot'

    const staleProcess = createFakeGodotProcess()
    staleProcess.pid = 1001
    staleProcess.kill.mockImplementation(() => true)

    const unexpectedProcess = createFakeGodotProcess()
    unexpectedProcess.pid = 1002

    spawnMock.mockReturnValueOnce(staleProcess).mockReturnValueOnce(unexpectedProcess)

    const { createGodotStageManager } = await import('./index')
    const manager = createGodotStageManager()
    const failedStartPromise = manager.start()
    const failedStartExpectation = expect(failedStartPromise).rejects.toThrow('Godot stage did not report ready in time.')

    await waitForSpawnedGodotProcess()
    await vi.advanceTimersByTimeAsync(20_000)
    await vi.advanceTimersByTimeAsync(2_000)
    await failedStartExpectation

    const retryStartPromise = manager.start()
    const retryStartExpectation = expect(retryStartPromise).rejects.toThrow('Previous Godot stage process is still shutting down')
    await vi.advanceTimersByTimeAsync(20_000)
    await vi.advanceTimersByTimeAsync(2_000)
    await retryStartExpectation

    expect(spawnMock).toHaveBeenCalledTimes(1)
    expect(manager.getStatus()).toMatchObject({
      state: 'error',
      pid: null,
      lastError: expect.stringContaining('Previous Godot stage process is still shutting down'),
    })
  })
})

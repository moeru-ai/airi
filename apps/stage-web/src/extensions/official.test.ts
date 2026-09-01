import { beforeEach, describe, expect, it, vi } from 'vitest'

import { startOfficialExtensions, stopOfficialExtensions } from './official'

const mocks = vi.hoisted(() => ({
  hostStart: vi.fn(),
  hostStop: vi.fn(async () => {}),
  synchronize: vi.fn(async () => {}),
  clear: vi.fn(),
  toolsClear: vi.fn(),
}))

vi.mock('@proj-airi/airi-extension-whiteboard', () => ({
  whiteboardExtension: { id: 'airi-extension-whiteboard' },
  whiteboardManifest: { id: 'airi-extension-whiteboard' },
}))

vi.mock('@proj-airi/plugin-sdk-stage/gamelet/controller', () => ({
  StageGameletController: class {},
}))

vi.mock('@proj-airi/plugin-sdk-stage/host', () => ({
  installStageHostKits: vi.fn(() => ({ clear: mocks.toolsClear })),
}))

vi.mock('@proj-airi/plugin-sdk/plugin-host', () => ({
  BundledExtensionLoader: class {},
  ExtensionHost: class {
    start = mocks.hostStart
    stop = mocks.hostStop
  },
}))

vi.mock('@proj-airi/stage-ui/stores/ai/chat-llm/extension-tools', () => ({
  synchronizeExtensionTools: mocks.synchronize,
  clearExtensionTools: mocks.clear,
}))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, resolve, reject }
}

describe('official extension lifecycle', () => {
  beforeEach(async () => {
    await stopOfficialExtensions()
    vi.clearAllMocks()
    mocks.hostStop.mockResolvedValue(undefined)
  })

  it('cleans a session that finishes after stop starts', async () => {
    const starting = deferred<{ id: string }>()
    mocks.hostStart.mockReturnValueOnce(starting.promise)

    const startPromise = startOfficialExtensions()
    const stopPromise = stopOfficialExtensions()

    expect(mocks.hostStop).not.toHaveBeenCalled()

    starting.resolve({ id: 'session-race' })
    await expect(stopPromise).resolves.toBeUndefined()
    await expect(startPromise).resolves.toBeUndefined()

    expect(mocks.hostStop).toHaveBeenCalledWith('session-race')
    expect(mocks.synchronize).not.toHaveBeenCalled()
    expect(mocks.toolsClear).toHaveBeenCalled()
    expect(mocks.clear).toHaveBeenCalled()
  })

  it('can start again without retaining the stopped session', async () => {
    mocks.hostStart
      .mockResolvedValueOnce({ id: 'session-first' })
      .mockResolvedValueOnce({ id: 'session-second' })

    await startOfficialExtensions()
    await stopOfficialExtensions()
    await startOfficialExtensions()

    expect(mocks.hostStart).toHaveBeenCalledTimes(2)
    expect(mocks.hostStop).toHaveBeenCalledWith('session-first')
    expect(mocks.synchronize).toHaveBeenCalledTimes(2)
  })

  it('allows a new start after the previous start fails', async () => {
    const failure = new Error('start failed')
    mocks.hostStart
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({ id: 'session-retry' })

    await expect(startOfficialExtensions()).rejects.toBe(failure)
    await expect(stopOfficialExtensions()).resolves.toBeUndefined()
    await expect(startOfficialExtensions()).resolves.toBeUndefined()

    expect(mocks.hostStart).toHaveBeenCalledTimes(2)
    expect(mocks.synchronize).toHaveBeenCalledTimes(1)
  })
})

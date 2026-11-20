import type { RunnerClient } from '@auv-js/sdk/node'

import type { AuvSession } from './auv-runtime'

import { Buffer } from 'node:buffer'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { createTestConfig } from '../test-fixtures'
import { createAuvExecutor } from './auv'

const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9pP8WwAAAABJRU5ErkJggg=='
const temporaryDirectories: string[] = []

function createExecutor(overrides: {
  clickResult?: unknown
  typeResult?: unknown
} = {}) {
  const rootPromise = mkdtemp(join(tmpdir(), 'airi-auv-executor-'))
  const calls = {
    click: vi.fn().mockResolvedValue(overrides.clickResult ?? { action: { attempts: [{ succeeded: true }] } }),
    typeText: vi.fn().mockResolvedValue(overrides.typeResult ?? { attempts: [{ succeeded: true }] }),
    pressKeys: vi.fn().mockResolvedValue({ attempts: [{ succeeded: true }] }),
    scroll: vi.fn().mockResolvedValue({ action: { attempts: [{ succeeded: true }] } }),
    capture: vi.fn().mockResolvedValue({
      capture: { ref: { captureId: 'frame-1' } },
      display: { displayId: 'display-main', primary: true, frame: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 },
    }),
    image: vi.fn().mockResolvedValue({ data: Buffer.from(pngBase64, 'base64'), encoding: 2, width: 1, height: 1 }),
    activate: vi.fn().mockResolvedValue({ verification: { case: 'verifiedForeground' } }),
  }
  const client = {
    id: 'window-game',
    window: {
      ref: { windowId: 'window-game' },
      title: 'Slay the Spire 2',
      applicationName: 'SlayTheSpire2.exe',
      processId: 4242,
      frame: { x: 100, y: 50, width: 800, height: 600 },
      isVisible: true,
    },
    click: calls.click,
    typeText: calls.typeText,
    pressKeys: calls.pressKeys,
    scroll: calls.scroll,
  }
  const runner = {
    windows: {
      get: vi.fn().mockResolvedValue(client),
      from: vi.fn().mockReturnValue(client),
      list: vi.fn().mockResolvedValue([client]),
      resolve: vi.fn().mockResolvedValue(client),
    },
    applications: { activate: calls.activate },
    displays: {
      list: vi.fn().mockResolvedValue([{ displayId: 'display-main', primary: true, frame: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 }]),
      capture: calls.capture,
    },
    captures: { image: calls.image },
  } as unknown as RunnerClient
  const session = {
    runner,
    auv: {},
    connection: {},
    runId: 'run-1',
    deviceId: 'device-1',
    daemonId: 'daemon-1',
  } as unknown as AuvSession
  const runtime = {
    ensureSession: vi.fn().mockResolvedValue(session),
    close: vi.fn().mockResolvedValue(undefined),
  }

  return rootPromise.then(async (root) => {
    temporaryDirectories.push(root)
    await mkdir(join(root, 'screenshots'), { recursive: true })
    return {
      executor: createAuvExecutor(createTestConfig({
        executor: 'auv',
        sessionRoot: root,
        screenshotsDir: join(root, 'screenshots'),
      }), { runtime }),
      runner,
      calls,
      client,
    }
  })
}

afterEach(async () => {
  for (const path of temporaryDirectories.splice(0))
    await rm(path, { recursive: true, force: true })
})

describe('aUV Windows executor', () => {
  it('reports live windows, foreground identity, and logical display geometry', async () => {
    const { executor } = await createExecutor()

    await expect(executor.getForegroundContext()).resolves.toMatchObject({
      available: true,
      appName: 'SlayTheSpire2.exe',
      windowTitle: 'Slay the Spire 2',
      windowId: 'window-game',
      ownerPid: 4242,
    })
    await expect(executor.observeWindows({ limit: 3 })).resolves.toMatchObject({
      frontmostAppName: 'SlayTheSpire2.exe',
      windows: [{ id: 'window-game', appName: 'SlayTheSpire2.exe', ownerPid: 4242 }],
      provenance: { backend: 'auv', runId: 'run-1', deviceId: 'device-1' },
    })
    await expect(executor.getDisplayInfo()).resolves.toMatchObject({
      available: true,
      logicalWidth: 1920,
      logicalHeight: 1080,
      combinedBounds: { x: 0, y: 0, width: 1920, height: 1080 },
    })
  })

  it('persists real PNG bytes and binds the capture to the foreground window and display', async () => {
    const { executor, calls } = await createExecutor()
    const screenshot = await executor.takeScreenshot({ label: 'fixture' })

    expect(calls.capture).toHaveBeenCalledWith(
      { selector: { case: 'display', value: { displayId: 'display-main' } } },
      expect.objectContaining({ signal: undefined }),
    )
    expect(screenshot).toMatchObject({
      mimeType: 'image/png',
      placeholder: false,
      width: 1,
      height: 1,
      sourceDisplayId: '1',
      sourceWindowId: 'window-game',
    })
    await expect(readFile(screenshot.path)).resolves.toEqual(Buffer.from(pngBase64, 'base64'))
  })

  it('targets clicks, text, keys, and scrolling to a fresh approved window', async () => {
    const { executor, client, calls } = await createExecutor()
    const controller = new AbortController()
    const targetWindowContext = { available: true, appName: 'SlayTheSpire2.exe', ownerPid: 4242, windowId: 'window-game', platform: 'win32' as const }

    await executor.click({ x: 120, y: 80, pointerTrace: [{ x: 120, y: 80, delayMs: 0 }] }, {
      signal: controller.signal,
      targetWindowId: 'window-game',
      targetWindowContext,
    })
    expect(calls.click).toHaveBeenCalledWith({ x: 20, y: 30 }, expect.objectContaining({ policy: expect.any(Number) }), { signal: controller.signal })

    await executor.typeText({ text: 'hello' }, { targetWindowId: 'window-game', targetWindowContext })
    await executor.pressKeys({ keys: ['space'] }, { targetWindowId: 'window-game', targetWindowContext })
    await executor.scroll({ deltaY: 120 }, { targetWindowId: 'window-game', targetWindowContext })
    expect(calls.typeText).toHaveBeenCalledOnce()
    expect(calls.pressKeys).toHaveBeenCalledOnce()
    expect(calls.scroll).toHaveBeenCalledWith({ x: 400, y: 300 }, { deltaX: 0, deltaY: 120 }, {}, { signal: undefined })
    expect(client.window.processId).toBe(4242)
  })

  it('fails closed for a coordinate outside the pinned window', async () => {
    const { executor, calls } = await createExecutor()
    await expect(executor.click({ x: 1800, y: 900, pointerTrace: [] }, { targetWindowId: 'window-game' })).rejects.toThrow('outside target window')
    expect(calls.click).not.toHaveBeenCalled()
  })

  it('does not retry an unsuccessful AUV delivery attempt', async () => {
    const { executor, calls } = await createExecutor({ clickResult: { action: { attempts: [{ succeeded: false }] } } })
    await expect(executor.click({ x: 120, y: 80, pointerTrace: [] }, { targetWindowId: 'window-game' })).rejects.toThrow('without a successful input delivery attempt')
    expect(calls.click).toHaveBeenCalledOnce()
  })

  it('does not retry when the input response is lost', async () => {
    const { executor, calls } = await createExecutor()
    calls.click.mockRejectedValue(new Error('AUV response was lost after dispatch'))
    await expect(executor.click({ x: 120, y: 80, pointerTrace: [] }, { targetWindowId: 'window-game' })).rejects.toThrow('AUV response was lost after dispatch')
    expect(calls.click).toHaveBeenCalledOnce()
  })

  it('forwards cancellation into an in-flight AUV input without replay', async () => {
    const { executor, calls } = await createExecutor()
    const controller = new AbortController()
    let markStarted!: () => void
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })
    calls.typeText.mockImplementation((_text, _inputOptions, operationOptions) => new Promise((_resolve, reject) => {
      markStarted()
      if (operationOptions.signal.aborted) {
        reject(operationOptions.signal.reason)
        return
      }
      operationOptions.signal.addEventListener('abort', () => reject(operationOptions.signal.reason), { once: true })
    }))
    const pending = executor.typeText({ text: 'one shot' }, { targetWindowId: 'window-game', signal: controller.signal })
    await started
    controller.abort(new Error('Turbo revoked'))
    await expect(pending).rejects.toThrow('Turbo revoked')
    expect(calls.typeText).toHaveBeenCalledOnce()
  })
})

import type { RunnerClient } from '@auv-js/sdk/node'

import type { AuvExecutorRuntime, AuvSession } from './auv-runtime'

import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { platform } from 'node:process'

import { describe, expect, it, vi } from 'vitest'

import { evaluateActionPolicy } from '../policy'
import { getRuntimePreflight } from '../preflight'
import { createTestConfig } from '../test-fixtures'
import { createAuvExecutor, mapAuvWindow } from './auv'
import { AuvExecutorError, classifyAuvError, wrapAuvError } from './auv-errors'

describe('auv-errors', () => {
  it('classifies grpc codes correctly', () => {
    expect(classifyAuvError({ rpcCode: 4 })).toBe('timeout')
    expect(classifyAuvError({ rpcCode: 5 })).toBe('not_found')
    expect(classifyAuvError({ rpcCode: 12 })).toBe('unsupported')
    expect(classifyAuvError({ rpcCode: 14 })).toBe('unavailable')
    expect(classifyAuvError({ rpcCode: 999 })).toBe('unknown')
    expect(classifyAuvError(new Error('generic'))).toBe('unknown')
  })

  it('preserves existing AuvExecutorError category and details', () => {
    const error = new AuvExecutorError('unavailable', 'daemon unreachable', {
      details: { attempts: 3 },
    })
    expect(classifyAuvError(error)).toBe('unavailable')
    expect(wrapAuvError('test', error)).toBe(error)
  })

  it('wraps unknown errors with categorized AuvExecutorError', () => {
    const wrapped = wrapAuvError('startup', { rpcCode: 14, message: 'connection refused' })
    expect(wrapped).toBeInstanceOf(AuvExecutorError)
    expect(wrapped.category).toBe('unavailable')
    expect(wrapped.message).toContain('startup failed')
  })
})

describe('mapAuvWindow', () => {
  it('maps standard camelCase window properties', () => {
    const client = {
      id: 'win-101',
      window: {
        title: 'Project AIRI - Visual Studio Code',
        applicationName: 'Code',
        processId: 1234,
        frame: { x: 100, y: 150, width: 1024, height: 768 },
        isVisible: true,
      },
    }

    const mapped = mapAuvWindow(client)
    expect(mapped).toEqual({
      id: 'win-101',
      appName: 'Code',
      title: 'Project AIRI - Visual Studio Code',
      bounds: { x: 100, y: 150, width: 1024, height: 768 },
      ownerPid: 1234,
      isOnScreen: true,
    })
  })

  it('maps wire format snake_case and reference.id fallbacks', () => {
    const client = {
      reference: { id: 'ref-202' },
      window: {
        title: 'Terminal',
        app_name: 'powershell.exe',
        process_id: 5678,
        frame: { x: 0, y: 0, width: 800, height: 600 },
        is_visible: false,
      },
    }

    const mapped = mapAuvWindow(client)
    expect(mapped).toEqual({
      id: 'ref-202',
      appName: 'powershell.exe',
      title: 'Terminal',
      bounds: { x: 0, y: 0, width: 800, height: 600 },
      ownerPid: 5678,
      isOnScreen: false,
    })
  })

  it('resolves ref.windowId or window.reference.id when top-level id is absent', () => {
    const mappedWithRef = mapAuvWindow({
      window: {
        ref: { windowId: 'win-ref-303' },
        applicationName: 'chrome.exe',
      },
    })
    expect(mappedWithRef.id).toBe('win-ref-303')

    const mappedWithReference = mapAuvWindow({
      window: {
        reference: { id: 'win-proto-404' },
        applicationName: 'chrome.exe',
      },
    })
    expect(mappedWithReference.id).toBe('win-proto-404')
  })

  it('handles sparse window data safely', () => {
    const mapped = mapAuvWindow({})
    expect(mapped).toEqual({
      id: 'unknown',
      appName: 'unknown',
      title: undefined,
      bounds: undefined,
      ownerPid: undefined,
      isOnScreen: undefined,
    })
  })
})

describe('createAuvExecutor with mock runtime', () => {
  function createMockAuvSession(runnerOverrides: Partial<RunnerClient> = {}): AuvSession {
    const runner = {
      windows: {
        list: vi.fn().mockResolvedValue([]),
        resolve: vi.fn().mockResolvedValue(undefined),
      },
      displays: {
        list: vi.fn().mockResolvedValue([]),
      },
      ...runnerOverrides,
    } as unknown as RunnerClient

    return {
      runner,
      runId: 'mock-run-123',
      deviceId: 'mock-device-456',
      daemonId: 'mock-daemon-789',
    }
  }

  function createMockRuntime(session?: AuvSession, options?: { failEnsure?: boolean }): AuvExecutorRuntime {
    return {
      ensureSession: options?.failEnsure
        ? vi.fn().mockRejectedValue(new AuvExecutorError('unavailable', 'binary missing'))
        : vi.fn().mockResolvedValue(session ?? createMockAuvSession()),
      close: vi.fn().mockResolvedValue(undefined),
    }
  }

  it('describes kind and capabilities accurately', () => {
    const config = createTestConfig({ executor: 'auv' })
    const executor = createAuvExecutor(config, { runtime: createMockRuntime() })
    const desc = executor.describe()
    expect(desc.kind).toBe('auv')
    expect(desc.notes.some(n => n.includes('read-only'))).toBe(true)
  })

  it('reports execution target with local-windowed mode and session tag', async () => {
    const config = createTestConfig({ executor: 'auv', sessionTag: 'test-session-tag' })
    const executor = createAuvExecutor(config, { runtime: createMockRuntime() })
    const target = await executor.getExecutionTarget()
    expect(target.mode).toBe('local-windowed')
    expect(target.transport).toBe('local')
    expect(target.sessionTag).toBe('test-session-tag')
  })

  it('observes windows and populates frontmost window metadata when present', async () => {
    const mockWindows = [
      {
        id: '1',
        window: {
          title: 'Editor Window',
          applicationName: 'VSCode',
          processId: 100,
          frame: { x: 0, y: 0, width: 1920, height: 1080 },
          isVisible: true,
        },
      },
      {
        id: '2',
        window: {
          title: 'Browser Tab',
          applicationName: 'Chrome',
          processId: 200,
          frame: { x: 50, y: 50, width: 1200, height: 800 },
          isVisible: true,
        },
      },
    ]

    const session = createMockAuvSession({
      windows: {
        list: vi.fn().mockResolvedValue(mockWindows),
        resolve: vi.fn().mockResolvedValue(mockWindows[0]),
      } as unknown as RunnerClient['windows'],
    })

    const config = createTestConfig({ executor: 'auv' })
    const executor = createAuvExecutor(config, { runtime: createMockRuntime(session) })
    const result = await executor.observeWindows({})

    expect(result.windows).toHaveLength(2)
    expect(result.windows[0]!.appName).toBe('VSCode')
    expect(result.frontmostAppName).toBe('VSCode')
    expect(result.frontmostWindowTitle).toBe('Editor Window')
    expect(result.provenance?.backend).toBe('auv')
    expect(result.provenance?.runId).toBe('mock-run-123')
  })

  it('distinguishes an empty window list from an RPC failure', async () => {
    const emptySession = createMockAuvSession({
      windows: {
        list: vi.fn().mockResolvedValue([]),
        resolve: vi.fn().mockResolvedValue(undefined),
      } as unknown as RunnerClient['windows'],
    })

    const config = createTestConfig({ executor: 'auv' })
    const emptyExecutor = createAuvExecutor(config, { runtime: createMockRuntime(emptySession) })
    const emptyResult = await emptyExecutor.observeWindows({})
    expect(emptyResult.windows).toEqual([])
    expect(emptyResult.frontmostAppName).toBeUndefined()

    const rpcFailingSession = createMockAuvSession({
      windows: {
        list: vi.fn().mockRejectedValue({ rpcCode: 14, message: 'connection broken' }),
        resolve: vi.fn().mockResolvedValue(undefined),
      } as unknown as RunnerClient['windows'],
    })

    const failingExecutor = createAuvExecutor(config, { runtime: createMockRuntime(rpcFailingSession) })
    await expect(failingExecutor.observeWindows({})).rejects.toThrow(/observe windows failed/)
  })

  it('leaves frontmost metadata undefined when frontmost resolution fails or is empty', async () => {
    const mockWindows = [
      {
        id: '1',
        window: {
          title: 'Background Window',
          applicationName: 'App',
          processId: 100,
          frame: { x: 0, y: 0, width: 800, height: 600 },
          isVisible: true,
        },
      },
    ]

    const session = createMockAuvSession({
      windows: {
        list: vi.fn().mockResolvedValue(mockWindows),
        resolve: vi.fn().mockRejectedValue(new Error('no frontmost window')),
      } as unknown as RunnerClient['windows'],
    })

    const config = createTestConfig({ executor: 'auv' })
    const executor = createAuvExecutor(config, { runtime: createMockRuntime(session) })
    const result = await executor.observeWindows({})

    expect(result.windows).toHaveLength(1)
    expect(result.frontmostAppName).toBeUndefined()
    expect(result.frontmostWindowTitle).toBeUndefined()
  })

  it('applies app substring filtering and limit correctly', async () => {
    const mockWindows = [
      { id: '1', window: { applicationName: 'Google Chrome', title: 'Doc' } },
      { id: '2', window: { applicationName: 'Mozilla Firefox', title: 'Tab' } },
      { id: '3', window: { applicationName: 'Google Chrome Helper', title: 'Helper' } },
    ]

    const session = createMockAuvSession({
      windows: {
        list: vi.fn().mockResolvedValue(mockWindows),
        resolve: vi.fn().mockResolvedValue(undefined),
      } as unknown as RunnerClient['windows'],
    })

    const config = createTestConfig({ executor: 'auv' })
    const executor = createAuvExecutor(config, { runtime: createMockRuntime(session) })

    const chromeOnly = await executor.observeWindows({ app: 'chrome' })
    expect(chromeOnly.windows).toHaveLength(2)
    expect(chromeOnly.windows.every(w => w.appName.toLowerCase().includes('chrome'))).toBe(true)

    const limited = await executor.observeWindows({ limit: 1 })
    expect(limited.windows).toHaveLength(1)
  })

  it('fails closed when AUV daemon is unavailable', async () => {
    const config = createTestConfig({ executor: 'auv' })
    const executor = createAuvExecutor(config, {
      runtime: createMockRuntime(undefined, { failEnsure: true }),
    })

    await expect(executor.observeWindows({})).rejects.toThrow(/binary missing/)

    const failingRuntime: AuvExecutorRuntime = {
      ensureSession: vi.fn().mockRejectedValue(new Error('ENOENT auv.exe')),
      close: vi.fn().mockResolvedValue(undefined),
    }
    const genericFailingExecutor = createAuvExecutor(config, { runtime: failingRuntime })
    await expect(genericFailingExecutor.observeWindows({})).rejects.toThrow(/session startup failed: ENOENT auv.exe/)
  })

  it('fails closed on all unsupported mutating and write operations', async () => {
    const config = createTestConfig({ executor: 'auv' })
    const executor = createAuvExecutor(config, { runtime: createMockRuntime() })

    await expect(executor.openApp({ app: 'Code' })).rejects.toThrow(/openApp is not implemented/)
    await expect(executor.focusApp({ app: 'Code' })).rejects.toThrow(/focusApp is not implemented/)
    await expect(executor.click({ x: 100, y: 100, button: 'left', pointerTrace: [] })).rejects.toThrow(/click is not implemented/)
    await expect(executor.typeText({ text: 'hello' })).rejects.toThrow(/typeText is not implemented/)
    await expect(executor.pressKeys({ keys: ['enter'] })).rejects.toThrow(/pressKeys is not implemented/)
    await expect(executor.scroll({ deltaY: 100 })).rejects.toThrow(/scroll is not implemented/)
    await expect(executor.takeScreenshot({})).rejects.toThrow(/takeScreenshot is not implemented/)
    await expect(executor.wait({ durationMs: 100 })).rejects.toThrow(/wait is not implemented/)
  })

  it('closes runtime cleanly', async () => {
    const mockRuntime = createMockRuntime()
    const config = createTestConfig({ executor: 'auv' })
    const executor = createAuvExecutor(config, { runtime: mockRuntime })

    await executor.close?.()
    expect(mockRuntime.close).toHaveBeenCalledTimes(1)
  })
})

describe('auv policy and preflight integration', () => {
  it('allows observe_windows but denies mutating actions in policy', () => {
    const config = createTestConfig({ executor: 'auv' })
    const context = { available: true, platform: 'win32' as const, appName: 'explorer.exe' }

    const observeDecision = evaluateActionPolicy({
      action: { kind: 'observe_windows', input: {} },
      config,
      context,
      operationsExecuted: 0,
      operationUnitsConsumed: 0,
    })
    expect(observeDecision.allowed).toBe(true)

    const clickDecision = evaluateActionPolicy({
      action: { kind: 'click', input: { x: 100, y: 100 } },
      config,
      context,
      operationsExecuted: 0,
      operationUnitsConsumed: 0,
    })
    expect(clickDecision.allowed).toBe(false)
    expect(clickDecision.reasons).toContain('auv executor is in read-only observation mode; mutating actions are not supported')

    const openAppDecision = evaluateActionPolicy({
      action: { kind: 'open_app', input: { app: 'Terminal' } },
      config,
      context,
      operationsExecuted: 0,
      operationUnitsConsumed: 0,
    })
    expect(openAppDecision.allowed).toBe(false)
    expect(openAppDecision.reasons).toContain('auv executor does not support app open/focus actions in this read-only observation slice')
  })

  it('flags auv read-only mode in preflight mutationReadinessIssues', () => {
    const config = createTestConfig({ executor: 'auv' })
    const preflight = getRuntimePreflight({
      config,
      displayInfo: { available: true, platform: 'win32' },
      executionTarget: { mode: 'local-windowed', transport: 'local', hostName: 'localhost', isolated: false, tainted: false },
    })

    expect(preflight.blockingIssues).toHaveLength(0)
    expect(preflight.mutationReadinessIssues).toContain(
      'auv executor is in read-only observation mode; mutating actions are not supported',
    )
  })
})

describe.runIf(platform === 'win32')('real Windows AUV live execution', () => {
  it('successfully enumerates real Windows desktop windows without changing focus', async () => {
    const sessionRoot = join(tmpdir(), `airi-auv-live-${Date.now()}`)
    const config = createTestConfig({
      executor: 'auv',
      sessionRoot,
    })

    const executor = createAuvExecutor(config)

    try {
      // 1. Get frontmost window before observation
      const beforeContext = await executor.getForegroundContext()

      // 2. Perform live window observation
      const observation = await executor.observeWindows({ limit: 10 })

      expect(observation.windows.length).toBeGreaterThan(0)
      expect(observation.provenance?.backend).toBe('auv')
      expect(typeof observation.observedAt).toBe('string')

      const first = observation.windows[0]!
      expect(typeof first.id).toBe('string')
      expect(first.id.length).toBeGreaterThan(0)
      expect(typeof first.appName).toBe('string')
      expect(first.appName.length).toBeGreaterThan(0)

      if (first.bounds) {
        expect(first.bounds.width).toBeGreaterThan(0)
        expect(first.bounds.height).toBeGreaterThan(0)
      }

      // 3. Verify foreground window context was not altered by the observation
      const afterContext = await executor.getForegroundContext()
      if (beforeContext.available && afterContext.available) {
        expect(afterContext.appName).toBe(beforeContext.appName)
        expect(afterContext.windowTitle).toBe(beforeContext.windowTitle)
      }
    }
    finally {
      await executor.close?.()
      await rm(sessionRoot, { recursive: true, force: true }).catch(() => {})
    }
  }, 30_000)
})

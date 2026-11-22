import type { AuvClient, AuvConnection, AuvDaemon, RunnerClient } from '@auv-js/sdk/node'

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { createTestConfig } from '../test-fixtures'
import { createAuvExecutorRuntime, resolveAuvBinaryForExecution } from './auv-runtime'

describe('resolveAuvBinaryForExecution', () => {
  it('moves packaged Electron paths to app.asar.unpacked', () => {
    const root = join(tmpdir(), `airi-auv-binary-${process.pid}-${Date.now()}`)
    const packedDirectory = join(root, 'resources', 'app.asar', 'node_modules', '@auv-js', 'cli-win32-x64-msvc', 'bin')
    const unpackedDirectory = join(root, 'resources', 'app.asar.unpacked', 'node_modules', '@auv-js', 'cli-win32-x64-msvc', 'bin')
    mkdirSync(unpackedDirectory, { recursive: true })
    const resolved = join(packedDirectory, 'auv.exe')
    const unpacked = join(unpackedDirectory, 'auv.exe')
    try {
      writeFileSync(unpacked, 'binary fixture')
      expect(resolveAuvBinaryForExecution(resolved)).toBe(unpacked)
      expect(resolveAuvBinaryForExecution('C:/tools/auv.exe')).toBe('C:/tools/auv.exe')
      expect(resolveAuvBinaryForExecution(unpacked)).toBe(unpacked)
      expect(existsSync(unpacked)).toBe(true)
      rmSync(root, { recursive: true, force: true })
      expect(() => resolveAuvBinaryForExecution(resolved)).toThrow('was not unpacked')
    }
    finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('aUV executor runtime', () => {
  it('shares startup and closes its Run, connection, and owned daemon', async () => {
    const runner = {} as RunnerClient
    const connection = { close: vi.fn().mockResolvedValue(undefined) } as unknown as AuvConnection
    const runStop = vi.fn().mockResolvedValue(undefined)
    const auv = {
      devices: { list: vi.fn().mockResolvedValue([{ id: 'desktop-1' }]) },
      runs: {
        create: vi.fn().mockResolvedValue({ id: 'run-1' }),
        stop: runStop,
      },
      runner: vi.fn().mockReturnValue(runner),
    } as unknown as AuvClient
    const daemon = {
      id: 'daemon-1',
      exited: new Promise(() => {}),
      stop: vi.fn().mockResolvedValue({ code: 0, signal: null }),
    } as unknown as AuvDaemon
    const startDaemon = vi.fn().mockResolvedValue(daemon)
    const connect = vi.fn().mockResolvedValue(connection)
    const createClient = vi.fn().mockReturnValue(auv)
    const runtime = createAuvExecutorRuntime(createTestConfig({
      executor: 'auv',
      auv: {
        binaryPath: 'C:/tools/auv.exe',
        storeRoot: 'C:/profile/terminal-sessions/auv',
        startupTimeoutMs: 2000,
        shutdownTimeoutMs: 3000,
      },
    }), {
      startDaemon,
      connect,
      createClient,
    })

    const [first, second] = await Promise.all([runtime.ensureSession(), runtime.ensureSession()])
    expect(first).toBe(second)
    expect(first).toMatchObject({ runId: 'run-1', deviceId: 'desktop-1', daemonId: 'daemon-1' })
    expect(startDaemon).toHaveBeenCalledOnce()
    expect(startDaemon).toHaveBeenCalledWith(expect.objectContaining({
      binaryPath: 'C:/tools/auv.exe',
      storeRoot: 'C:/profile/terminal-sessions/auv',
      noRegister: true,
      startupTimeoutMs: 2000,
      shutdownTimeoutMs: 3000,
    }))
    expect(auv.runner).toHaveBeenCalledWith(expect.objectContaining({ runnerClass: 'auv.core.local', runId: 'run-1' }))

    await runtime.close()
    await runtime.close()
    expect(runStop).toHaveBeenCalledWith({ runId: 'run-1', outcome: 'canceled' })
    expect(connection.close).toHaveBeenCalledOnce()
    expect(daemon.stop).toHaveBeenCalledOnce()
    await expect(runtime.ensureSession()).rejects.toThrow('runtime is closed')
  })

  it('closes the connection and daemon when Runner setup fails', async () => {
    const connection = { close: vi.fn().mockResolvedValue(undefined) } as unknown as AuvConnection
    const daemon = {
      id: 'daemon-failed',
      exited: new Promise(() => {}),
      stop: vi.fn().mockResolvedValue({ code: 0, signal: null }),
    } as unknown as AuvDaemon
    const auv = {
      devices: { list: vi.fn().mockRejectedValue(new Error('device listing unavailable')) },
      runs: { create: vi.fn().mockRejectedValue(new Error('run setup failed')) },
      runner: vi.fn(),
    } as unknown as AuvClient
    const runtime = createAuvExecutorRuntime(createTestConfig({ executor: 'auv' }), {
      startDaemon: vi.fn().mockResolvedValue(daemon),
      connect: vi.fn().mockResolvedValue(connection),
      createClient: vi.fn().mockReturnValue(auv),
    })

    await expect(runtime.ensureSession()).rejects.toThrow('run setup failed')
    expect(connection.close).toHaveBeenCalledOnce()
    expect(daemon.stop).toHaveBeenCalledOnce()
    await runtime.close()
  })
})

import type { DebugServerConfig } from '@proj-airi/debug-server/config'

import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { DebugTracingService } from '.'

const temporaryDirectories: string[] = []

async function temporaryPaths() {
  const directory = await mkdtemp(join(tmpdir(), 'airi-tamagotchi-debug-'))
  temporaryDirectories.push(directory)
  return {
    connectionPath: join(directory, 'connection.json'),
    databasePath: join(directory, 'debug.duckdb'),
    migrationsFolder: join(directory, 'drizzle'),
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { force: true, recursive: true })))
})

describe('debugTracingService', () => {
  it('starts on the local debug port, publishes its connection, and persists user changes', async () => {
    const paths = await temporaryPaths()
    let storedEnabled = false
    let receivedConfig: DebugServerConfig | undefined
    const stop = vi.fn(async () => {})
    const listener = vi.fn()
    const service = new DebugTracingService({
      allowedOrigins: new Set(['null']),
      ...paths,
      getStoredEnabled: () => storedEnabled,
      setStoredEnabled: (enabled) => {
        storedEnabled = enabled
      },
      startServer: async (config, runtimeOptions) => {
        receivedConfig = config
        expect(runtimeOptions).toEqual({ migrationsFolder: paths.migrationsFolder })
        return {
          databasePath: config.databasePath,
          endpoint: 'http://127.0.0.1:49152',
          token: config.token,
          stop,
        }
      },
    })
    service.onStateChange(listener)

    const enabled = await service.setEnabled(true)
    expect(receivedConfig).toMatchObject({
      allowedOrigins: new Set(['null']),
      databasePath: paths.databasePath,
      port: 6122,
    })
    expect(enabled).toMatchObject({
      enabled: true,
      endpoint: 'http://127.0.0.1:49152',
    })
    expect(storedEnabled).toBe(true)
    expect(listener).toHaveBeenLastCalledWith(enabled)
    await expect(readFile(paths.connectionPath, 'utf8').then(JSON.parse)).resolves.toMatchObject({
      databasePath: paths.databasePath,
      endpoint: 'http://127.0.0.1:49152',
      token: expect.stringMatching(/^[\w-]{32}$/),
    })

    const disabled = await service.setEnabled(false)
    expect(stop).toHaveBeenCalledTimes(1)
    expect(disabled).toEqual({
      databasePath: paths.databasePath,
      enabled: false,
      error: undefined,
    })
    expect(storedEnabled).toBe(false)
    await expect(readFile(paths.connectionPath, 'utf8')).rejects.toThrow()
  })

  it('restores persisted collection and keeps the preference during app shutdown', async () => {
    const paths = await temporaryPaths()
    const setStoredEnabled = vi.fn()
    const stop = vi.fn(async () => {})
    const service = new DebugTracingService({
      allowedOrigins: new Set(['http://localhost:5173']),
      ...paths,
      getStoredEnabled: () => true,
      setStoredEnabled,
      startServer: async config => ({
        databasePath: config.databasePath,
        endpoint: 'http://127.0.0.1:49153',
        token: config.token,
        stop,
      }),
    })

    await service.restore()
    expect(service.getState()).toMatchObject({ enabled: true })
    expect(setStoredEnabled).not.toHaveBeenCalled()

    await service.dispose()
    expect(stop).toHaveBeenCalledTimes(1)
    expect(setStoredEnabled).not.toHaveBeenCalled()
  })

  it('exposes startup failures without reporting collection as enabled', async () => {
    const paths = await temporaryPaths()
    const service = new DebugTracingService({
      allowedOrigins: new Set(['null']),
      ...paths,
      getStoredEnabled: () => true,
      setStoredEnabled: vi.fn(),
      startServer: async () => {
        throw new Error('DuckDB failed to open')
      },
    })

    await service.restore()
    expect(service.getState()).toEqual({
      databasePath: paths.databasePath,
      enabled: false,
      error: 'DuckDB failed to open',
    })
  })
})

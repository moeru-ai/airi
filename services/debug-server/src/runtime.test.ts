import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { loadConfig } from './config'
import { startDebugServer } from './runtime'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(path => rm(path, { force: true, recursive: true })))
})

describe('startDebugServer', () => {
  it('uses the configured migrations folder', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'airi-debug-runtime-'))
    temporaryDirectories.push(directory)
    const config = {
      ...loadConfig({ AIRI_DEBUG_DB_PATH: join(directory, 'debug.duckdb'), AIRI_DEBUG_TOKEN: 'runtime-test' }),
      port: 0,
    }
    let server: Awaited<ReturnType<typeof startDebugServer>> | undefined
    try {
      server = await startDebugServer(config, { migrationsFolder: join(directory, 'missing-migrations') })
      expect.unreachable('The configured migrations folder should be required')
    }
    catch (error) {
      expect(error).toHaveProperty('message', expect.stringContaining('meta/_journal.json'))
    }
    finally {
      await server?.stop()
    }
  })

  it('reports its allocated endpoint and closes it idempotently', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'airi-debug-runtime-'))
    temporaryDirectories.push(directory)
    const config = {
      ...loadConfig({ AIRI_DEBUG_DB_PATH: join(directory, 'debug.duckdb'), AIRI_DEBUG_TOKEN: 'runtime-test' }),
      port: 0,
    }
    const server = await startDebugServer(config)

    expect(server.endpoint).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    await expect(fetch(`${server.endpoint}/health`)).resolves.toMatchObject({ status: 200 })
    await expect(fetch(`${server.endpoint}/api/debug/v1/sources`, {
      headers: { authorization: `Bearer ${server.token}` },
    }).then(response => response.json())).resolves.toMatchObject({ sources: [] })

    await expect(Promise.all([server.stop(), server.stop()])).resolves.toEqual([undefined, undefined])
    await expect(fetch(`${server.endpoint}/health`)).rejects.toThrow()
  })

  it('formats an IPv6 loopback endpoint for clients', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'airi-debug-runtime-'))
    temporaryDirectories.push(directory)
    const config = {
      ...loadConfig({
        AIRI_DEBUG_DB_PATH: join(directory, 'debug.duckdb'),
        AIRI_DEBUG_HOST: '::1',
        AIRI_DEBUG_TOKEN: 'runtime-test',
      }),
      port: 0,
    }
    const server = await startDebugServer(config)
    try {
      expect(server.endpoint).toMatch(/^http:\/\/\[::1\]:\d+$/)
      await expect(fetch(`${server.endpoint}/health`)).resolves.toMatchObject({ status: 200 })
    }
    finally {
      await server.stop()
    }
  })
})

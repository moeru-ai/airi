import type { ServerType } from '@hono/node-server'

import type { DebugServerConfig } from './config'

import { chmod, mkdir } from 'node:fs/promises'
import { isIPv6 } from 'node:net'
import { dirname } from 'node:path'

import { useLogg } from '@guiiai/logg'
import { serve } from '@hono/node-server'

import { createApp } from './app'
import { closeHttpServer } from './server'
import { DebugStorage } from './storage'

const log = useLogg('debug-server').useGlobalConfig()

export interface DebugServerHandle {
  databasePath: string
  endpoint: string
  token: string
  stop: () => Promise<void>
}

export interface DebugServerRuntimeOptions {
  migrationsFolder?: string
}

function endpointFor(host: string, port: number): string {
  const hostname = isIPv6(host) ? `[${host}]` : host
  return new URL(`http://${hostname}:${port}`).origin
}

async function listen(app: ReturnType<typeof createApp>, config: DebugServerConfig): Promise<{ port: number, server: ServerType }> {
  return await new Promise((resolve, reject) => {
    const server = serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (address) => {
      server.off('error', reject)
      resolve({ port: address.port, server })
    })
    server.once('error', reject)
  })
}

export async function startDebugServer(config: DebugServerConfig, runtimeOptions: DebugServerRuntimeOptions = {}): Promise<DebugServerHandle> {
  await mkdir(dirname(config.databasePath), { recursive: true, mode: 0o700 })
  const storage = await DebugStorage.open({
    maxStoredBytes: config.maxStoredBytes,
    migrationsFolder: runtimeOptions.migrationsFolder,
    path: config.databasePath,
    retentionDays: config.retentionDays,
  })

  try {
    await chmod(config.databasePath, 0o600)
    const app = createApp(storage, config)
    const { port, server } = await listen(app, config)
    const endpoint = endpointFor(config.host, port)
    log.withFields({ host: config.host, port, databasePath: config.databasePath }).log('Listening for local traces')

    let stopPromise: Promise<void> | undefined
    return {
      databasePath: config.databasePath,
      endpoint,
      token: config.token,
      stop() {
        stopPromise ??= (async () => {
          try {
            await closeHttpServer(server)
          }
          finally {
            await storage.close()
          }
        })()
        return stopPromise
      },
    }
  }
  catch (error) {
    await storage.close()
    throw error
  }
}

import type { Lifecycle } from './builtin'

import { describe, expect, it, vi } from 'vitest'

import { invoke, provide, start, stop } from './global'

describe('di', () => {
  it('should work with individual lifecycle injection', async () => {
    interface Database {
      connect: () => Promise<void>
      close: () => Promise<void>
    }

    const databaseConnectSpy = vi.fn()
    const databaseCloseSpy = vi.fn()

    function createDatabase(params: { lifecycle?: Lifecycle }): Database {
      const database: Database = { connect: databaseConnectSpy, close: databaseCloseSpy }
      params.lifecycle?.appHooks.onStop(async () => await database.close())
      return database
    }

    interface WebSocketServer {
      start: () => Promise<void>
      stop: () => Promise<void>
    }

    const webSocketServerStartSpy = vi.fn()
    const webSocketServerStopSpy = vi.fn()

    async function createWebSocketServer(params: { database: Database, lifecycle?: Lifecycle }): Promise<WebSocketServer> {
      await params.database.connect()
      const server: WebSocketServer = { start: webSocketServerStartSpy, stop: webSocketServerStopSpy }
      params.lifecycle?.appHooks.onStop(async () => await server.stop())
      return server
    }

    provide<{ lifecycle: Lifecycle }>('db', {
      dependsOn: { lifecycle: 'lifecycle' },
      build: async ({ dependsOn }) => createDatabase({ lifecycle: dependsOn.lifecycle }),
    })

    provide<{ database: Database, lifecycle: Lifecycle }>('ws', {
      dependsOn: { database: 'db', lifecycle: 'lifecycle' },
      build: async ({ dependsOn }) => createWebSocketServer({ database: dependsOn.database, lifecycle: dependsOn.lifecycle }),
    })

    invoke<{ webSocketServer: WebSocketServer }>({
      dependsOn: { webSocketServer: 'ws' },
      callback: async ({ webSocketServer }) => await webSocketServer.start(),
    })

    await start()
    await stop()

    // eslint-disable-next-line no-lone-blocks
    {
      expect(databaseConnectSpy).toHaveBeenCalledTimes(1)
      expect(databaseCloseSpy).toHaveBeenCalledTimes(1)
      expect(webSocketServerStartSpy).toHaveBeenCalledTimes(1)
      expect(webSocketServerStopSpy).toHaveBeenCalledTimes(1)
    }
  })
})

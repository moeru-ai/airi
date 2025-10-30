import type { Lifecycle } from './builtin'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { invoke, provide, resetContainer, start, stop } from './global'
import { lifecycle } from './scoped'

beforeEach(() => {
  resetContainer()
})

describe('workflow with named', () => {
  it('should work with named pattern', async () => {
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

describe('workflow with typed', () => {
  it('should work with typed named pattern', async () => {
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

    const database = provide('db', {
      dependsOn: { lifecycle },
      build: async ({ dependsOn }) => createDatabase(dependsOn),
    })

    const webSocketServer = provide('ws', {
      dependsOn: { database, lifecycle },
      build: async ({ dependsOn }) => createWebSocketServer(dependsOn),
    })

    invoke({
      dependsOn: { webSocketServer },
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

describe('workflow with auto name', () => {
  it('should work with auto name pattern', async () => {
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

    const database = provide({
      dependsOn: { lifecycle },
      build: async ({ dependsOn }) => createDatabase(dependsOn),
    })

    const webSocketServer = provide({
      dependsOn: { database, lifecycle },
      build: async ({ dependsOn }) => createWebSocketServer(dependsOn),
    })

    invoke({
      dependsOn: { webSocketServer },
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

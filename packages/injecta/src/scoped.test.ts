import type { Lifecycle } from './builtin'

import { describe, expect, it, vi } from 'vitest'

import { createContainer, invoke, lifecycle, normalizeName, normalizeProvideOption, provide, start, stop } from './scoped'

describe('normalizeName', () => {
  it('should normalize names correctly', () => {
    expect(normalizeName('simpleName')).toBe('simpleName')
    expect(normalizeName({ key: 'objectName' })).toBe('objectName')
  })
})

describe('normalizeProvideOption', () => {
  it('should normalize provide options correctly', () => {
    expect(() => normalizeProvideOption('simpleName')).toThrowError('When using provide(...) as named callback, the second argument must be either a valid ProvideOptionObject<T, D> or a ProvideOptionFunc<T, D>.')
    expect(() => normalizeProvideOption({ key: 'objectName' })).toThrowError('When using provide(...) as typed ProvideOptionWithKeys<T, D, Key> callback, the second argument must be either a valid ProvideOptionObject<T, D> or a ProvideOptionFunc<T, D>.')

    const namedOption = normalizeProvideOption('name', () => {})
    expect(namedOption).toBeTypeOf('object')
    expect(namedOption).toHaveProperty('build')
    expect(() => namedOption.build({} as any)).not.toThrow()

    const typedOption = normalizeProvideOption({ key: 'name' }, () => {})
    expect(typedOption).toBeTypeOf('object')
    expect(typedOption).toHaveProperty('build')
    expect(() => typedOption.build({} as any)).not.toThrow()

    const autoNameOption = normalizeProvideOption(() => {})
    expect(autoNameOption).toBeTypeOf('object')
    expect(autoNameOption).toHaveProperty('build')
    expect(() => autoNameOption.build({} as any)).not.toThrow()
  })
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

    const app = createContainer()

    provide<{ lifecycle: Lifecycle }>(app, 'db', {
      dependsOn: { lifecycle: 'lifecycle' },
      build: async ({ dependsOn }) => createDatabase({ lifecycle: dependsOn.lifecycle }),
    })

    provide<{ database: Database, lifecycle: Lifecycle }>(app, 'ws', {
      dependsOn: { database: 'db', lifecycle: 'lifecycle' },
      build: async ({ dependsOn }) => createWebSocketServer({ database: dependsOn.database, lifecycle: dependsOn.lifecycle }),
    })

    invoke<{ webSocketServer: WebSocketServer }>(app, {
      dependsOn: { webSocketServer: 'ws' },
      callback: async ({ webSocketServer }) => await webSocketServer.start(),
    })

    await start(app)
    await stop(app)

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

    const app = createContainer()

    const database = provide(app, 'db', {
      dependsOn: { lifecycle },
      build: async ({ dependsOn }) => createDatabase(dependsOn),
    })

    const webSocketServer = provide(app, 'ws', {
      dependsOn: { database, lifecycle },
      build: async ({ dependsOn }) => createWebSocketServer(dependsOn),
    })

    invoke(app, {
      dependsOn: { webSocketServer },
      callback: async ({ webSocketServer }) => await webSocketServer.start(),
    })

    await start(app)
    await stop(app)

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

    const app = createContainer()

    const database = provide(app, {
      dependsOn: { lifecycle },
      build: async ({ dependsOn }) => createDatabase(dependsOn),
    })

    const webSocketServer = provide(app, {
      dependsOn: { database, lifecycle },
      build: async ({ dependsOn }) => createWebSocketServer(dependsOn),
    })

    invoke(app, {
      dependsOn: { webSocketServer },
      callback: async ({ webSocketServer }) => await webSocketServer.start(),
    })

    await start(app)
    await stop(app)

    // eslint-disable-next-line no-lone-blocks
    {
      expect(databaseConnectSpy).toHaveBeenCalledTimes(1)
      expect(databaseCloseSpy).toHaveBeenCalledTimes(1)
      expect(webSocketServerStartSpy).toHaveBeenCalledTimes(1)
      expect(webSocketServerStopSpy).toHaveBeenCalledTimes(1)
    }
  })
})

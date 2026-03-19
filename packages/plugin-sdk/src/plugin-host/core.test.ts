import type { ModulePermissionDeclaration } from './shared/types'

import { join } from 'node:path'

import { createContext, defineEventa, defineInvoke, defineInvokeHandler } from '@moeru/eventa'
import {
  moduleCompatibilityResult,
  modulePermissionsCurrent,
  modulePermissionsDeclare,
  modulePermissionsGranted,
  modulePermissionsRequest,
  moduleStatus,
  registryModulesSync,
} from '@proj-airi/plugin-protocol/types'
import { describe, expect, it, vi } from 'vitest'

import { FileSystemLoader, PluginHost } from '.'
import { createApis } from '../plugin/apis/client'
import { protocolCapabilityWait, protocolProviders } from '../plugin/apis/protocol'

function assertNever(value: never): never {
  throw new Error(`Unsupported capability state: ${value}`)
}

function reportPluginCapability(
  host: PluginHost,
  payload: { key: string, state: 'announced' | 'ready', metadata?: Record<string, unknown> },
) {
  switch (payload.state) {
    case 'announced':
      return host.announceCapability(payload.key, payload.metadata)

    case 'ready':
      return host.markCapabilityReady(payload.key, payload.metadata)

    default:
      return assertNever(payload.state)
  }
}

describe('for FileSystemPluginHost', () => {
  const testPermissions: ModulePermissionDeclaration = {
    apis: [
      { key: 'proj-airi:plugin-sdk:apis:protocol:capabilities:wait', actions: ['invoke'] },
      { key: 'proj-airi:plugin-sdk:apis:protocol:resources:providers:list-providers', actions: ['invoke'] },
    ],
    resources: [
      { key: 'proj-airi:plugin-sdk:apis:protocol:resources:providers:list-providers', actions: ['read'] },
    ],
    capabilities: [
      { key: 'proj-airi:plugin-sdk:apis:protocol:resources:providers:list-providers', actions: ['wait'] },
    ],
  }

  it('should load test-normal-plugin from manifest', async () => {
    const host = new FileSystemLoader()

    const pluginDef = await host.loadPluginFor({
      apiVersion: 'v1',
      kind: 'manifest.plugin.airi.moeru.ai',
      name: 'test-plugin',
      permissions: testPermissions,
      entrypoints: {
        electron: join(import.meta.dirname, 'testdata', 'test-normal-plugin.ts'),
      },
    }, { cwd: '', runtime: 'electron' })

    const ctx = createContext()
    const apis = createApis(ctx)
    const onVitestCall = vi.fn()
    ctx.on(defineEventa('vitest-call:init'), onVitestCall)

    await expect(pluginDef.init?.({ channels: { host: ctx }, apis })).resolves.not.toThrow()
    expect(onVitestCall).toHaveBeenCalledTimes(1)
  })

  it('should resolve runtime-specific entrypoint with node fallback', async () => {
    const host = new FileSystemLoader()

    const pluginDef = await host.loadPluginFor({
      apiVersion: 'v1',
      kind: 'manifest.plugin.airi.moeru.ai',
      name: 'test-plugin',
      permissions: testPermissions,
      entrypoints: {
        node: join(import.meta.dirname, 'testdata', 'test-normal-plugin.ts'),
      },
    }, { cwd: '', runtime: 'node' })

    expect(pluginDef).toBeDefined()
    expect(typeof pluginDef.init).toBe('function')
  })

  it('should be able to handle test-error-plugin from manifest', async () => {
    const host = new FileSystemLoader()

    await expect(host.loadPluginFor({
      apiVersion: 'v1',
      kind: 'manifest.plugin.airi.moeru.ai',
      name: 'test-plugin',
      permissions: testPermissions,
      entrypoints: {
        electron: join(import.meta.dirname, 'testdata', 'test-error-plugin.ts'),
      },
    }, { cwd: '', runtime: 'electron' })).rejects.toThrow('Test error plugin always throws an error during loading.')
  })

  it('should resolve entrypoint by runtime then default then electron', () => {
    const host = new FileSystemLoader()
    const baseManifest = {
      apiVersion: 'v1' as const,
      kind: 'manifest.plugin.airi.moeru.ai' as const,
      name: 'test-plugin',
      permissions: testPermissions,
    }

    const runtimeEntryManifest = {
      ...baseManifest,
      entrypoints: {
        node: './node-entry.ts',
        default: './default-entry.ts',
        electron: './electron-entry.ts',
      },
    }
    const defaultFallbackManifest = {
      ...baseManifest,
      entrypoints: {
        default: './default-entry.ts',
        electron: './electron-entry.ts',
      },
    }
    const electronFallbackManifest = {
      ...baseManifest,
      entrypoints: {
        electron: './electron-entry.ts',
      },
    }

    expect(host.resolveEntrypointFor(runtimeEntryManifest, {
      cwd: '/tmp/plugin',
      runtime: 'node',
    })).toBe('/tmp/plugin/node-entry.ts')

    expect(host.resolveEntrypointFor(defaultFallbackManifest, {
      cwd: '/tmp/plugin',
      runtime: 'node',
    })).toBe('/tmp/plugin/default-entry.ts')

    expect(host.resolveEntrypointFor(electronFallbackManifest, {
      cwd: '/tmp/plugin',
      runtime: 'node',
    })).toBe('/tmp/plugin/electron-entry.ts')
  })

  it('should preserve absolute runtime entrypoints', () => {
    const host = new FileSystemLoader()

    expect(host.resolveEntrypointFor({
      apiVersion: 'v1',
      kind: 'manifest.plugin.airi.moeru.ai',
      name: 'test-plugin',
      permissions: testPermissions,
      entrypoints: {
        node: '/opt/plugins/entry.ts',
      },
    }, {
      cwd: '/tmp/plugin',
      runtime: 'node',
    })).toBe('/opt/plugins/entry.ts')
  })

  it('should throw deterministic error when no runtime entrypoint exists', () => {
    const host = new FileSystemLoader()

    expect(() => host.resolveEntrypointFor({
      apiVersion: 'v1',
      kind: 'manifest.plugin.airi.moeru.ai',
      name: 'test-plugin',
      permissions: testPermissions,
      entrypoints: {},
    }, { runtime: 'node' })).toThrow('Plugin entrypoint is required for runtime `node`.')
  })
})

describe('for PluginHost', () => {
  const providersCapability = 'proj-airi:plugin-sdk:apis:protocol:resources:providers:list-providers'
  const testManifest = {
    apiVersion: 'v1' as const,
    kind: 'manifest.plugin.airi.moeru.ai' as const,
    name: 'test-plugin',
    permissions: {
      apis: [
        { key: 'proj-airi:plugin-sdk:apis:protocol:capabilities:wait', actions: ['invoke'] },
        { key: 'proj-airi:plugin-sdk:apis:protocol:resources:providers:list-providers', actions: ['invoke'] },
      ],
      resources: [
        { key: 'proj-airi:plugin-sdk:apis:protocol:resources:providers:list-providers', actions: ['read'] },
      ],
      capabilities: [
        { key: 'proj-airi:plugin-sdk:apis:protocol:resources:providers:list-providers', actions: ['wait'] },
      ],
    } satisfies ModulePermissionDeclaration,
    entrypoints: {
      electron: join(import.meta.dirname, 'testdata', 'test-normal-plugin.ts'),
    },
  }

  it('should run plugin lifecycle to ready in-memory', async () => {
    const host = new PluginHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
    })
    reportPluginCapability(host, {
      key: providersCapability,
      state: 'ready',
      metadata: { source: 'test' },
    })

    const session = await host.start(testManifest, { cwd: '' })

    await host.markConfigurationNeeded(session.id, 'manual-check')

    expect(session.phase).toBe('configuration-needed')

    await host.applyConfiguration(session.id, {
      configId: `${session.identity.id}:manual`,
      revision: 2,
      schemaVersion: 1,
      full: { mode: 'manual' },
    })

    expect(session.phase).toBe('configured')

    const stopped = host.stop(session.id)
    expect(stopped?.phase).toBe('stopped')
    expect(host.getSession(session.id)).toBeUndefined()
  })

  it('should fail initialization when plugin init returns false', async () => {
    const host = new PluginHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
    })

    const session = await host.load({
      apiVersion: 'v1',
      kind: 'manifest.plugin.airi.moeru.ai',
      name: 'test-plugin-no-connect',
      permissions: testManifest.permissions,
      entrypoints: {
        electron: join(import.meta.dirname, 'testdata', 'test-no-connect-plugin.ts'),
      },
    }, { cwd: '' })

    await expect(host.init(session.id)).rejects.toThrow('Plugin initialization aborted by plugin: test-plugin-no-connect')

    const latest = host.getSession(session.id)
    expect(latest?.phase).toBe('failed')
  })

  it('should reject non in-memory transport for MVP', async () => {
    const host = new PluginHost({
      runtime: 'electron',
      transport: { kind: 'websocket', url: 'ws://localhost:3000' },
    })

    await expect(host.start(testManifest, { cwd: '' })).rejects.toThrow('Only in-memory transport is currently supported by PluginHost alpha.')
  })

  it('should be able to expose setupModules', async () => {
    const loader = new FileSystemLoader()

    const pluginDef = await loader.loadPluginFor({
      apiVersion: 'v1',
      kind: 'manifest.plugin.airi.moeru.ai',
      name: 'test-plugin',
      permissions: testManifest.permissions,
      entrypoints: {
        electron: join(import.meta.dirname, 'testdata', 'test-normal-plugin.ts'),
      },
    }, { cwd: '' })

    const ctx = createContext()
    const apis = createApis(ctx)
    const onVitestCall = vi.fn()
    ctx.on(defineEventa('vitest-call:init'), onVitestCall)

    await expect(pluginDef.init?.({ channels: { host: ctx }, apis })).resolves.not.toThrow()
    expect(onVitestCall).toHaveBeenCalledTimes(1)

    defineInvokeHandler(ctx, protocolProviders.listProviders, async () => {
      return [
        { name: 'provider1' },
      ]
    })
    defineInvokeHandler(ctx, protocolCapabilityWait, async () => {
      return {
        key: 'proj-airi:plugin-sdk:apis:protocol:resources:providers:list-providers',
        state: 'ready',
        updatedAt: Date.now(),
      }
    })

    const onProviderListCall = vi.fn()
    ctx.on(protocolProviders.listProviders.sendEvent, onProviderListCall)
    await expect(pluginDef.setupModules?.({ channels: { host: ctx }, apis })).resolves.not.toThrow()
    expect(onProviderListCall).toHaveBeenCalledTimes(1)
  })

  it('should wait for required capabilities before proceeding init', async () => {
    const host = new PluginHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
    })
    reportPluginCapability(host, {
      key: providersCapability,
      state: 'ready',
      metadata: { source: 'test' },
    })

    const started = host.start(testManifest, {
      cwd: '',
      requiredCapabilities: ['cap:providers:list'],
      capabilityWaitTimeoutMs: 2000,
    })

    await new Promise(resolve => setTimeout(resolve, 20))
    const loadingSession = host.listSessions().find(item => item.manifest.name === testManifest.name)
    expect(loadingSession?.phase).toBe('waiting-deps')

    reportPluginCapability(host, {
      key: 'cap:providers:list',
      state: 'ready',
      metadata: { source: 'test' },
    })
    const session = await started
    expect(session.phase).toBe('ready')
  })

  it('should emit dependency wait details while waiting for required capabilities', async () => {
    const host = new PluginHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
    })

    const session = await host.load(testManifest, { cwd: '' })
    const statusEvents: Array<{ body?: Record<string, unknown> }> = []
    session.channels.host.on(moduleStatus, (payload) => {
      statusEvents.push(payload as unknown as { body?: Record<string, unknown> })
    })

    const started = host.init(session.id, {
      requiredCapabilities: ['cap:custom'],
      capabilityWaitTimeoutMs: 2000,
    })

    await new Promise(resolve => setTimeout(resolve, 20))

    const waitingStatus = statusEvents.find((event) => {
      const body = event.body
      return body?.phase === 'preparing' && typeof body.reason === 'string' && body.reason.includes('Waiting for capabilities:')
    })

    expect(waitingStatus).toBeDefined()
    expect(waitingStatus?.body).toMatchObject({
      phase: 'preparing',
      details: {
        lifecyclePhase: 'waiting-deps',
        requiredCapabilities: ['cap:custom'],
        unresolvedCapabilities: ['cap:custom'],
        timeoutMs: 2000,
      },
    })

    reportPluginCapability(host, {
      key: 'cap:custom',
      state: 'ready',
      metadata: { source: 'test' },
    })
    const initialized = await started
    expect(initialized.phase).toBe('ready')
  })

  it('should fail when required capabilities timeout', async () => {
    const host = new PluginHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
    })

    await expect(host.start(testManifest, {
      cwd: '',
      requiredCapabilities: ['cap:missing'],
      capabilityWaitTimeoutMs: 10,
    })).rejects.toThrow('Capability `cap:missing` is not ready after 10ms.')
  })

  it('should support degraded and withdrawn capability states', () => {
    const host = new PluginHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
    })

    const announced = host.announceCapability('cap:dynamic', { source: 'announce' })
    expect(announced).toMatchObject({
      key: 'cap:dynamic',
      state: 'announced',
      metadata: { source: 'announce' },
    })

    const degraded = host.markCapabilityDegraded('cap:dynamic', { reason: 'upstream-degraded' })
    expect(degraded).toMatchObject({
      key: 'cap:dynamic',
      state: 'degraded',
      metadata: { reason: 'upstream-degraded' },
    })
    expect(host.isCapabilityReady('cap:dynamic')).toBe(false)

    const withdrawn = host.withdrawCapability('cap:dynamic', { reason: 'disabled' })
    expect(withdrawn).toMatchObject({
      key: 'cap:dynamic',
      state: 'withdrawn',
      metadata: { reason: 'disabled' },
    })
    expect(host.isCapabilityReady('cap:dynamic')).toBe(false)
    expect(host.listCapabilities()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'cap:dynamic',
        state: 'withdrawn',
      }),
    ]))
  })

  it('should resolve waits only when capability reaches ready state', async () => {
    const host = new PluginHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
    })

    host.markCapabilityDegraded('cap:unstable', { reason: 'booting' })
    const waiting = host.waitForCapability('cap:unstable', 2000)

    await new Promise(resolve => setTimeout(resolve, 20))
    host.withdrawCapability('cap:unstable', { reason: 'restarting' })

    await new Promise(resolve => setTimeout(resolve, 20))
    host.markCapabilityReady('cap:unstable', { source: 'recovered' })

    const resolved = await waiting
    expect(resolved).toMatchObject({
      key: 'cap:unstable',
      state: 'ready',
      metadata: { source: 'recovered' },
    })
  })

  it('should preserve previous cwd when reloading plugin', async () => {
    const host = new PluginHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
    })
    reportPluginCapability(host, {
      key: providersCapability,
      state: 'ready',
      metadata: { source: 'test' },
    })

    const session = await host.start({
      apiVersion: 'v1',
      kind: 'manifest.plugin.airi.moeru.ai',
      name: 'test-reload-relative-entrypoint',
      permissions: testManifest.permissions,
      entrypoints: {
        electron: './test-normal-plugin.ts',
      },
    }, { cwd: join(import.meta.dirname, 'testdata') })

    const reloaded = await host.reload(session.id)
    expect(reloaded.phase).toBe('ready')
  })

  it('should emit downgraded compatibility result when fallback versions overlap', async () => {
    const host = new PluginHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
      protocolVersion: 'v2',
      apiVersion: 'v2',
      supportedProtocolVersions: ['v1'],
      supportedApiVersions: ['v1'],
    })
    reportPluginCapability(host, {
      key: providersCapability,
      state: 'ready',
      metadata: { source: 'test' },
    })

    const session = await host.load(testManifest, { cwd: '' })
    const compatibilityEvents: Array<{ body?: Record<string, unknown> }> = []
    session.channels.host.on(moduleCompatibilityResult, (payload) => {
      compatibilityEvents.push(payload as unknown as { body?: Record<string, unknown> })
    })

    const initialized = await host.init(session.id, {
      compatibility: {
        supportedProtocolVersions: ['v1'],
        supportedApiVersions: ['v1'],
      },
    })

    expect(initialized.phase).toBe('ready')
    expect(compatibilityEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        body: expect.objectContaining({
          protocolVersion: 'v1',
          apiVersion: 'v1',
          mode: 'downgraded',
        }),
      }),
    ]))
  })

  it('should trim whitespace in supported compatibility versions before negotiating', async () => {
    const host = new PluginHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
      protocolVersion: 'v2',
      apiVersion: 'v2',
      supportedProtocolVersions: [' v1 '],
      supportedApiVersions: [' v1 '],
    })
    reportPluginCapability(host, {
      key: providersCapability,
      state: 'ready',
      metadata: { source: 'test' },
    })

    const session = await host.load(testManifest, { cwd: '' })
    const compatibilityEvents: Array<{ body?: Record<string, unknown> }> = []
    session.channels.host.on(moduleCompatibilityResult, (payload) => {
      compatibilityEvents.push(payload as unknown as { body?: Record<string, unknown> })
    })

    const initialized = await host.init(session.id, {
      compatibility: {
        supportedProtocolVersions: [' v1 '],
        supportedApiVersions: [' v1 '],
      },
    })

    expect(initialized.phase).toBe('ready')
    expect(compatibilityEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        body: expect.objectContaining({
          protocolVersion: 'v1',
          apiVersion: 'v1',
          mode: 'downgraded',
        }),
      }),
    ]))
  })

  it('should reject initialization when compatibility has no overlap', async () => {
    const host = new PluginHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
      protocolVersion: 'v2',
      apiVersion: 'v2',
    })

    const session = await host.load(testManifest, { cwd: '' })

    await expect(host.init(session.id, {
      compatibility: {
        supportedProtocolVersions: ['v9'],
        supportedApiVersions: ['v9'],
      },
    })).rejects.toThrow('Negotiation rejected:')

    expect(host.getSession(session.id)?.phase).toBe('failed')
  })

  it('should isolate module status events between plugin sessions', async () => {
    const host = new PluginHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
    })
    reportPluginCapability(host, {
      key: providersCapability,
      state: 'ready',
      metadata: { source: 'test' },
    })

    const sessionOne = await host.start({
      ...testManifest,
      name: 'test-plugin-session-one',
    }, { cwd: '' })
    const sessionTwo = await host.start({
      ...testManifest,
      name: 'test-plugin-session-two',
    }, { cwd: '' })

    const onSessionOneStatus = vi.fn()
    const onSessionTwoStatus = vi.fn()
    sessionOne.channels.host.on(moduleStatus, onSessionOneStatus)
    sessionTwo.channels.host.on(moduleStatus, onSessionTwoStatus)

    host.markConfigurationNeeded(sessionOne.id, 'session-one-only')

    expect(onSessionOneStatus).toHaveBeenCalled()
    expect(onSessionTwoStatus).not.toHaveBeenCalled()
  })

  it('should keep invoke handlers isolated per plugin context', async () => {
    const host = new PluginHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
    })

    const sessionOne = await host.load({
      ...testManifest,
      name: 'test-plugin-session-one',
    }, { cwd: '' })
    const sessionTwo = await host.load({
      ...testManifest,
      name: 'test-plugin-session-two',
    }, { cwd: '' })

    defineInvokeHandler(sessionOne.channels.host, protocolProviders.listProviders, async () => [{ name: 'provider:one' }])
    defineInvokeHandler(sessionTwo.channels.host, protocolProviders.listProviders, async () => [{ name: 'provider:two' }])

    const invokeOne = defineInvoke(sessionOne.channels.host, protocolProviders.listProviders)
    const invokeTwo = defineInvoke(sessionTwo.channels.host, protocolProviders.listProviders)

    await expect(invokeOne()).resolves.toEqual([{ name: 'provider:one' }])
    await expect(invokeTwo()).resolves.toEqual([{ name: 'provider:two' }])
  })

  it('should expose provider resources through the generic resource resolver API', async () => {
    const host = new PluginHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
    })

    host.setResourceResolver(providersCapability, () => [{ name: 'provider:generic' }])

    const session = await host.load(testManifest, { cwd: '' })
    const invokeProviders = defineInvoke(session.channels.host, protocolProviders.listProviders)

    await expect(invokeProviders()).resolves.toEqual([{ name: 'provider:generic' }])
  })

  it('should include active modules in registry sync when initializing another session', async () => {
    const host = new PluginHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
    })
    reportPluginCapability(host, {
      key: providersCapability,
      state: 'ready',
      metadata: { source: 'test' },
    })

    const sessionOne = await host.start({
      ...testManifest,
      name: 'test-plugin-session-one',
    }, { cwd: '' })
    expect(sessionOne.phase).toBe('ready')

    const sessionTwo = await host.load({
      ...testManifest,
      name: 'test-plugin-session-two',
    }, { cwd: '' })

    const syncEvents: Array<{ body?: { modules?: Array<{ name: string }> } }> = []
    sessionTwo.channels.host.on(registryModulesSync, payload => syncEvents.push(payload))

    const initialized = await host.init(sessionTwo.id)
    expect(initialized.phase).toBe('ready')

    const moduleNames = syncEvents
      .flatMap(event => event.body?.modules ?? [])
      .map(module => module.name)

    expect(moduleNames).toContain('test-plugin-session-one')
    expect(moduleNames).toContain('test-plugin-session-two')
  })

  it('should support runtime permission requests before granting deferred scopes', async () => {
    const host = new PluginHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
    })
    host.setResourceValue(providersCapability, [{ name: 'provider:runtime' }])

    const session = await host.load({
      ...testManifest,
      permissions: {},
    }, { cwd: '' })

    const invokeProviders = defineInvoke(session.channels.host, protocolProviders.listProviders)
    await expect(invokeProviders()).rejects.toThrow(`Permission denied: apis.invoke "${providersCapability}"`)

    const declareEvents: Array<{ body?: Record<string, unknown> }> = []
    const currentEvents: Array<{ body?: Record<string, unknown> }> = []
    const requestEvents: Array<{ body?: Record<string, unknown> }> = []
    const grantedEvents: Array<{ body?: Record<string, unknown> }> = []

    session.channels.host.on(modulePermissionsDeclare, payload => declareEvents.push(payload as unknown as { body?: Record<string, unknown> }))
    session.channels.host.on(modulePermissionsCurrent, payload => currentEvents.push(payload as unknown as { body?: Record<string, unknown> }))
    session.channels.host.on(modulePermissionsRequest, payload => requestEvents.push(payload as unknown as { body?: Record<string, unknown> }))
    session.channels.host.on(modulePermissionsGranted, payload => grantedEvents.push(payload as unknown as { body?: Record<string, unknown> }))

    const runtimeRequest = {
      apis: [
        { key: providersCapability, actions: ['invoke'], reason: 'Use providers API on demand' },
      ],
      resources: [
        { key: providersCapability, actions: ['read'], reason: 'Read providers resource on demand' },
      ],
    } satisfies ModulePermissionDeclaration

    host.requestPermissions(session.id, runtimeRequest, 'Enable provider lookup')

    expect(host.getSession(session.id)?.permissions.requested).toEqual({
      apis: [
        { key: providersCapability, actions: ['invoke'], reason: 'Use providers API on demand' },
      ],
      resources: [
        { key: providersCapability, actions: ['read'], reason: 'Read providers resource on demand' },
      ],
      capabilities: [],
      processors: [],
      pipelines: [],
    })
    expect(requestEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        body: expect.objectContaining({
          requested: expect.objectContaining({
            apis: [
              expect.objectContaining({ key: providersCapability, actions: ['invoke'] }),
            ],
            resources: [
              expect.objectContaining({ key: providersCapability, actions: ['read'] }),
            ],
          }),
          reason: 'Enable provider lookup',
        }),
      }),
    ]))
    expect(declareEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        body: expect.objectContaining({
          source: 'runtime',
        }),
      }),
    ]))
    expect(currentEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        body: expect.objectContaining({
          requested: expect.objectContaining({
            apis: [
              expect.objectContaining({ key: providersCapability, actions: ['invoke'] }),
            ],
          }),
          granted: expect.objectContaining({
            apis: [],
            resources: [],
          }),
        }),
      }),
    ]))

    await expect(invokeProviders()).rejects.toThrow(`Permission denied: apis.invoke "${providersCapability}"`)

    host.grantPermissions(session.id, {
      apis: [
        { key: providersCapability, actions: ['invoke'] },
      ],
      resources: [
        { key: providersCapability, actions: ['read'] },
      ],
    })

    expect(host.getSession(session.id)?.permissions.granted).toEqual({
      apis: [
        { key: providersCapability, actions: ['invoke'], reason: 'Use providers API on demand' },
      ],
      resources: [
        { key: providersCapability, actions: ['read'], reason: 'Read providers resource on demand' },
      ],
      capabilities: [],
      processors: [],
      pipelines: [],
    })
    expect(grantedEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        body: expect.objectContaining({
          granted: expect.objectContaining({
            apis: [
              expect.objectContaining({ key: providersCapability, actions: ['invoke'] }),
            ],
            resources: [
              expect.objectContaining({ key: providersCapability, actions: ['read'] }),
            ],
          }),
        }),
      }),
    ]))

    await expect(invokeProviders()).resolves.toEqual([{ name: 'provider:runtime' }])
  })

  it('should isolate runtime permission grants between concurrent same-name sessions', async () => {
    const host = new PluginHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
    })
    host.setResourceValue(providersCapability, [{ name: 'provider:runtime' }])

    const manifest = {
      ...testManifest,
      permissions: {},
    }

    const firstSession = await host.load(manifest, { cwd: '' })
    const secondSession = await host.load(manifest, { cwd: '' })

    const firstInvokeProviders = defineInvoke(firstSession.channels.host, protocolProviders.listProviders)
    const secondInvokeProviders = defineInvoke(secondSession.channels.host, protocolProviders.listProviders)

    const runtimeRequest = {
      apis: [
        { key: providersCapability, actions: ['invoke'], reason: 'Use providers API on demand' },
      ],
      resources: [
        { key: providersCapability, actions: ['read'], reason: 'Read providers resource on demand' },
      ],
    } satisfies ModulePermissionDeclaration

    host.requestPermissions(firstSession.id, runtimeRequest)
    host.requestPermissions(secondSession.id, runtimeRequest)

    host.grantPermissions(firstSession.id, {
      apis: [
        { key: providersCapability, actions: ['invoke'] },
      ],
      resources: [
        { key: providersCapability, actions: ['read'] },
      ],
    })

    await expect(firstInvokeProviders()).resolves.toEqual([{ name: 'provider:runtime' }])
    await expect(secondInvokeProviders()).rejects.toThrow(`Permission denied: apis.invoke "${providersCapability}"`)

    expect(host.getSession(firstSession.id)?.permissions.granted).toEqual({
      apis: [
        { key: providersCapability, actions: ['invoke'], reason: 'Use providers API on demand' },
      ],
      resources: [
        { key: providersCapability, actions: ['read'], reason: 'Read providers resource on demand' },
      ],
      capabilities: [],
      processors: [],
      pipelines: [],
    })
    expect(host.getSession(secondSession.id)?.permissions.granted).toEqual({
      apis: [],
      resources: [],
      capabilities: [],
      processors: [],
      pipelines: [],
    })
  })
})

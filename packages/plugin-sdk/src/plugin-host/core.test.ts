import { join } from 'node:path'

import { createContext, defineEventa, defineInvokeHandler } from '@moeru/eventa'
import { moduleStatus } from '@proj-airi/plugin-protocol/types'
import { describe, expect, it, vi } from 'vitest'

import { FileSystemLoader, PluginHost } from '.'
import { createApis } from '../plugin/apis/client'
import { protocolCapabilityWait, protocolProviders } from '../plugin/apis/protocol'

function reportPluginCapability(
  host: PluginHost,
  payload: { key: string, state: 'announced' | 'ready', metadata?: Record<string, unknown> },
) {
  if (payload.state === 'announced') {
    return host.announceCapability(payload.key, payload.metadata)
  }

  return host.markCapabilityReady(payload.key, payload.metadata)
}

describe('for FileSystemPluginHost', () => {
  it('should load test-normal-plugin from manifest', async () => {
    const host = new FileSystemLoader()

    const pluginDef = await host.loadPluginFor({
      apiVersion: 'v1',
      kind: 'manifest.plugin.airi.moeru.ai',
      name: 'test-plugin',
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

  it('should throw deterministic error when no runtime entrypoint exists', () => {
    const host = new FileSystemLoader()

    expect(() => host.resolveEntrypointFor({
      apiVersion: 'v1',
      kind: 'manifest.plugin.airi.moeru.ai',
      name: 'test-plugin',
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
      entrypoints: {
        electron: './test-normal-plugin.ts',
      },
    }, { cwd: join(import.meta.dirname, 'testdata') })

    const reloaded = await host.reload(session.id)
    expect(reloaded.phase).toBe('ready')
  })
})

import { join } from 'node:path'

import { createContext, defineEventa, defineInvokeHandler } from '@moeru/eventa'
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
})

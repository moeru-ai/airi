import { join } from 'node:path'

import { createContext, defineEventa, defineInvokeHandler } from '@moeru/eventa'
import { describe, expect, it, vi } from 'vitest'

import { FileSystemLoader } from '.'
import { createApis } from '../plugin/apis/client'
import { protocolProviders } from '../plugin/apis/protocol'

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
    }, { cwd: '' })

    const ctx = createContext()
    const apis = createApis(ctx)
    const onVitestCall = vi.fn()
    ctx.on(defineEventa('vitest-call:init'), onVitestCall)

    await expect(pluginDef.init?.({ channels: { host: ctx }, apis })).resolves.not.toThrow()
    expect(onVitestCall).toHaveBeenCalledTimes(1)
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
    }, { cwd: '' })).rejects.toThrow('Test error plugin always throws an error during loading.')
  })
})

describe('for PluginHost', () => {
  it('should be able to expose setupModules', async () => {
    const host = new FileSystemLoader()

    const pluginDef = await host.loadPluginFor({
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

    const onProviderListCall = vi.fn()
    ctx.on(protocolProviders.listProviders.sendEvent, onProviderListCall)
    await expect(pluginDef.setupModules?.({ channels: { host: ctx }, apis })).resolves.not.toThrow()
    expect(onProviderListCall).toHaveBeenCalledTimes(1)
  })
})

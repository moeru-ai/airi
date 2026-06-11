import type { ExtensionManifestV1, ModulePermissionDeclaration } from './shared/types'

import { join } from 'node:path'

import { defineInvoke, defineInvokeHandler } from '@moeru/eventa'
import {
  moduleCompatibilityResult,
  modulePermissionsCurrent,
  modulePermissionsDeclare,
  modulePermissionsDenied,
  modulePermissionsGranted,
  modulePermissionsRequest,
  moduleStatus,
  registryModulesSync,
} from '@proj-airi/plugin-protocol/types'
import { safeParse } from 'valibot'
import { describe, expect, it, vi } from 'vitest'

import { ExtensionHost, extensionManifestV1Schema, FileSystemLoader } from '.'
import { defineExtension } from '../extension'
import { defineKit } from '../kit'
import { protocolProviders } from '../plugin/apis/protocol'

describe('extension manifest schema', () => {
  it('accepts extension.airi.json v1 manifests', () => {
    const result = safeParse(extensionManifestV1Schema, {
      apiVersion: 'v1',
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'airi-extension-test',
      permissions: {},
      entrypoints: {
        electron: './extension.mjs',
      },
    })

    expect(result.success).toBe(true)
  })

  it('rejects legacy extension manifests', () => {
    const result = safeParse(extensionManifestV1Schema, {
      apiVersion: 'v1',
      kind: 'manifest.plugin.airi.moeru.ai',
      name: 'airi-plugin-test',
      permissions: {},
      entrypoints: {
        electron: './plugin.mjs',
      },
    })

    expect(result.success).toBe(false)
  })
})

describe('for ExtensionHost', () => {
  it('runs extension setup and registers multiple module sessions', async () => {
    const host = new ExtensionHost()
    const extension = defineExtension({
      id: 'airi-extension-test',
      async setup(ctx) {
        await ctx.modules.register({ id: 'module-a' })
        await ctx.modules.register({ id: 'module-b' })
      },
    })

    const session = await host.startExtension(extension, {
      manifest: {
        apiVersion: 'v1',
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-test',
        permissions: {},
        entrypoints: {},
      },
    })

    expect(session.extension.id).toBe('airi-extension-test')
    expect(host.listModules().map(module => module.id)).toEqual(['module-a', 'module-b'])
  })

  it('rejects defineExtension entrypoint ids that do not match the manifest id', async () => {
    const host = new ExtensionHost()
    const extension = defineExtension({
      id: 'airi-extension-entrypoint-id',
      async setup() {},
    })

    await expect(host.startExtension(extension, {
      manifest: {
        apiVersion: 'v1',
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-manifest-id',
        permissions: {},
        entrypoints: {},
      },
    })).rejects.toThrow(
      'Extension entrypoint id `airi-extension-entrypoint-id` must match manifest id `airi-extension-manifest-id`.',
    )
  })

  it('disposes modules registered before setup failure', async () => {
    const disposed: string[] = []
    const host = new ExtensionHost()
    const extension = defineExtension({
      id: 'airi-extension-failing',
      async setup(ctx) {
        const first = await ctx.modules.register({ id: 'first' })
        first.subscriptions.add({
          dispose: () => {
            disposed.push('first-subscription')
          },
        })
        const second = await ctx.modules.register({ id: 'second' })
        second.subscriptions.add({
          dispose: () => {
            disposed.push('second-subscription')
          },
        })
        throw new Error('setup failed')
      },
    })

    await expect(host.startExtension(extension, {
      manifest: {
        apiVersion: 'v1',
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-failing',
        permissions: {},
        entrypoints: {},
      },
    })).rejects.toThrow('setup failed')

    expect(disposed).toEqual(['second-subscription', 'first-subscription'])
    expect(host.listModules()).toEqual([])
  })

  it('cleans up extension kit resources registered before setup failure', async () => {
    const host = new ExtensionHost()
    const kit = defineKit({
      id: 'kit.cleanup-failure',
      version: '1.0.0',
      createClient: runtime => ({
        bind() {
          return host.bindExtensionKitModule(runtime.sessionId, {
            moduleId: 'cleanup-failure-gamelet',
            kitId: 'kit.cleanup-failure',
            kitModuleType: 'gamelet',
            config: {},
          })
        },
        registerTool() {
          host.registerExtensionTool(runtime.sessionId, {
            tool: {
              id: 'cleanup_failure_tool',
              title: 'Cleanup Failure Tool',
              description: 'Verifies failed setup cleanup.',
              activation: {
                keywords: ['cleanup'],
                patterns: ['cleanup'],
              },
              parameters: {
                type: 'object',
                properties: {},
              },
            },
            execute: async () => ({ ok: true }),
          })
        },
      }),
    })
    host.registerKitApi(kit)
    const extension = defineExtension({
      id: 'airi-extension-cleanup-failure',
      async setup(ctx) {
        const client = await ctx.kits.use(kit)
        client.bind()
        client.registerTool()
        throw new Error('setup failed after resource registration')
      },
    })

    await expect(host.startExtension(extension, {
      manifest: {
        apiVersion: 'v1',
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-cleanup-failure',
        permissions: {
          apis: [
            { key: 'kit.cleanup-failure', actions: ['invoke'] },
            { key: 'proj-airi:plugin-sdk:apis:client:tools:register', actions: ['invoke'] },
          ],
          resources: [
            { key: 'proj-airi:plugin-sdk:resources:kits:kit.cleanup-failure:bindings', actions: ['write'] },
            { key: 'proj-airi:plugin-sdk:resources:tools', actions: ['write'] },
          ],
        },
        entrypoints: {},
      },
    })).rejects.toThrow('setup failed after resource registration')

    expect(host.listBindings()).toEqual([])
    await expect(host.listAvailableToolDescriptors()).resolves.toEqual([])
    await expect(host.invokeTool('airi-extension-cleanup-failure', 'cleanup_failure_tool', {})).rejects.toThrow(
      'Plugin tool not found: airi-extension-cleanup-failure:cleanup_failure_tool',
    )
  })

  /**
   * @example
   * expect(host.listBindings()).toEqual([])
   */
  it('cleans up module-scoped kit resources when the module is disposed', async () => {
    const host = new ExtensionHost()
    const kit = defineKit({
      id: 'kit.module-dispose',
      version: '1.0.0',
      createClient: runtime => ({
        bind() {
          return host.bindExtensionKitModule(runtime.sessionId, {
            moduleId: 'module-dispose-gamelet',
            kitId: 'kit.module-dispose',
            kitModuleType: 'gamelet',
            config: {},
          }, runtime.moduleId)
        },
        registerTool() {
          host.registerExtensionTool(runtime.sessionId, {
            tool: {
              id: 'module_dispose_tool',
              title: 'Module Dispose Tool',
              description: 'Verifies module-scoped cleanup.',
              activation: {
                keywords: ['dispose'],
                patterns: ['dispose'],
              },
              parameters: {
                type: 'object',
                properties: {},
              },
            },
            execute: async () => ({ ok: true }),
          }, runtime.moduleId)
        },
        registerToolsetPrompt() {
          host.registerExtensionToolsetPrompt(runtime.sessionId, {
            id: 'module-dispose-tools',
            prompt: {
              id: 'module-dispose.prompt',
              title: 'Module Dispose Prompt',
              content: 'Module-scoped prompt.',
            },
          }, runtime.moduleId)
        },
      }),
    })
    host.registerKitApi(kit)
    const permissions: ModulePermissionDeclaration = {
      apis: [
        { key: 'kit.module-dispose', actions: ['invoke'] },
        { key: 'proj-airi:plugin-sdk:apis:client:tools:register', actions: ['invoke'] },
      ],
      resources: [
        { key: 'proj-airi:plugin-sdk:resources:kits:kit.module-dispose:bindings', actions: ['write'] },
        { key: 'proj-airi:plugin-sdk:resources:tools', actions: ['write'] },
      ],
    }
    const extension = defineExtension({
      id: 'airi-extension-module-dispose',
      async setup(ctx) {
        const module = await ctx.modules.register({
          id: 'module-dispose',
          permissions,
        })
        const client = await module.kits.use(kit)
        client.bind()
        client.registerTool()
        client.registerToolsetPrompt()

        await module.dispose()
      },
    })

    const session = await host.startExtension(extension, {
      manifest: {
        apiVersion: 'v1',
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-module-dispose',
        permissions,
        entrypoints: {},
      },
    })

    expect(session.phase).toBe('ready')
    expect(host.listModules()).toEqual([])
    expect(host.listBindings()).toEqual([])
    await expect(host.listAvailableToolDescriptors()).resolves.toEqual([])
    await expect(host.listSerializedXsaiTools()).resolves.toEqual({
      prompts: [],
      tools: [],
    })
    await expect(host.invokeTool('airi-extension-module-dispose', 'module_dispose_tool', {})).rejects.toThrow(
      'Plugin tool not found: airi-extension-module-dispose:module_dispose_tool',
    )
  })

  it('lets extension setup use granted kits without registering a module', async () => {
    const host = new ExtensionHost()
    const kit = defineKit({
      id: 'kit.extension-direct',
      version: '1.0.0',
      createClient: runtime => ({
        ping: () => `${runtime.extensionId}:${runtime.sessionId}:${runtime.moduleId ?? 'root'}`,
      }),
    })
    host.registerKitApi(kit)

    let observed = ''
    const extension = defineExtension({
      id: 'airi-extension-direct-kit',
      async setup(ctx) {
        const client = await ctx.kits.use(kit)
        observed = client.ping()
      },
    })

    await host.startExtension(extension, {
      manifest: {
        apiVersion: 'v1',
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-direct-kit',
        permissions: {
          apis: [{ key: 'kit.extension-direct', actions: ['invoke'] }],
        },
        entrypoints: {},
      },
    })

    expect(observed).toContain('airi-extension-direct-kit:')
    expect(observed).toContain(':root')
    expect(host.listModules()).toEqual([])
  })

  it('denies extension-scoped kit use when the extension grant does not allow the kit', async () => {
    const host = new ExtensionHost()
    const kit = defineKit({
      id: 'kit.extension-denied',
      version: '1.0.0',
      createClient: () => ({ ping: () => 'pong' }),
    })
    host.registerKitApi(kit)

    const extension = defineExtension({
      id: 'airi-extension-direct-kit-denied',
      async setup(ctx) {
        const result = await ctx.kits.tryUse(kit)
        expect(result.ok).toBe(false)
        if (!('reason' in result)) {
          throw new Error('Expected direct kit use to be denied.')
        }
        expect(result.reason).toBe('permission-denied')
      },
    })

    await host.startExtension(extension, {
      manifest: {
        apiVersion: 'v1',
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-direct-kit-denied',
        permissions: {
          apis: [{ key: 'kit.other', actions: ['invoke'] }],
        },
        entrypoints: {},
      },
    })
  })

  it('denies extension-scoped kit use when host permission resolver narrows the manifest grant', async () => {
    const host = new ExtensionHost({
      permissionResolver: () => ({
        apis: [{ key: 'kit.other', actions: ['invoke'] }],
      }),
    })
    const kit = defineKit({
      id: 'kit.extension-resolver-denied',
      version: '1.0.0',
      createClient: () => ({ ping: () => 'pong' }),
    })
    host.registerKitApi(kit)

    const extension = defineExtension({
      id: 'airi-extension-direct-kit-resolver-denied',
      async setup(ctx) {
        const result = await ctx.kits.tryUse(kit)
        expect(result.ok).toBe(false)
        if (!('reason' in result)) {
          throw new Error('Expected direct kit use to be denied.')
        }
        expect(result.reason).toBe('permission-denied')
      },
    })

    await host.startExtension(extension, {
      manifest: {
        apiVersion: 'v1',
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-direct-kit-resolver-denied',
        permissions: {
          apis: [{ key: 'kit.extension-resolver-denied', actions: ['invoke'] }],
        },
        entrypoints: {},
      },
    })
  })

  it('does not let persisted grants override a later permission resolver decision', async () => {
    let grantRequestedKit = true
    const host = new ExtensionHost({
      permissionResolver: () => ({
        apis: [{
          key: grantRequestedKit ? 'kit.extension-persisted-revoked' : 'kit.other',
          actions: ['invoke'],
        }],
      }),
    })
    const kit = defineKit({
      id: 'kit.extension-persisted-revoked',
      version: '1.0.0',
      createClient: () => ({ ping: () => 'pong' }),
    })
    host.registerKitApi(kit)

    const manifest = {
      apiVersion: 'v1',
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'airi-extension-direct-kit-persisted-revoked',
      permissions: {
        apis: [{ key: 'kit.extension-persisted-revoked', actions: ['invoke'] }],
      },
      entrypoints: {},
    } satisfies ExtensionManifestV1

    const grantedExtension = defineExtension({
      id: 'airi-extension-direct-kit-persisted-revoked',
      async setup(ctx) {
        const result = await ctx.kits.tryUse(kit)
        expect(result.ok).toBe(true)
      },
    })

    await host.startExtension(grantedExtension, { manifest })

    grantRequestedKit = false
    const revokedExtension = defineExtension({
      id: 'airi-extension-direct-kit-persisted-revoked',
      async setup(ctx) {
        const result = await ctx.kits.tryUse(kit)
        expect(result.ok).toBe(false)
        if (!('reason' in result)) {
          throw new Error('Expected direct kit use to be denied.')
        }
        expect(result.reason).toBe('permission-denied')
      },
    })

    await host.startExtension(revokedExtension, { manifest })
  })

  it('denies module-scoped kit use when host permission resolver narrows the extension grant', async () => {
    const host = new ExtensionHost({
      permissionResolver: () => ({
        apis: [{ key: 'kit.other', actions: ['invoke'] }],
      }),
    })
    const kit = defineKit({
      id: 'kit.module-resolver-denied',
      version: '1.0.0',
      createClient: () => ({ ping: () => 'pong' }),
    })
    host.registerKitApi(kit)

    const extension = defineExtension({
      id: 'airi-extension-module-kit-resolver-denied',
      async setup(ctx) {
        const module = await ctx.modules.register({
          id: 'module-a',
          permissions: {
            apis: [{ key: 'kit.module-resolver-denied', actions: ['invoke'] }],
          },
        })
        const result = await module.kits.tryUse(kit)
        expect(result.ok).toBe(false)
        if (!('reason' in result)) {
          throw new Error('Expected module kit use to be denied.')
        }
        expect(result.reason).toBe('permission-denied')
      },
    })

    await host.startExtension(extension, {
      manifest: {
        apiVersion: 'v1',
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-module-kit-resolver-denied',
        permissions: {
          apis: [{ key: 'kit.module-resolver-denied', actions: ['invoke'] }],
        },
        entrypoints: {},
      },
    })
  })

  it('lets extension setup watch kit availability without registering a module', async () => {
    const host = new ExtensionHost()
    const kit = defineKit({
      id: 'kit.extension-watch',
      version: '1.0.0',
      createClient: () => ({ ping: () => 'pong' }),
    })

    const observed: boolean[] = []
    const extension = defineExtension({
      id: 'airi-extension-direct-kit-watch',
      async setup(ctx) {
        ctx.kits.watch(kit, (availability) => {
          observed.push(availability.available)
        })
      },
    })

    await host.startExtension(extension, {
      manifest: {
        apiVersion: 'v1',
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-direct-kit-watch',
        permissions: {
          apis: [{ key: 'kit.extension-watch', actions: ['invoke'] }],
        },
        entrypoints: {},
      },
    })

    host.registerKitApi(kit)

    expect(observed).toEqual([false, true])
  })

  it('disposes extension-scoped kit availability watchers with the extension session', async () => {
    const host = new ExtensionHost()
    const kit = defineKit({
      id: 'kit.extension-watch-dispose',
      version: '1.0.0',
      createClient: () => ({ ping: () => 'pong' }),
    })

    const observed: boolean[] = []
    const extension = defineExtension({
      id: 'airi-extension-direct-kit-watch-dispose',
      async setup(ctx) {
        ctx.kits.watch(kit, (availability) => {
          observed.push(availability.available)
        })
      },
    })

    const session = await host.startExtension(extension, {
      manifest: {
        apiVersion: 'v1',
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-direct-kit-watch-dispose',
        permissions: {
          apis: [{ key: 'kit.extension-watch-dispose', actions: ['invoke'] }],
        },
        entrypoints: {},
      },
    })

    await session.subscriptions.dispose()
    host.registerKitApi(kit)

    expect(observed).toEqual([false])
  })

  it('supports required, optional, and watched kit availability', async () => {
    const host = new ExtensionHost()
    const kit = defineKit({
      id: 'kit.test',
      version: '1.0.0',
      createClient: () => ({ ping: () => 'pong' }),
    })
    host.registerKitApi(kit)

    let watched = false
    const extension = defineExtension({
      id: 'airi-extension-kit-test',
      async setup(ctx) {
        const module = await ctx.modules.register({
          id: 'module-a',
          permissions: {
            apis: [{ key: 'kit.test', actions: ['invoke'] }],
          },
        })
        const client = await module.kits.use(kit)
        expect(client.ping()).toBe('pong')

        const result = await module.kits.tryUse(kit)
        expect(result.ok).toBe(true)

        module.kits.watch(kit, (availability) => {
          watched = availability.available
        })
      },
    })

    await host.startExtension(extension, {
      manifest: {
        apiVersion: 'v1',
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-kit-test',
        permissions: {
          apis: [{ key: 'kit.*', actions: ['invoke'] }],
        },
        entrypoints: {},
      },
    })

    expect(watched).toBe(true)
  })

  it('disposes module-scoped kit availability watchers with the module scope', async () => {
    const host = new ExtensionHost()
    const kit = defineKit({
      id: 'kit.module-watch-dispose',
      version: '1.0.0',
      createClient: () => ({ ping: () => 'pong' }),
    })

    const observed: boolean[] = []
    let disposeModule: (() => Promise<void>) | undefined
    const extension = defineExtension({
      id: 'airi-extension-module-kit-watch-dispose',
      async setup(ctx) {
        const module = await ctx.modules.register({
          id: 'module-a',
          permissions: {
            apis: [{ key: 'kit.module-watch-dispose', actions: ['invoke'] }],
          },
        })
        disposeModule = module.dispose
        module.kits.watch(kit, (availability) => {
          observed.push(availability.available)
        })
      },
    })

    await host.startExtension(extension, {
      manifest: {
        apiVersion: 'v1',
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-module-kit-watch-dispose',
        permissions: {
          apis: [{ key: 'kit.module-watch-dispose', actions: ['invoke'] }],
        },
        entrypoints: {},
      },
    })

    if (!disposeModule) {
      throw new Error('Expected module scope to be registered.')
    }
    await disposeModule()
    host.registerKitApi(kit)

    expect(observed).toEqual([false])
  })

  it('rejects duplicate module ids without replacing the registered module', async () => {
    const host = new ExtensionHost()
    const disposed: string[] = []
    const extension = defineExtension({
      id: 'airi-extension-duplicate-module',
      async setup(ctx) {
        const first = await ctx.modules.register({ id: 'module-a' })
        first.subscriptions.add({
          dispose: () => {
            disposed.push('first')
          },
        })

        await expect(ctx.modules.register({ id: 'module-a' })).rejects.toThrow(
          'Extension module `module-a` is already registered',
        )
      },
    })

    const session = await host.startExtension(extension, {
      manifest: {
        apiVersion: 'v1',
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-duplicate-module',
        permissions: {},
        entrypoints: {},
      },
    })

    expect([...session.modules.keys()]).toEqual(['module-a'])

    await host.stop(session.id)

    expect(disposed).toEqual(['first'])
  })

  it('waits for async extension module cleanup while stopping a defineExtension session', async () => {
    const host = new ExtensionHost()
    const cleanupOrder: string[] = []
    const extension = defineExtension({
      id: 'airi-extension-async-stop-cleanup',
      async setup(ctx) {
        const module = await ctx.modules.register({ id: 'module-a' })
        module.subscriptions.add({
          dispose: async () => {
            await new Promise(resolve => setTimeout(resolve, 0))
            cleanupOrder.push('module-cleanup')
          },
        })
      },
    })

    const session = await host.startExtension(extension, {
      manifest: {
        apiVersion: 'v1',
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-async-stop-cleanup',
        permissions: {},
        entrypoints: {},
      },
    })

    const stopped = host.stop(session.id)

    expect(cleanupOrder).toEqual([])

    await stopped

    expect(cleanupOrder).toEqual(['module-cleanup'])
  })

  it('denies kit use when module permissions exceed the extension grant ceiling', async () => {
    const host = new ExtensionHost()
    const kit = defineKit({
      id: 'kit.denied',
      version: '1.0.0',
      createClient: () => ({ ping: () => 'pong' }),
    })
    host.registerKitApi(kit)

    const extension = defineExtension({
      id: 'airi-extension-kit-denied',
      async setup(ctx) {
        const module = await ctx.modules.register({
          id: 'module-a',
          permissions: {
            apis: [{ key: 'kit.denied', actions: ['invoke'] }],
          },
        })
        const result = await module.kits.tryUse(kit)
        expect(result.ok).toBe(false)
        if (!('reason' in result)) {
          throw new Error('Expected kit use to be denied.')
        }
        expect(result.reason).toBe('permission-denied')
      },
    })

    await host.startExtension(extension, {
      manifest: {
        apiVersion: 'v1',
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-kit-denied',
        permissions: {
          apis: [{ key: 'kit.other', actions: ['invoke'] }],
        },
        entrypoints: {},
      },
    })
  })
})

function assertNever(value: never): never {
  throw new Error(`Unsupported capability state: ${value}`)
}

function reportPluginCapability(
  host: ExtensionHost,
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

describe('for FileSystemLoader', () => {
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

  /**
   * @example
   * expect(host.listModules().map(module => module.id)).toEqual(['defined-extension-module'])
   */
  it('loads defineExtension entrypoints from extension manifests', async () => {
    const host = new ExtensionHost()

    await host.start({
      apiVersion: 'v1',
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-define-extension-entrypoint',
      permissions: {},
      entrypoints: {
        electron: join(import.meta.dirname, 'testdata', 'test-define-extension-entrypoint.ts'),
      },
    }, { cwd: '', runtime: 'electron' })

    expect(host.listModules().map(module => module.id)).toEqual(['defined-extension-module'])
  })

  /**
   * @example
   * expect(host.listModules()).toEqual([])
   */
  it('stops defineExtension entrypoint sessions loaded through host.start', async () => {
    const host = new ExtensionHost()
    const entrypointPath = join(import.meta.dirname, 'testdata', 'test-stoppable-extension-entrypoint.ts')
    const testEntrypoint = await import('./testdata/test-stoppable-extension-entrypoint')
    testEntrypoint.disposedSessionIds.splice(0)

    const session = await host.start({
      apiVersion: 'v1',
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-stoppable-extension-entrypoint',
      permissions: {},
      entrypoints: {
        electron: entrypointPath,
      },
    }, { cwd: '', runtime: 'electron' })

    expect(host.listModules().map(module => module.id)).toEqual(['stoppable-extension-module'])

    host.stop(session.id)

    await vi.waitFor(() => {
      expect(testEntrypoint.disposedSessionIds).toEqual([session.id])
    })
    expect(host.listModules()).toEqual([])
  })

  /**
   * @example
   * expect(reloaded.phase).toBe('ready')
   */
  it('reloads defineExtension entrypoint sessions loaded through host.start', async () => {
    const host = new ExtensionHost()
    const entrypointPath = join(import.meta.dirname, 'testdata', 'test-stoppable-extension-entrypoint.ts')
    const testEntrypoint = await import('./testdata/test-stoppable-extension-entrypoint')
    testEntrypoint.disposedSessionIds.splice(0)

    const session = await host.start({
      apiVersion: 'v1',
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-stoppable-extension-entrypoint',
      permissions: {},
      entrypoints: {
        electron: entrypointPath,
      },
    }, { cwd: '', runtime: 'electron' })

    const reloaded = await host.reload(session.id)

    expect(reloaded.phase).toBe('ready')
    expect(testEntrypoint.disposedSessionIds).toEqual([session.id])
    expect(host.listModules().map(module => module.id)).toEqual(['stoppable-extension-module'])
  })

  it('should resolve runtime-specific extension entrypoint with node fallback', async () => {
    const host = new FileSystemLoader()

    const extension = await host.loadExtensionFor({
      apiVersion: 'v1',
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-extension',
      permissions: testPermissions,
      entrypoints: {
        node: join(import.meta.dirname, 'testdata', 'test-define-extension-entrypoint.ts'),
      },
    }, { cwd: '', runtime: 'node' })

    expect(extension).toBeDefined()
    expect(extension.id).toBe('test-define-extension-entrypoint')
    expect(typeof extension.setup).toBe('function')
  })

  it('should reject entrypoints that do not export defineExtension', async () => {
    const host = new FileSystemLoader()

    await expect(host.loadExtensionFor({
      apiVersion: 'v1',
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-extension',
      permissions: testPermissions,
      entrypoints: {
        electron: join(import.meta.dirname, 'testdata', 'test-normal-plugin.ts'),
      },
    }, { cwd: '', runtime: 'electron' })).rejects.toThrow('Failed to resolve extension module. The entrypoint must export defineExtension(...).')
  })

  it('should resolve entrypoint by runtime then default then electron', () => {
    const host = new FileSystemLoader()
    const baseManifest = {
      apiVersion: 'v1' as const,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-extension',
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
      cwd: '/tmp/extension',
      runtime: 'node',
    })).toBe('/tmp/extension/node-entry.ts')

    expect(host.resolveEntrypointFor(defaultFallbackManifest, {
      cwd: '/tmp/extension',
      runtime: 'node',
    })).toBe('/tmp/extension/default-entry.ts')

    expect(host.resolveEntrypointFor(electronFallbackManifest, {
      cwd: '/tmp/extension',
      runtime: 'node',
    })).toBe('/tmp/extension/electron-entry.ts')
  })

  it('should preserve absolute runtime entrypoints', () => {
    const host = new FileSystemLoader()

    expect(host.resolveEntrypointFor({
      apiVersion: 'v1',
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-extension',
      permissions: testPermissions,
      entrypoints: {
        node: '/opt/extensions/entry.ts',
      },
    }, {
      cwd: '/tmp/extension',
      runtime: 'node',
    })).toBe('/opt/extensions/entry.ts')
  })

  it('should throw deterministic error when no runtime entrypoint exists', () => {
    const host = new FileSystemLoader()

    expect(() => host.resolveEntrypointFor({
      apiVersion: 'v1',
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-extension',
      permissions: testPermissions,
      entrypoints: {},
    }, { runtime: 'node' })).toThrow('Extension entrypoint is required for runtime `node`.')
  })
})

describe('for ExtensionHost lifecycle', () => {
  const providersCapability = 'proj-airi:plugin-sdk:apis:protocol:resources:providers:list-providers'
  const kitRegistryResourceKey = 'proj-airi:plugin-sdk:resources:kits'
  const toolRegistryResourceKey = 'proj-airi:plugin-sdk:resources:tools'
  const widgetKitBindingsResourceKey = 'proj-airi:plugin-sdk:resources:kits:kit.widget:bindings'
  const customSessionApiPingEventName = 'proj-airi:plugin-sdk:apis:client:test-session-api:ping'
  const testManifest = {
    apiVersion: 'v1' as const,
    kind: 'manifest.extension.airi.moeru.ai' as const,
    id: 'test-plugin',
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
  const dynamicApiManifest = {
    ...testManifest,
    permissions: {
      ...testManifest.permissions,
      apis: [
        ...(testManifest.permissions.apis ?? []),
        { key: 'proj-airi:plugin-sdk:apis:client:kits:list', actions: ['invoke'] },
        { key: 'proj-airi:plugin-sdk:apis:client:kits:get-capabilities', actions: ['invoke'] },
        { key: 'proj-airi:plugin-sdk:apis:client:bindings:list', actions: ['invoke'] },
        { key: 'proj-airi:plugin-sdk:apis:client:bindings:announce', actions: ['invoke'] },
        { key: 'proj-airi:plugin-sdk:apis:client:bindings:activate', actions: ['invoke'] },
        { key: 'proj-airi:plugin-sdk:apis:client:bindings:update', actions: ['invoke'] },
        { key: 'proj-airi:plugin-sdk:apis:client:bindings:withdraw', actions: ['invoke'] },
        { key: 'proj-airi:plugin-sdk:apis:client:tools:register', actions: ['invoke'] },
      ],
      resources: [
        ...(testManifest.permissions.resources ?? []),
        { key: kitRegistryResourceKey, actions: ['read'] },
        { key: toolRegistryResourceKey, actions: ['write'] },
        { key: 'proj-airi:plugin-sdk:resources:bindings', actions: ['read'] },
        { key: widgetKitBindingsResourceKey, actions: ['read', 'write'] },
      ],
    } satisfies ModulePermissionDeclaration,
  }
  const customSessionApiManifest = {
    ...testManifest,
    permissions: {
      ...testManifest.permissions,
      apis: [
        ...(testManifest.permissions.apis ?? []),
        { key: customSessionApiPingEventName, actions: ['invoke'] },
      ],
    } satisfies ModulePermissionDeclaration,
  }
  const deniedKitReadManifest = {
    ...testManifest,
    permissions: {
      ...testManifest.permissions,
      apis: [
        ...(testManifest.permissions.apis ?? []),
        { key: 'proj-airi:plugin-sdk:apis:client:kits:list', actions: ['invoke'] },
      ],
    } satisfies ModulePermissionDeclaration,
  }

  function registerWidgetKit(host: ExtensionHost) {
    return host.registerKit({
      kitId: 'kit.widget',
      version: '1.0.0',
      capabilities: [
        { key: 'kit.widget.module', actions: ['announce', 'activate', 'update', 'withdraw'] },
        { key: 'kit.widget.channel', actions: ['publish', 'subscribe'] },
      ],
      runtimes: ['electron', 'web'],
    })
  }

  it('should run plugin lifecycle to ready in-memory', async () => {
    const host = new ExtensionHost({
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
    const host = new ExtensionHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
    })

    const session = await host.load({
      apiVersion: 'v1',
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-plugin-no-connect',
      permissions: testManifest.permissions,
      entrypoints: {
        electron: join(import.meta.dirname, 'testdata', 'test-no-connect-plugin.ts'),
      },
    }, { cwd: '' })

    await expect(host.init(session.id)).rejects.toThrow('Plugin initialization aborted by plugin: test-plugin-no-connect')

    expect(session.phase).toBe('stopped')
    expect(host.getSession(session.id)).toBeUndefined()
  })

  it('should expose runtime-compatible kits through bound plugin apis', async () => {
    const host = new ExtensionHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
    })
    const widgetKit = registerWidgetKit(host)
    host.registerKit({
      kitId: 'kit.node-only',
      version: '1.0.0',
      capabilities: [{ key: 'kit.node-only.module', actions: ['announce'] }],
      runtimes: ['node'],
    })
    reportPluginCapability(host, {
      key: providersCapability,
      state: 'ready',
      metadata: { source: 'test' },
    })

    const session = await host.start(dynamicApiManifest, { cwd: '' })
    const kits = await session.apis.kits.list()
    const capabilities = await session.apis.kits.getCapabilities('kit.widget')

    expect(kits).toEqual([widgetKit])
    expect(capabilities).toEqual(widgetKit.capabilities)
  })

  it('should expose plugin tool client bindings on the extension session api surface', async () => {
    const host = new ExtensionHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
    })
    reportPluginCapability(host, {
      key: providersCapability,
      state: 'ready',
      metadata: { source: 'test' },
    })

    const session = await host.start(dynamicApiManifest, { cwd: '' })

    expect(session.apis.tools).toBeDefined()
    await expect(session.apis.tools.register({
      tool: {
        id: 'play_chess',
        title: 'Play Chess',
        description: 'Open chess.',
        activation: {
          keywords: ['chess'],
          patterns: ['play.*chess'],
        },
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      execute: async () => ({ ok: true }),
    })).resolves.toBeUndefined()
  })

  it('should let contributions install custom session api namespaces', async () => {
    const installContribution = vi.fn()
    const callCustomNamespace = vi.fn(({ ownerPluginId, message }: { ownerPluginId: string, message: string }) => {
      return `${ownerPluginId}:${message}`
    })
    const host = new ExtensionHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
      contributions: [{
        install(context) {
          installContribution()
          context.registerSessionApi('testSessionApi', ({ session, assertPermission }) => ({
            async ping(message: string) {
              assertPermission({
                area: 'apis',
                action: 'invoke',
                key: customSessionApiPingEventName,
              })

              return callCustomNamespace({
                ownerPluginId: session.ownerPluginId,
                message,
              })
            },
          }))
        },
      }],
    })
    reportPluginCapability(host, {
      key: providersCapability,
      state: 'ready',
      metadata: { source: 'test' },
    })

    const session = await host.start(customSessionApiManifest, { cwd: '' })
    const testSessionApi = (session.apis as Record<string, unknown>).testSessionApi as {
      ping: (message: string) => Promise<string>
    }

    expect(installContribution).toHaveBeenCalledTimes(1)
    expect(testSessionApi).toBeDefined()
    await expect(testSessionApi.ping('hello')).resolves.toBe(`${session.identity.plugin.id}:hello`)
    expect(callCustomNamespace).toHaveBeenCalledWith({
      ownerPluginId: session.identity.plugin.id,
      message: 'hello',
    })
  })

  it('should register available plugin tools and expose serialized xsai schemas', async () => {
    const host = new ExtensionHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
    })
    reportPluginCapability(host, {
      key: providersCapability,
      state: 'ready',
      metadata: { source: 'test' },
    })

    const session = await host.start(dynamicApiManifest, { cwd: '' })

    await session.apis.tools.register({
      tool: {
        id: 'play_chess',
        title: 'Play Chess',
        description: 'Open chess.',
        activation: {
          keywords: ['chess'],
          patterns: ['play.*chess'],
        },
        parameters: {
          type: 'object',
          properties: {
            opening: {
              type: 'string',
            },
          },
        },
      },
      availability: () => true,
      execute: async input => ({ ok: true, input }),
    })

    await session.apis.tools.register({
      tool: {
        id: 'end_play_chess',
        title: 'End Play Chess',
        description: 'End chess.',
        activation: {
          keywords: ['end chess'],
          patterns: ['end.*chess'],
        },
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      availability: () => false,
      execute: async () => ({ ok: true, ended: true }),
    })
    await session.apis.tools.registerToolsetPrompt({
      id: 'chess-tools',
      prompt: {
        id: 'airi-plugin-game-chess.prompt',
        title: 'Chess Plugin Guidance',
        content: 'Do not pass fen or pgn when mode is "new".',
      },
    })

    await expect(host.listAvailableToolDescriptors()).resolves.toEqual([
      {
        id: 'play_chess',
        title: 'Play Chess',
        description: 'Open chess.',
        activation: {
          keywords: ['chess'],
          patterns: ['play.*chess'],
        },
      },
    ])
    await expect(host.listSerializedXsaiTools()).resolves.toEqual({
      prompts: [
        {
          ownerPluginId: session.identity.plugin.id,
          id: 'chess-tools',
          prompt: {
            id: 'airi-plugin-game-chess.prompt',
            title: 'Chess Plugin Guidance',
            content: 'Do not pass fen or pgn when mode is "new".',
          },
        },
      ],
      tools: [
        {
          ownerPluginId: session.identity.plugin.id,
          name: 'play_chess',
          description: 'Open chess.',
          parameters: {
            type: 'object',
            properties: {
              opening: {
                type: 'string',
              },
            },
          },
        },
      ],
    })
    await expect(host.invokeTool(session.identity.plugin.id, 'play_chess', { opening: 'sicilian' })).resolves.toEqual({
      ok: true,
      input: { opening: 'sicilian' },
    })
    await expect(host.invokeTool(session.identity.plugin.id, 'missing_tool', {})).rejects.toThrow(
      `Plugin tool not found: ${session.identity.plugin.id}:missing_tool`,
    )
  })

  it('should hide and reject tools registered by stopped sessions', async () => {
    const host = new ExtensionHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
    })
    reportPluginCapability(host, {
      key: providersCapability,
      state: 'ready',
      metadata: { source: 'test' },
    })

    const session = await host.start(dynamicApiManifest, { cwd: '' })

    await session.apis.tools.register({
      tool: {
        id: 'play_chess',
        title: 'Play Chess',
        description: 'Open chess.',
        activation: {
          keywords: ['chess'],
          patterns: ['play.*chess'],
        },
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      execute: async () => ({ ok: true }),
    })

    await expect(host.listAvailableToolDescriptors()).resolves.toEqual([
      expect.objectContaining({ id: 'play_chess' }),
    ])

    host.stop(session.id)

    await expect(host.listAvailableToolDescriptors()).resolves.toEqual([])
    await expect(host.listSerializedXsaiTools()).resolves.toEqual({ prompts: [], tools: [] })
    await expect(host.invokeTool(session.identity.plugin.id, 'play_chess', {})).rejects.toThrow(
      `Plugin tool not found: ${session.identity.plugin.id}:play_chess`,
    )
  })

  it('should clean up sessions modules and tools when a session-ready hook throws during init', async () => {
    const readyHookError = new Error('session-ready hook failed')
    const host = new ExtensionHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
      contributions: [{
        install(context) {
          context.registerLifecycleHook('session-ready', () => {
            throw readyHookError
          })
        },
      }],
    })
    registerWidgetKit(host)
    reportPluginCapability(host, {
      key: providersCapability,
      state: 'ready',
      metadata: { source: 'test' },
    })

    const session = await host.load(dynamicApiManifest, { cwd: '' })
    session.plugin = {
      ...session.plugin,
      setupModules: async ({ apis }) => {
        await apis.tools.register({
          tool: {
            id: 'ready_hook_tool',
            title: 'Ready Hook Tool',
            description: 'Registered before the ready hook throws.',
            activation: {
              keywords: ['ready'],
              patterns: ['ready'],
            },
            parameters: {
              type: 'object',
              properties: {},
            },
          },
          execute: async () => ({ ok: true }),
        })

        await apis.bindings.announce({
          moduleId: 'module-ready-hook-failure',
          kitId: 'kit.widget',
          kitModuleType: 'window',
          config: { route: '/widgets/ready-hook-failure' },
        })
      },
    }

    await expect(host.init(session.id)).rejects.toThrow('session-ready hook failed')

    expect(session.phase).toBe('stopped')
    expect(host.getSession(session.id)).toBeUndefined()
    expect(host.getBinding('module-ready-hook-failure')).toBeUndefined()
    await expect(host.listAvailableToolDescriptors()).resolves.toEqual([])
    await expect(host.listSerializedXsaiTools()).resolves.toEqual({ prompts: [], tools: [] })
    await expect(host.invokeTool(session.identity.plugin.id, 'ready_hook_tool', {})).rejects.toThrow(
      `Plugin tool not found: ${session.identity.plugin.id}:ready_hook_tool`,
    )
  })

  it('should finish stop cleanup before rethrowing a session-stopped hook failure', async () => {
    const stoppedHookError = new Error('session-stopped hook failed')
    const host = new ExtensionHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
      contributions: [{
        install(context) {
          context.registerLifecycleHook('session-stopped', () => {
            throw stoppedHookError
          })
        },
      }],
    })
    registerWidgetKit(host)
    reportPluginCapability(host, {
      key: providersCapability,
      state: 'ready',
      metadata: { source: 'test' },
    })

    const session = await host.start(dynamicApiManifest, { cwd: '' })
    await session.apis.tools.register({
      tool: {
        id: 'stopped_hook_tool',
        title: 'Stopped Hook Tool',
        description: 'Should be cleaned up before stop rethrows.',
        activation: {
          keywords: ['stop'],
          patterns: ['stop'],
        },
        parameters: {
          type: 'object',
          properties: {},
        },
      },
      execute: async () => ({ ok: true }),
    })
    await session.apis.bindings.announce({
      moduleId: 'module-stopped-hook-failure',
      kitId: 'kit.widget',
      kitModuleType: 'window',
      config: { route: '/widgets/stopped-hook-failure' },
    })

    expect(() => host.stop(session.id)).toThrow('session-stopped hook failed')

    expect(session.phase).toBe('stopped')
    expect(host.getSession(session.id)).toBeUndefined()
    expect(host.getBinding('module-stopped-hook-failure')).toBeUndefined()
    await expect(host.listAvailableToolDescriptors()).resolves.toEqual([])
    await expect(host.listSerializedXsaiTools()).resolves.toEqual({ prompts: [], tools: [] })
    await expect(host.invokeTool(session.identity.plugin.id, 'stopped_hook_tool', {})).rejects.toThrow(
      `Plugin tool not found: ${session.identity.plugin.id}:stopped_hook_tool`,
    )
  })

  it('should allow plugin to announce update activate and withdraw dynamic bindings through bound apis', async () => {
    const host = new ExtensionHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
    })
    registerWidgetKit(host)
    reportPluginCapability(host, {
      key: providersCapability,
      state: 'ready',
      metadata: { source: 'test' },
    })

    const session = await host.start(dynamicApiManifest, { cwd: '' })
    expect('degrade' in session.apis.bindings).toBe(false)
    expect(await session.apis.bindings.list()).toEqual([])

    const announced = await session.apis.bindings.announce({
      moduleId: 'module-a',
      kitId: 'kit.widget',
      kitModuleType: 'window',
      config: { route: '/widgets' },
    })
    const listedAfterAnnounce = await session.apis.bindings.list()

    expect(announced.moduleId).toBe('module-a')
    expect(host.listBindings().some(item => item.moduleId === 'module-a')).toBe(true)
    expect(listedAfterAnnounce).toEqual([
      expect.objectContaining({
        moduleId: 'module-a',
        state: 'announced',
        config: { route: '/widgets' },
      }),
    ])

    const activated = await session.apis.bindings.activate({ moduleId: 'module-a' })
    const listedAfterActivate = await session.apis.bindings.list()
    const updated = await session.apis.bindings.update({
      moduleId: 'module-a',
      config: {
        route: '/widgets/main',
        width: 420,
      },
    })
    const listedAfterUpdate = await session.apis.bindings.list()
    const withdrawn = await session.apis.bindings.withdraw({ moduleId: 'module-a' })
    const listedAfterWithdraw = await session.apis.bindings.list()

    expect(activated.state).toBe('active')
    expect(listedAfterActivate).toEqual([
      expect.objectContaining({
        moduleId: 'module-a',
        state: 'active',
      }),
    ])
    expect(updated.config).toEqual({
      route: '/widgets/main',
      width: 420,
    })
    expect(listedAfterUpdate).toEqual([
      expect.objectContaining({
        moduleId: 'module-a',
        state: 'active',
        config: {
          route: '/widgets/main',
          width: 420,
        },
      }),
    ])
    expect(withdrawn.state).toBe('withdrawn')
    expect(listedAfterWithdraw).toEqual([
      expect.objectContaining({
        moduleId: 'module-a',
        state: 'withdrawn',
        config: {
          route: '/widgets/main',
          width: 420,
        },
      }),
    ])
  })

  it('should let a test plugin consume injected kit and binding apis during init', async () => {
    const host = new ExtensionHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
    })

    registerWidgetKit(host)

    const session = await host.start({
      ...dynamicApiManifest,
      id: 'test-plugin-injected-host-apis',
      entrypoints: {
        electron: join(import.meta.dirname, 'testdata', 'test-injected-host-apis-plugin.ts'),
      },
    }, { cwd: '' })

    expect(session.phase).toBe('ready')
    expect(host.listBindings()).toEqual([
      expect.objectContaining({
        moduleId: 'test-injected-host-apis-module',
        ownerSessionId: session.id,
        ownerPluginId: session.identity.plugin.id,
        kitId: 'kit.widget',
        kitModuleType: 'window',
        state: 'active',
        config: {
          route: '/widgets/injected-host-apis',
          observedKitIds: ['kit.widget'],
          observedCapabilityKeys: ['kit.widget.channel', 'kit.widget.module'],
        },
      }),
    ])
  })

  it('should reuse dynamic binding ids after stop cleanup and reload', async () => {
    const host = new ExtensionHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
    })
    registerWidgetKit(host)
    reportPluginCapability(host, {
      key: providersCapability,
      state: 'ready',
      metadata: { source: 'test' },
    })

    const session = await host.start(dynamicApiManifest, { cwd: '' })
    await session.apis.bindings.announce({
      moduleId: 'module-reuse',
      kitId: 'kit.widget',
      kitModuleType: 'window',
      config: { route: '/widgets/reuse' },
    })

    const reloaded = await host.reload(session.id, { cwd: '' })

    expect(host.getBinding('module-reuse')).toBeUndefined()
    expect(host.listBindings().some(item => item.moduleId === 'module-reuse')).toBe(false)

    const reused = await reloaded.apis.bindings.announce({
      moduleId: 'module-reuse',
      kitId: 'kit.widget',
      kitModuleType: 'window',
      config: { route: '/widgets/reuse-2' },
    })

    expect(reused.ownerSessionId).toBe(reloaded.id)
    expect(reused.config).toEqual({ route: '/widgets/reuse-2' })
  })

  it('should isolate plugin-facing kit and module snapshots from extension-side mutation', async () => {
    const host = new ExtensionHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
    })
    registerWidgetKit(host)
    reportPluginCapability(host, {
      key: providersCapability,
      state: 'ready',
      metadata: { source: 'test' },
    })

    const session = await host.start(dynamicApiManifest, { cwd: '' })
    const listedKits = await session.apis.kits.list()
    listedKits[0].kitId = 'kit.mutated'
    listedKits[0].capabilities[0].actions.push('tampered')
    listedKits[0].runtimes.push('node')

    const listedCapabilities = await session.apis.kits.getCapabilities('kit.widget')
    listedCapabilities[0].actions.push('shadow-write')

    const announced = await session.apis.bindings.announce({
      moduleId: 'module-snapshot',
      kitId: 'kit.widget',
      kitModuleType: 'window',
      config: { route: '/widgets/snapshot' },
    })
    announced.config.route = '/widgets/tampered'

    const listedModules = await session.apis.bindings.list()
    listedModules[0].config.route = '/widgets/list-tampered'

    expect(await session.apis.kits.list()).toEqual([
      expect.objectContaining({
        kitId: 'kit.widget',
        capabilities: [
          expect.objectContaining({
            key: 'kit.widget.module',
            actions: ['announce', 'activate', 'update', 'withdraw'],
          }),
          expect.objectContaining({
            key: 'kit.widget.channel',
            actions: ['publish', 'subscribe'],
          }),
        ],
        runtimes: ['electron', 'web'],
      }),
    ])
    expect(await session.apis.kits.getCapabilities('kit.widget')).toEqual([
      { key: 'kit.widget.module', actions: ['announce', 'activate', 'update', 'withdraw'] },
      { key: 'kit.widget.channel', actions: ['publish', 'subscribe'] },
    ])
    expect(await session.apis.bindings.list()).toEqual([
      expect.objectContaining({
        moduleId: 'module-snapshot',
        config: { route: '/widgets/snapshot' },
      }),
    ])
  })

  it('should deny new kit apis when resource read permission is missing', async () => {
    const host = new ExtensionHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
    })
    registerWidgetKit(host)
    reportPluginCapability(host, {
      key: providersCapability,
      state: 'ready',
      metadata: { source: 'test' },
    })

    const session = await host.start(deniedKitReadManifest, { cwd: '' })

    await expect(session.apis.kits.list()).rejects.toThrow('Permission denied: resources.read "proj-airi:plugin-sdk:resources:kits"')
  })

  it('should reject non in-memory transport for MVP', async () => {
    const host = new ExtensionHost({
      runtime: 'electron',
      transport: { kind: 'websocket', url: 'ws://localhost:3000' },
    })

    await expect(host.start(testManifest, { cwd: '' })).rejects.toThrow('Only in-memory transport is currently supported by ExtensionHost alpha.')
  })

  it('should wait for required capabilities before proceeding init', async () => {
    const host = new ExtensionHost({
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
    const loadingSession = host.listSessions().find(item => item.manifest.id === testManifest.id)
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
    const host = new ExtensionHost({
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
    const host = new ExtensionHost({
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
    const host = new ExtensionHost({
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
    const host = new ExtensionHost({
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
    const host = new ExtensionHost({
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
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-reload-relative-entrypoint',
      permissions: testManifest.permissions,
      entrypoints: {
        electron: './test-normal-plugin.ts',
      },
    }, { cwd: join(import.meta.dirname, 'testdata') })

    const reloaded = await host.reload(session.id)
    expect(reloaded.phase).toBe('ready')
  })

  it('should emit downgraded compatibility result when fallback versions overlap', async () => {
    const host = new ExtensionHost({
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
    const host = new ExtensionHost({
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
    const host = new ExtensionHost({
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

    expect(session.phase).toBe('stopped')
    expect(host.getSession(session.id)).toBeUndefined()
  })

  it('should isolate module status events between extension sessions', async () => {
    const host = new ExtensionHost({
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
      id: 'test-extension-session-one',
    }, { cwd: '' })
    const sessionTwo = await host.start({
      ...testManifest,
      id: 'test-extension-session-two',
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
    const host = new ExtensionHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
    })

    const sessionOne = await host.load({
      ...testManifest,
      id: 'test-extension-session-one',
    }, { cwd: '' })
    const sessionTwo = await host.load({
      ...testManifest,
      id: 'test-extension-session-two',
    }, { cwd: '' })

    defineInvokeHandler(sessionOne.channels.host, protocolProviders.listProviders, async () => [{ name: 'provider:one' }])
    defineInvokeHandler(sessionTwo.channels.host, protocolProviders.listProviders, async () => [{ name: 'provider:two' }])

    const invokeOne = defineInvoke(sessionOne.channels.host, protocolProviders.listProviders)
    const invokeTwo = defineInvoke(sessionTwo.channels.host, protocolProviders.listProviders)

    await expect(invokeOne()).resolves.toEqual([{ name: 'provider:one' }])
    await expect(invokeTwo()).resolves.toEqual([{ name: 'provider:two' }])
  })

  it('should expose provider resources through the generic resource resolver API', async () => {
    const host = new ExtensionHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
    })

    host.setResourceResolver(providersCapability, () => [{ name: 'provider:generic' }])

    const session = await host.load(testManifest, { cwd: '' })
    const invokeProviders = defineInvoke(session.channels.host, protocolProviders.listProviders)

    await expect(invokeProviders()).resolves.toEqual([{ name: 'provider:generic' }])
  })

  it('should include active modules in registry sync when initializing another session', async () => {
    const host = new ExtensionHost({
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
      id: 'test-extension-session-one',
    }, { cwd: '' })
    expect(sessionOne.phase).toBe('ready')

    const sessionTwo = await host.load({
      ...testManifest,
      id: 'test-extension-session-two',
    }, { cwd: '' })

    const syncEvents: Array<{ body?: { modules?: Array<{ name: string }> } }> = []
    sessionTwo.channels.host.on(registryModulesSync, payload => syncEvents.push(payload))

    const initialized = await host.init(sessionTwo.id)
    expect(initialized.phase).toBe('ready')

    const moduleNames = syncEvents
      .flatMap(event => event.body?.modules ?? [])
      .map(module => module.name)

    expect(moduleNames).toContain('test-extension-session-one')
    expect(moduleNames).toContain('test-extension-session-two')
  })

  it('should support runtime permission requests before granting deferred scopes', async () => {
    const host = new ExtensionHost({
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

  it('should only emit denied scopes that remain precisely representable after partial approval', async () => {
    const host = new ExtensionHost({
      runtime: 'electron',
      transport: { kind: 'in-memory' },
      permissionResolver: ({ requested }) => ({
        apis: [
          ...(requested.apis ?? []).filter(spec => spec.key.startsWith('proj-airi:plugin-sdk:')),
          { key: 'plugin.api.users', actions: ['invoke'] },
        ],
        resources: [
          ...(requested.resources ?? []).filter(spec => spec.key.startsWith('proj-airi:plugin-sdk:')),
          { key: 'plugin.resource.settings', actions: ['read'] },
        ],
        capabilities: requested.capabilities,
      }),
    })

    const manifest = {
      apiVersion: 'v1' as const,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-plugin-denied-partial',
      permissions: {
        apis: [
          ...(testManifest.permissions.apis ?? []),
          { key: 'plugin.api.users', actions: ['invoke', 'emit'], reason: 'Use selected user API actions' },
        ],
        resources: [
          ...(testManifest.permissions.resources ?? []),
          { key: 'plugin.resource.*', actions: ['read'], reason: 'Read plugin resources' },
        ],
        capabilities: testManifest.permissions.capabilities,
      } satisfies ModulePermissionDeclaration,
      entrypoints: {
        electron: join(import.meta.dirname, 'testdata', 'test-normal-plugin.ts'),
      },
    }

    const session = await host.load(manifest, { cwd: '' })
    const deniedEvents: Array<{ body?: Record<string, unknown> }> = []
    const currentEvents: Array<{ body?: Record<string, unknown> }> = []
    session.channels.host.on(modulePermissionsDenied, payload => deniedEvents.push(payload as unknown as { body?: Record<string, unknown> }))
    session.channels.host.on(modulePermissionsCurrent, payload => currentEvents.push(payload as unknown as { body?: Record<string, unknown> }))

    await host.init(session.id)

    expect(session.permissions.granted).toEqual({
      apis: [
        ...(testManifest.permissions.apis ?? []),
        { key: 'plugin.api.users', actions: ['invoke'], reason: 'Use selected user API actions' },
      ],
      resources: [
        ...(testManifest.permissions.resources ?? []),
        { key: 'plugin.resource.settings', actions: ['read'], reason: 'Read plugin resources' },
      ],
      capabilities: testManifest.permissions.capabilities ?? [],
      processors: [],
      pipelines: [],
    })

    expect(deniedEvents).toEqual([
      expect.objectContaining({
        body: expect.objectContaining({
          denied: {
            apis: [
              { key: 'plugin.api.users', actions: ['emit'], reason: 'Use selected user API actions' },
            ],
          },
        }),
      }),
    ])
    expect(deniedEvents[0]?.body?.denied).not.toHaveProperty('resources')
    expect(currentEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        body: expect.objectContaining({
          granted: {
            apis: [
              ...(testManifest.permissions.apis ?? []),
              { key: 'plugin.api.users', actions: ['invoke'], reason: 'Use selected user API actions' },
            ],
            resources: [
              ...(testManifest.permissions.resources ?? []),
              { key: 'plugin.resource.settings', actions: ['read'], reason: 'Read plugin resources' },
            ],
            capabilities: testManifest.permissions.capabilities ?? [],
            processors: [],
            pipelines: [],
          },
        }),
      }),
    ]))
  })

  it('should isolate runtime permission grants between concurrent same-name sessions', async () => {
    const host = new ExtensionHost({
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

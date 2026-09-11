import type { ExtensionManifestV2, ModulePermissionDeclaration } from './shared/types'

import { join } from 'node:path'

import { safeParse } from 'valibot'
import { describe, expect, it, vi } from 'vitest'

import { ExtensionHost, extensionManifestV2Schema, FileSystemLoader } from '.'
import { defineExtension } from '../extension'
import { defineKit, defineKitContract } from '../kit'

describe('extension manifest schema', () => {
  it('accepts extension.airi.json v2 manifests', () => {
    const result = safeParse(extensionManifestV2Schema, {
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'airi-extension-test',
      version: '1.0.0',
      engines: {
        airi: '*',
        runtimes: ['electron'],
      },
      permissions: {},
      entrypoints: {
        electron: './extension.mjs',
      },
    })

    expect(result.success).toBe(true)
  })

  it('rejects legacy extension manifests', () => {
    const result = safeParse(extensionManifestV2Schema, {
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

  it('rejects unknown manifest fields', () => {
    const result = safeParse(extensionManifestV2Schema, {
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: 'airi-extension-test',
      version: '1.0.0',
      engines: {
        airi: '*',
        runtimes: ['electron'],
      },
      permissions: {},
      entrypoints: {
        electron: './extension.mjs',
      },
      permisisons: {},
    })

    expect(result.success).toBe(false)
  })

  it('rejects manifests without a runtime entrypoint', () => {
    const result = safeParse(extensionManifestV2Schema, {
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: 'airi-extension-test',
      version: '1.0.0',
      engines: {
        airi: '*',
        runtimes: ['electron'],
      },
      permissions: {},
      entrypoints: {},
    })

    expect(result.success).toBe(false)
  })

  it('rejects Extension ids that cannot name an installation folder', () => {
    const result = safeParse(extensionManifestV2Schema, {
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: '../outside',
      version: '1.0.0',
      engines: {
        airi: '*',
        runtimes: ['electron'],
      },
      permissions: {},
      entrypoints: {
        electron: './extension.mjs',
      },
    })

    expect(result.success).toBe(false)
  })

  it('accepts extension-hosted kit declarations', () => {
    const manifest = {
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'agent-activity-provider',
      version: '1.0.0',
      engines: {
        airi: '*',
        runtimes: ['electron' as const],
      },
      permissions: {},
      entrypoints: {
        electron: './extension.mjs',
      },
      kits: {
        provides: [{
          id: 'dev.airi.agent-activity',
          version: '1.0.0',
          exposure: 'local-only' as const,
        }],
        uses: [{
          id: 'dev.airi.character-reaction',
          version: '^1.0.0',
          optional: true,
        }],
      },
    } satisfies ExtensionManifestV2

    expect(safeParse(extensionManifestV2Schema, manifest).success).toBe(true)
  })
})

describe('for ExtensionHost', () => {
  it('runs an Extension-hosted Kit through Provider and Consumer Extension lifecycles', async () => {
    interface AgentActivityClient {
      notify: (input: { kind: 'needs-input' | 'completed', summary: string }) => {
        consumerExtensionId: string
        kind: 'needs-input' | 'completed'
        summary: string
      }
    }

    const host = new ExtensionHost()
    const calls: Array<ReturnType<AgentActivityClient['notify']>> = []
    const agentActivityKit = defineKitContract<AgentActivityClient>({
      id: 'dev.airi.agent-activity',
      version: '1.0.0',
    })
    const providerKit = defineKit<AgentActivityClient>({
      ...agentActivityKit,
      allowedExposePolicies: ['local-only'],
      defaultExposePolicy: 'local-only',
      createClient(runtime) {
        return {
          notify(input) {
            const call = {
              consumerExtensionId: runtime.extensionId,
              ...input,
            }
            calls.push(call)
            return call
          },
        }
      },
    })
    const provider = defineExtension({
      id: 'agent-activity-provider',
      setup(ctx) {
        ctx.kits.provide(providerKit)
      },
    })
    const availability: boolean[] = []
    let activityClient: AgentActivityClient | undefined
    const consumer = defineExtension({
      id: 'agent-activity-consumer',
      async setup(ctx) {
        ctx.kits.watch(agentActivityKit, (state) => {
          availability.push(state.available)
        })
        const activity = await ctx.kits.use(agentActivityKit)
        activityClient = activity
        activity.notify({ kind: 'needs-input', summary: 'Choose a model.' })
        activity.notify({ kind: 'completed', summary: 'Build finished.' })
      },
    })

    const providerSession = await host.startExtension(provider, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'agent-activity-provider',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './provider.mjs' },
        permissions: {},
        kits: {
          provides: [{ id: agentActivityKit.id, version: agentActivityKit.version, exposure: 'local-only' }],
        },
      },
    })

    expect(host.getKit(agentActivityKit.id)).toEqual({
      kitId: agentActivityKit.id,
      version: agentActivityKit.version,
      runtimes: ['electron'],
      capabilities: [],
    })

    await host.startExtension(consumer, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'agent-activity-consumer',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './consumer.mjs' },
        permissions: {
          apis: [{ key: agentActivityKit.id, actions: ['invoke'] }],
        },
        kits: {
          uses: [{ id: agentActivityKit.id, version: agentActivityKit.version }],
        },
      },
    })

    expect(calls).toEqual([
      {
        consumerExtensionId: 'agent-activity-consumer',
        kind: 'needs-input',
        summary: 'Choose a model.',
      },
      {
        consumerExtensionId: 'agent-activity-consumer',
        kind: 'completed',
        summary: 'Build finished.',
      },
    ])
    expect(availability).toEqual([true])

    const consumerSession = host.listSessions().find(session => session.extension.id === consumer.id)
    if (!consumerSession) {
      throw new Error('Expected the Consumer Extension session to remain active.')
    }

    await host.stop(providerSession.id)

    expect(() => activityClient?.notify({ kind: 'completed', summary: 'Late call.' })).toThrow(
      'Cannot perform',
    )
    expect(host.getKit(agentActivityKit.id)).toBeUndefined()

    const missing = await host.startExtension(defineExtension({
      id: 'agent-activity-late-consumer',
      async setup(ctx) {
        const result = await ctx.kits.tryUse(agentActivityKit)
        expect(result.ok).toBe(false)
        if (!result.ok) {
          expect(result.reason).toBe('missing-kit')
        }
      },
    }), {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'agent-activity-late-consumer',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './consumer.mjs' },
        permissions: {
          apis: [{ key: agentActivityKit.id, actions: ['invoke'] }],
        },
        kits: {
          uses: [{ id: agentActivityKit.id, version: agentActivityKit.version }],
        },
      },
    })

    expect(host.getSession(consumerSession.id)?.phase).toBe('ready')
    expect(missing.phase).toBe('ready')
    expect(availability).toEqual([true, false])
  })

  it('rejects an Extension-hosted Kit that is absent from the Provider manifest', async () => {
    const host = new ExtensionHost()
    const providerKit = defineKit({
      id: 'dev.airi.undeclared',
      version: '1.0.0',
      createClient: () => ({ ping: () => 'pong' }),
    })

    await expect(host.startExtension(defineExtension({
      id: 'undeclared-kit-provider',
      setup(ctx) {
        ctx.kits.provide(providerKit)
      },
    }), {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'undeclared-kit-provider',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './provider.mjs' },
        permissions: {},
      },
    })).rejects.toThrow('cannot provide undeclared Kit `dev.airi.undeclared`')

    expect(host.listSessions()).toEqual([])
  })

  it('rejects a second active Provider for the same Extension-hosted Kit', async () => {
    const host = new ExtensionHost()
    const providerKit = defineKit({
      id: 'dev.airi.single-provider',
      version: '1.0.0',
      createClient: () => ({ ping: () => 'pong' }),
    })
    const manifestFor = (id: string): ExtensionManifestV2 => ({
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id,
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
      entrypoints: { electron: './provider.mjs' },
      permissions: {},
      kits: {
        provides: [{ id: providerKit.id, version: providerKit.version, exposure: 'local-only' }],
      },
    })
    const providerFor = (id: string) => defineExtension({
      id,
      setup(ctx) {
        ctx.kits.provide(providerKit)
      },
    })

    const first = await host.startExtension(providerFor('first-kit-provider'), {
      manifest: manifestFor('first-kit-provider'),
    })

    await expect(host.startExtension(providerFor('second-kit-provider'), {
      manifest: manifestFor('second-kit-provider'),
    })).rejects.toThrow('already has an active Provider')

    expect(host.listSessions().map(session => session.id)).toEqual([first.id])
  })

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
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-test',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        permissions: {},
        entrypoints: {},
      },
    })

    expect(session.extension.id).toBe('airi-extension-test')
    expect(session.extension.version).toBe('1.0.0')
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
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-manifest-id',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
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
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-failing',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
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
      }),
    })
    host.registerKit({
      kitId: 'kit.cleanup-failure',
      version: '1.0.0',
      runtimes: ['electron'],
      capabilities: [],
    })
    host.registerKitApi(kit)
    const extension = defineExtension({
      id: 'airi-extension-cleanup-failure',
      async setup(ctx) {
        const client = await ctx.kits.use(kit)
        client.bind()
        throw new Error('setup failed after resource registration')
      },
    })

    await expect(host.startExtension(extension, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-cleanup-failure',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        permissions: {
          apis: [
            { key: 'kit.cleanup-failure', actions: ['invoke'] },
          ],
          resources: [
            { key: 'proj-airi:plugin-sdk:resources:kits:kit.cleanup-failure:bindings', actions: ['write'] },
          ],
        },
        entrypoints: {},
      },
    })).rejects.toThrow('setup failed after resource registration')

    expect(host.listBindings()).toEqual([])
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
      }),
    })
    host.registerKit({
      kitId: 'kit.module-dispose',
      version: '1.0.0',
      runtimes: ['electron'],
      capabilities: [],
    })
    host.registerKitApi(kit)
    const permissions: ModulePermissionDeclaration = {
      apis: [
        { key: 'kit.module-dispose', actions: ['invoke'] },
      ],
      resources: [
        { key: 'proj-airi:plugin-sdk:resources:kits:kit.module-dispose:bindings', actions: ['write'] },
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

        await module.dispose()
      },
    })

    const session = await host.startExtension(extension, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-module-dispose',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        permissions,
        entrypoints: {},
      },
    })

    expect(session.phase).toBe('ready')
    expect(host.listModules()).toEqual([])
    expect(host.listBindings()).toEqual([])
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
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-direct-kit',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
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
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-direct-kit-denied',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
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
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-direct-kit-resolver-denied',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
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
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'airi-extension-direct-kit-persisted-revoked',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
      permissions: {
        apis: [{ key: 'kit.extension-persisted-revoked', actions: ['invoke'] }],
      },
      entrypoints: {},
    } satisfies ExtensionManifestV2

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

  it('lets module-scoped kit use inherit the extension grant when module permissions are omitted', async () => {
    const host = new ExtensionHost()
    const kit = defineKit({
      id: 'kit.module-inherited-grant',
      version: '1.0.0',
      createClient: () => ({ ping: () => 'pong' }),
    })
    host.registerKitApi(kit)

    const extension = defineExtension({
      id: 'airi-extension-module-inherited-grant',
      async setup(ctx) {
        const module = await ctx.modules.register({ id: 'module-a' })
        const result = await module.kits.tryUse(kit)

        expect(result.ok).toBe(true)
        if (!result.ok) {
          throw new Error('Expected inherited module kit use to be allowed.')
        }
        expect(result.client.ping()).toBe('pong')
      },
    })

    await host.startExtension(extension, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-module-inherited-grant',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        permissions: {
          apis: [{ key: 'kit.module-inherited-grant', actions: ['invoke'] }],
        },
        entrypoints: {},
      },
    })
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
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-module-kit-resolver-denied',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
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
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-direct-kit-watch',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
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
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-direct-kit-watch-dispose',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
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
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-kit-test',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
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
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-module-kit-watch-dispose',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
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
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-duplicate-module',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
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
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-async-stop-cleanup',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
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
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai' as const,
        id: 'airi-extension-kit-denied',
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        permissions: {
          apis: [{ key: 'kit.other', actions: ['invoke'] }],
        },
        entrypoints: {},
      },
    })
  })
})

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
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-define-extension-entrypoint',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
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
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-stoppable-extension-entrypoint',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
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
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-stoppable-extension-entrypoint',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
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

  it('should load a runtime-specific extension entrypoint', async () => {
    const host = new FileSystemLoader()

    const extension = await host.loadExtensionFor({
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-extension',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['node'] },
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
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-extension',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
      permissions: testPermissions,
      entrypoints: {
        electron: join(import.meta.dirname, 'testdata', 'test-invalid-extension-entrypoint.ts'),
      },
    }, { cwd: '', runtime: 'electron' })).rejects.toThrow('Failed to resolve extension module. The entrypoint must export defineExtension(...).')
  })

  it('should resolve entrypoint by runtime then default', () => {
    const host = new FileSystemLoader()
    const baseManifest = {
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-extension',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['node'] },
      permissions: testPermissions,
    } satisfies Omit<ExtensionManifestV2, 'entrypoints'>

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
    expect(host.resolveEntrypointFor(runtimeEntryManifest, {
      cwd: '/tmp/extension',
      runtime: 'node',
    })).toBe('/tmp/extension/node-entry.ts')

    expect(host.resolveEntrypointFor(defaultFallbackManifest, {
      cwd: '/tmp/extension',
      runtime: 'node',
    })).toBe('/tmp/extension/default-entry.ts')
  })

  it('should reject a runtime that the extension does not support', () => {
    const host = new FileSystemLoader()

    // ROOT CAUSE:
    //
    // Entrypoint resolution ignored engines.runtimes. A host could therefore
    // execute a default or runtime-named entrypoint even when the manifest
    // explicitly excluded the active runtime.
    expect(() => host.resolveEntrypointFor({
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-extension',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['web'] },
      permissions: testPermissions,
      entrypoints: {
        default: './default-entry.ts',
        electron: './electron-entry.ts',
      },
    }, {
      cwd: '/tmp/extension',
      runtime: 'electron',
    })).toThrow('does not support runtime `electron`')
  })

  it('should preserve absolute runtime entrypoints', () => {
    const host = new FileSystemLoader()

    expect(host.resolveEntrypointFor({
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-extension',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['node'] },
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
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-extension',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['node'] },
      permissions: testPermissions,
      entrypoints: {},
    }, { runtime: 'node' })).toThrow('Extension entrypoint is required for runtime `node`.')
  })
})

describe('for migrated extension testdata', () => {
  it('uses the host runtime when a start call does not override it', async () => {
    const host = new ExtensionHost({ runtime: 'node' })

    const session = await host.start({
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-plugin',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['node'] },
      permissions: {},
      entrypoints: {
        node: join(import.meta.dirname, 'testdata', 'test-normal-plugin.ts'),
      },
    }, { cwd: '' })

    expect(session.runtime).toBe('node')
    await host.stop(session.id)
  })

  it('starts the normal defineExtension fixture', async () => {
    const host = new ExtensionHost()

    const session = await host.start({
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-plugin',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
      permissions: {},
      entrypoints: {
        electron: join(import.meta.dirname, 'testdata', 'test-normal-plugin.ts'),
      },
    }, { cwd: '', runtime: 'electron' })

    expect(session.phase).toBe('ready')
    expect(session.manifest.id).toBe('test-plugin')
  })

  it('surfaces setup failures from migrated defineExtension fixtures', async () => {
    const host = new ExtensionHost()

    await expect(host.start({
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-plugin-no-connect',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
      permissions: {},
      entrypoints: {
        electron: join(import.meta.dirname, 'testdata', 'test-no-connect-plugin.ts'),
      },
    }, { cwd: '', runtime: 'electron' })).rejects.toThrow(
      'Plugin initialization aborted by plugin: test-plugin-no-connect',
    )
  })

  it('runs the migrated injected kit fixture through ctx.modules and module.kits', async () => {
    const host = new ExtensionHost()
    const { testWidgetKit } = await import('./testdata/test-injected-host-apis-plugin')
    host.registerKitApi(testWidgetKit)

    const session = await host.start({
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id: 'test-plugin-injected-host-apis',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
      permissions: {
        apis: [{ key: testWidgetKit.id, actions: ['invoke'] }],
      },
      entrypoints: {
        electron: join(import.meta.dirname, 'testdata', 'test-injected-host-apis-plugin.ts'),
      },
    }, { cwd: '', runtime: 'electron' })

    expect(session.phase).toBe('ready')
    expect(host.listModules().map(module => module.id)).toEqual(['test-injected-host-apis-module'])
  })
})

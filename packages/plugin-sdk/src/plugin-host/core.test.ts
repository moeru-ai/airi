import type { KitClientOf } from '../kit'
import type { ExtensionManifestV2, ModulePermissionDeclaration } from './shared/types'

import { join } from 'node:path'

import { safeParse } from 'valibot'
import { describe, expect, it, vi } from 'vitest'

import { ExtensionHost, extensionManifestV2Schema, FileSystemLoader } from '.'
import { defineExtension } from '../extension'
import {
  defineKit,
  defineKitContract,
  defineKitEvent,
  defineKitMethod,
} from '../kit'

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
          version: '1.0.0',
          optional: true,
        }],
      },
    } satisfies ExtensionManifestV2

    expect(safeParse(extensionManifestV2Schema, manifest).success).toBe(true)
  })

  it('rejects Kit version ranges until the Host supports range resolution', () => {
    const result = safeParse(extensionManifestV2Schema, {
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: 'agent-activity-consumer',
      version: '1.0.0',
      engines: {
        airi: '*',
        runtimes: ['electron'],
      },
      permissions: {},
      entrypoints: {
        electron: './extension.mjs',
      },
      kits: {
        uses: [{
          id: 'dev.airi.agent-activity',
          version: '^1.0.0',
        }],
      },
    })

    expect(result.success).toBe(false)
  })
})

describe('for ExtensionHost', () => {
  // https://github.com/moeru-ai/airi/pull/2506#discussion_r3986343873
  it('rejects a missing required Kit before importing the Extension entrypoint', async () => {
    const host = new ExtensionHost()

    await expect(host.start({
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: 'required-kit-import-consumer',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
      entrypoints: { electron: './missing-consumer-entrypoint.mjs' },
      permissions: { apis: [{ key: 'kit.required-before-import', actions: ['invoke'] }] },
      kits: { uses: [{ id: 'kit.required-before-import', version: '1.0.0' }] },
    })).rejects.toThrow('requires Kit `kit.required-before-import` at version `1.0.0`')

    expect(host.listSessions()).toEqual([])
  })

  // https://github.com/moeru-ai/airi/pull/2506#discussion_r3986478776
  it('rejects a duplicate provided Kit before importing the Extension entrypoint', async () => {
    const host = new ExtensionHost()
    host.registerKitApi(defineKit({
      id: 'kit.duplicate-before-import',
      version: '1.0.0',
      createClient: () => ({ ping: () => 'pong' }),
    }))

    await expect(host.start({
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: 'duplicate-provider-import',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
      entrypoints: { electron: './missing-provider-entrypoint.mjs' },
      permissions: {},
      kits: {
        provides: [{
          id: 'kit.duplicate-before-import',
          version: '1.0.0',
          exposure: 'local-only',
        }],
      },
    })).rejects.toThrow('Kit API `kit.duplicate-before-import` already has an active Provider.')

    expect(host.listSessions()).toEqual([])
  })

  // https://github.com/moeru-ai/airi/pull/2506#discussion_r3986172725
  it('rejects a missing required Kit before Extension setup', async () => {
    const host = new ExtensionHost()
    let setupCalls = 0
    const extension = defineExtension({
      id: 'required-kit-consumer',
      setup() {
        setupCalls += 1
      },
    })

    await expect(host.startExtension(extension, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: extension.id,
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './consumer.mjs' },
        permissions: { apis: [{ key: 'kit.required', actions: ['invoke'] }] },
        kits: { uses: [{ id: 'kit.required', version: '1.0.0' }] },
      },
    })).rejects.toThrow('requires Kit `kit.required` at version `1.0.0`')

    expect(setupCalls).toBe(0)
    expect(host.listSessions()).toEqual([])
  })

  it('rejects an incompatible required Kit before Extension setup', async () => {
    const host = new ExtensionHost()
    host.registerKitApi(defineKit({
      id: 'kit.required-version',
      version: '2.0.0',
      createClient: () => ({ ping: () => 'pong' }),
    }))
    let setupCalls = 0
    const extension = defineExtension({
      id: 'required-kit-version-consumer',
      setup() {
        setupCalls += 1
      },
    })

    await expect(host.startExtension(extension, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: extension.id,
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        entrypoints: { electron: './consumer.mjs' },
        permissions: { apis: [{ key: 'kit.required-version', actions: ['invoke'] }] },
        kits: { uses: [{ id: 'kit.required-version', version: '1.0.0' }] },
      },
    })).rejects.toThrow('requires Kit `kit.required-version` at version `1.0.0`')

    expect(setupCalls).toBe(0)
    expect(host.listSessions()).toEqual([])
  })

  const createTestManifest = (
    id: string,
    options: {
      kits?: ExtensionManifestV2['kits']
      invokedKitIds?: string[]
    } = {},
  ): ExtensionManifestV2 => ({
    manifestVersion: 2,
    kind: 'manifest.extension.airi.moeru.ai',
    id,
    version: '1.0.0',
    engines: { airi: '*', runtimes: ['electron'] },
    entrypoints: { electron: `./${id}.mjs` },
    permissions: {
      apis: options.invokedKitIds?.map(key => ({ key, actions: ['invoke'] })) ?? [],
    },
    kits: options.kits,
  })

  const createActivityKit = () => {
    interface AgentActivity {
      agentId: string
      state: 'waiting-for-user' | 'completed'
      summary: string
    }

    return defineKitContract({
      id: 'dev.airi.agent-activity',
      version: '1.0.0',
      allowedExposePolicies: ['local-only'],
      defaultExposePolicy: 'local-only',
      methods: {
        getCurrentActivity: defineKitMethod<undefined, AgentActivity>(),
      },
      events: {
        activityChanged: defineKitEvent<AgentActivity>(),
      },
    })
  }

  it('captures Provider method handlers during registration', async () => {
    const host = new ExtensionHost()
    const kit = createActivityKit()
    const rawFailure = { capability: () => 'Provider capability' }
    let getterReads = 0
    const methods = Object.defineProperty({}, 'getCurrentActivity', {
      enumerable: true,
      get() {
        getterReads += 1
        if (getterReads > 1) {
          throw rawFailure
        }
        return () => ({
          agentId: 'codex',
          state: 'completed' as const,
          summary: 'Done.',
        })
      },
    })
    const provider = defineExtension({
      id: 'accessor-provider',
      setup(ctx) {
        Reflect.apply(ctx.kits.provide, ctx.kits, [kit, { methods }])
      },
    })
    await host.startExtension(provider, {
      manifest: createTestManifest(provider.id, {
        kits: { provides: [{ id: kit.id, version: kit.version, exposure: 'local-only' }] },
      }),
    })

    let observedSummary: string | undefined
    const consumer = defineExtension({
      id: 'accessor-consumer',
      async setup(ctx) {
        const client = await ctx.kits.use(kit)
        observedSummary = (await client.getCurrentActivity()).summary
      },
    })
    await host.startExtension(consumer, {
      manifest: createTestManifest(consumer.id, {
        invokedKitIds: [kit.id],
        kits: { uses: [{ id: kit.id, version: kit.version }] },
      }),
    })

    // ROOT CAUSE:
    //
    // Registration validated an accessor result but retained the Provider's
    // methods object. A later lookup could throw a raw object into Consumer
    // code instead of calling the validated handler.
    expect(getterReads).toBe(1)
    expect(observedSummary).toBe('Done.')
  })

  it('normalizes Provider method accessor failures during registration', async () => {
    const host = new ExtensionHost()
    const kit = createActivityKit()
    const rawFailure = { capability: () => 'Provider capability' }
    const methods = Object.defineProperty({}, 'getCurrentActivity', {
      enumerable: true,
      get() {
        throw rawFailure
      },
    })
    const provider = defineExtension({
      id: 'failing-accessor-provider',
      setup(ctx) {
        Reflect.apply(ctx.kits.provide, ctx.kits, [kit, { methods }])
      },
    })

    let observedError: unknown
    try {
      await host.startExtension(provider, {
        manifest: createTestManifest(provider.id, {
          kits: { provides: [{ id: kit.id, version: kit.version, exposure: 'local-only' }] },
        }),
      })
    }
    catch (error) {
      observedError = error
    }

    expect(observedError).toBeInstanceOf(Error)
    expect(observedError).not.toBe(rawFailure)
  })

  it('rejects an Extension Kit contract that collides with a Host Kit reference', async () => {
    const host = new ExtensionHost()
    const kit = createActivityKit()
    const createClient = vi.fn(() => ({ hostOnly: () => 'host' }))
    host.registerKitApi(defineKit({
      id: kit.id,
      version: kit.version,
      createClient,
    }))

    let tryUseReason: string | undefined
    let useError: unknown
    let watchReason: string | undefined
    const consumer = defineExtension({
      id: 'host-kind-mismatch-consumer',
      async setup(ctx) {
        const result = await ctx.kits.tryUse(kit)
        if (!result.ok) {
          tryUseReason = result.reason
        }
        try {
          await ctx.kits.use(kit)
        }
        catch (error) {
          useError = error
        }
        ctx.kits.watch(kit, (availability) => {
          if (!availability.available) {
            watchReason = availability.reason
          }
        })
      },
    })
    await host.startExtension(consumer, {
      manifest: createTestManifest(consumer.id, {
        invokedKitIds: [kit.id],
        kits: { uses: [{ id: kit.id, version: kit.version }] },
      }),
    })

    await vi.waitFor(() => expect(watchReason).toBe('incompatible-version'))
    expect(tryUseReason).toBe('incompatible-version')
    expect(useError).toMatchObject({ reason: 'incompatible-version' })
    expect(createClient).not.toHaveBeenCalled()
  })

  it('rejects a Host Kit reference that collides with an Extension Kit contract', async () => {
    const host = new ExtensionHost()
    const kit = createActivityKit()
    const provider = defineExtension({
      id: 'extension-kind-provider',
      setup(ctx) {
        ctx.kits.provide(kit, {
          methods: {
            getCurrentActivity: () => ({
              agentId: 'codex',
              state: 'completed' as const,
              summary: 'Done.',
            }),
          },
        })
      },
    })
    await host.startExtension(provider, {
      manifest: createTestManifest(provider.id, {
        kits: { provides: [{ id: kit.id, version: kit.version, exposure: 'local-only' }] },
      }),
    })
    const createClient = vi.fn(() => ({ hostOnly: () => 'host' }))
    const collidingHostKit = defineKit({
      id: kit.id,
      version: kit.version,
      createClient,
    })

    let tryUseReason: string | undefined
    const consumer = defineExtension({
      id: 'extension-kind-mismatch-consumer',
      async setup(ctx) {
        const result = await ctx.kits.tryUse(collidingHostKit)
        if (!result.ok) {
          tryUseReason = result.reason
        }
      },
    })
    await host.startExtension(consumer, {
      manifest: createTestManifest(consumer.id, {
        invokedKitIds: [kit.id],
        kits: { uses: [{ id: kit.id, version: kit.version }] },
      }),
    })

    expect(tryUseReason).toBe('incompatible-version')
    expect(createClient).not.toHaveBeenCalled()
  })

  it('publishes an Extension-hosted Kit only after Provider setup succeeds', async () => {
    const host = new ExtensionHost()
    const kit = createActivityKit()
    const setupGate = Promise.withResolvers<void>()
    const provided = Promise.withResolvers<void>()
    const provider = defineExtension({
      id: 'delayed-provider',
      async setup(ctx) {
        ctx.kits.provide(kit, {
          methods: {
            getCurrentActivity: () => ({
              agentId: 'codex',
              state: 'completed' as const,
              summary: 'Ready.',
            }),
          },
        })
        provided.resolve()
        await setupGate.promise
      },
    })
    const observed: boolean[] = []
    const consumer = defineExtension({
      id: 'delayed-provider-consumer',
      setup(ctx) {
        ctx.kits.watch(kit, (availability) => {
          observed.push(availability.available)
        })
      },
    })

    await host.startExtension(consumer, {
      manifest: createTestManifest(consumer.id, {
        invokedKitIds: [kit.id],
        kits: { uses: [{ id: kit.id, version: kit.version, optional: true }] },
      }),
    })
    await vi.waitFor(() => expect(observed).toEqual([false]))

    const providerStart = host.startExtension(provider, {
      manifest: createTestManifest(provider.id, {
        kits: { provides: [{ id: kit.id, version: kit.version, exposure: 'local-only' }] },
      }),
    })
    await provided.promise

    expect(host.getKit(kit.id)).toBeUndefined()
    expect(observed).toEqual([false])

    setupGate.resolve()
    await providerStart
    await vi.waitFor(() => expect(observed).toEqual([false, true]))
  })

  it('rejects a Provider that omits a declared Kit before becoming ready', async () => {
    const host = new ExtensionHost()
    const kit = createActivityKit()

    await expect(host.startExtension(defineExtension({
      id: 'incomplete-provider',
      setup() {},
    }), {
      manifest: createTestManifest('incomplete-provider', {
        kits: { provides: [{ id: kit.id, version: kit.version, exposure: 'local-only' }] },
      }),
    })).rejects.toThrow(`did not provide declared Kit \`${kit.id}\``)

    expect(host.getKit(kit.id)).toBeUndefined()
  })

  it('rejects a Provider that omits a declared Kit method', async () => {
    const host = new ExtensionHost()
    const kit = createActivityKit()
    const provider = defineExtension({
      id: 'incomplete-method-provider',
      setup(ctx) {
        Reflect.apply(ctx.kits.provide, ctx.kits, [kit, { methods: {} }])
      },
    })

    await expect(host.startExtension(provider, {
      manifest: createTestManifest(provider.id, {
        kits: { provides: [{ id: kit.id, version: kit.version, exposure: 'local-only' }] },
      }),
    })).rejects.toThrow('does not implement method `getCurrentActivity`')

    expect(host.getKit(kit.id)).toBeUndefined()
  })

  it('routes Kit methods and events through the Host-created client', async () => {
    const host = new ExtensionHost()
    const kit = createActivityKit()
    const providerActivity = {
      agentId: 'codex',
      state: 'waiting-for-user' as const,
      summary: 'Choose a model.',
    }
    let releaseClientResources = 0
    let emitActivity: ((activity: typeof providerActivity) => void) | undefined
    const provider = defineExtension({
      id: 'agent-activity-provider',
      setup(ctx) {
        const handle = ctx.kits.provide(kit, {
          methods: {
            getCurrentActivity(_input, call) {
              call.subscriptions.add({
                dispose() {
                  releaseClientResources += 1
                },
              })
              return providerActivity
            },
          },
        })
        emitActivity = activity => handle.emit('activityChanged', activity)
      },
    })
    const providerSession = await host.startExtension(provider, {
      manifest: createTestManifest(provider.id, {
        kits: { provides: [{ id: kit.id, version: kit.version, exposure: 'local-only' }] },
      }),
    })

    let client: KitClientOf<typeof kit> | undefined
    const observed: Array<{ agentId: string, state: string, summary: string }> = []
    const consumer = defineExtension({
      id: 'agent-activity-consumer',
      async setup(ctx) {
        const resolvedClient = await ctx.kits.use(kit)
        client = resolvedClient
        observed.push(await resolvedClient.getCurrentActivity())
        ctx.subscriptions.add(resolvedClient.activityChanged.subscribe((activity) => {
          observed.push(activity)
        }))
      },
    })
    const consumerSession = await host.startExtension(consumer, {
      manifest: createTestManifest(consumer.id, {
        invokedKitIds: [kit.id],
        kits: { uses: [{ id: kit.id, version: kit.version }] },
      }),
    })

    providerActivity.summary = 'Provider mutated its source object.'
    expect(observed[0]?.summary).toBe('Choose a model.')
    const activityClient = client
    if (!activityClient) {
      throw new Error('Expected the Consumer to receive an activity client.')
    }
    expect(() => Reflect.apply(activityClient.activityChanged.subscribe, activityClient.activityChanged, [undefined]))
      .toThrow('listener must be a function')

    const publish = emitActivity
    if (!publish) {
      throw new Error('Expected the Provider to expose its event publisher.')
    }
    publish({
      agentId: 'codex',
      state: 'waiting-for-user',
      summary: 'Input is still required.',
    })
    await vi.waitFor(() => expect(observed).toHaveLength(2))

    await host.stop(providerSession.id)
    expect(releaseClientResources).toBe(1)
    await expect(activityClient.getCurrentActivity()).rejects.toThrow('Provider is not available')
    expect(() => publish(providerActivity)).toThrow('Provider is not available')

    await host.stop(consumerSession.id)
  })

  it('rejects required-Kit preflight while the Provider is stopping', async () => {
    const host = new ExtensionHost()
    const kit = createActivityKit()
    const releaseCleanup = Promise.withResolvers<void>()
    const provider = defineExtension({
      id: 'stopping-preflight-provider',
      setup(ctx) {
        ctx.kits.provide(kit, {
          methods: {
            getCurrentActivity: () => ({
              agentId: 'codex',
              state: 'completed' as const,
              summary: 'Done.',
            }),
          },
        })
        ctx.subscriptions.add({ dispose: () => releaseCleanup.promise })
      },
    })
    const providerSession = await host.startExtension(provider, {
      manifest: createTestManifest(provider.id, {
        kits: { provides: [{ id: kit.id, version: kit.version, exposure: 'local-only' }] },
      }),
    })

    const stopping = host.stop(providerSession.id)
    expect(host.getSession(providerSession.id)?.phase).toBe('stopped')

    await expect(host.start({
      ...createTestManifest('stopping-preflight-consumer', {
        invokedKitIds: [kit.id],
        kits: { uses: [{ id: kit.id, version: kit.version }] },
      }),
      entrypoints: { electron: './must-not-import.mjs' },
    })).rejects.toThrow(`requires Kit \`${kit.id}\``)

    releaseCleanup.resolve()
    await stopping
  })

  it('rechecks Provider state after asynchronous Kit resolution', async () => {
    const host = new ExtensionHost()
    const kit = createActivityKit()
    const releaseCleanup = Promise.withResolvers<void>()
    const provider = defineExtension({
      id: 'resolution-race-provider',
      setup(ctx) {
        ctx.kits.provide(kit, {
          methods: {
            getCurrentActivity: () => ({
              agentId: 'codex',
              state: 'completed' as const,
              summary: 'Done.',
            }),
          },
        })
        ctx.subscriptions.add({ dispose: () => releaseCleanup.promise })
      },
    })
    const providerSession = await host.startExtension(provider, {
      manifest: createTestManifest(provider.id, {
        kits: { provides: [{ id: kit.id, version: kit.version, exposure: 'local-only' }] },
      }),
    })
    let tryUse: (() => Promise<unknown>) | undefined
    const consumer = defineExtension({
      id: 'resolution-race-consumer',
      setup(ctx) {
        tryUse = () => ctx.kits.tryUse(kit)
      },
    })
    await host.startExtension(consumer, {
      manifest: createTestManifest(consumer.id, {
        invokedKitIds: [kit.id],
        kits: { uses: [{ id: kit.id, version: kit.version, optional: true }] },
      }),
    })

    const resolve = tryUse
    if (!resolve) {
      throw new Error('Expected the Consumer to expose Kit resolution.')
    }
    const pendingResult = resolve()
    const stopping = host.stop(providerSession.id)

    await expect(pendingResult).resolves.toMatchObject({ ok: false, reason: 'missing-kit' })

    releaseCleanup.resolve()
    await stopping
  })

  it('disposes each Extension Kit client scope when either owner unloads', async () => {
    const host = new ExtensionHost()
    const kit = createActivityKit()
    let cleanupCalls = 0
    const provider = defineExtension({
      id: 'client-scope-provider',
      setup(ctx) {
        ctx.kits.provide(kit, {
          methods: {
            getCurrentActivity: (_input, call) => {
              call.subscriptions.add({
                dispose: async () => {
                  await Promise.resolve()
                  cleanupCalls += 1
                },
              })
              return {
                agentId: 'codex',
                state: 'completed' as const,
                summary: 'Done.',
              }
            },
          },
        })
      },
    })
    const providerSession = await host.startExtension(provider, {
      manifest: createTestManifest(provider.id, {
        kits: { provides: [{ id: kit.id, version: kit.version, exposure: 'local-only' }] },
      }),
    })

    const startConsumer = async (id: string) => {
      return host.startExtension(defineExtension({
        id,
        async setup(ctx) {
          const client = await ctx.kits.use(kit)
          await client.getCurrentActivity()
        },
      }), {
        manifest: createTestManifest(id, {
          invokedKitIds: [kit.id],
          kits: { uses: [{ id: kit.id, version: kit.version }] },
        }),
      })
    }

    const firstConsumer = await startConsumer('client-scope-consumer-first')
    await host.stop(firstConsumer.id)
    expect(cleanupCalls).toBe(1)

    const secondConsumer = await startConsumer('client-scope-consumer-second')
    await host.stop(providerSession.id)
    expect(cleanupCalls).toBe(2)

    await host.stop(secondConsumer.id)
    expect(cleanupCalls).toBe(2)
  })

  it('isolates Consumer watcher failures while a Provider unloads', async () => {
    const host = new ExtensionHost()
    const kit = createActivityKit()
    const provider = defineExtension({
      id: 'watcher-isolation-provider',
      setup(ctx) {
        ctx.kits.provide(kit, {
          methods: {
            getCurrentActivity: () => ({
              agentId: 'codex',
              state: 'completed' as const,
              summary: 'Done.',
            }),
          },
        })
      },
    })
    const observed: boolean[] = []
    const consumer = defineExtension({
      id: 'watcher-isolation-consumer',
      setup(ctx) {
        ctx.kits.watch(kit, (availability) => {
          if (!availability.available) {
            throw new Error('Consumer watcher failed.')
          }
        })
        ctx.kits.watch(kit, (availability) => {
          observed.push(availability.available)
        })
      },
    })
    const providerSession = await host.startExtension(provider, {
      manifest: createTestManifest(provider.id, {
        kits: { provides: [{ id: kit.id, version: kit.version, exposure: 'local-only' }] },
      }),
    })
    await host.startExtension(consumer, {
      manifest: createTestManifest(consumer.id, {
        invokedKitIds: [kit.id],
        kits: { uses: [{ id: kit.id, version: kit.version }] },
      }),
    })
    await vi.waitFor(() => expect(observed).toEqual([true]))

    await host.stop(providerSession.id)
    expect(host.getSession(providerSession.id)).toBeUndefined()
    expect(observed).toEqual([true, false])
  })

  it('does not wait for Consumer watchers during Provider startup or unload', async () => {
    const host = new ExtensionHost()
    const kit = createActivityKit()
    const pending = new Promise<void>(() => {})
    const observed: boolean[] = []
    const consumer = defineExtension({
      id: 'pending-watcher-consumer',
      setup(ctx) {
        ctx.kits.watch(kit, () => pending)
        ctx.kits.watch(kit, (availability) => {
          observed.push(availability.available)
        })
      },
    })
    await host.startExtension(consumer, {
      manifest: createTestManifest(consumer.id, {
        invokedKitIds: [kit.id],
        kits: { uses: [{ id: kit.id, version: kit.version, optional: true }] },
      }),
    })
    await vi.waitFor(() => expect(observed).toEqual([false]))

    const provider = defineExtension({
      id: 'pending-watcher-provider',
      setup(ctx) {
        ctx.kits.provide(kit, {
          methods: {
            getCurrentActivity: () => ({
              agentId: 'codex',
              state: 'completed' as const,
              summary: 'Done.',
            }),
          },
        })
      },
    })
    const providerSession = await host.startExtension(provider, {
      manifest: createTestManifest(provider.id, {
        kits: { provides: [{ id: kit.id, version: kit.version, exposure: 'local-only' }] },
      }),
    })
    await vi.waitFor(() => expect(observed).toEqual([false, true]))

    await host.stop(providerSession.id)
    expect(host.getSession(providerSession.id)).toBeUndefined()
    await vi.waitFor(() => expect(observed).toEqual([false, true, false]))
  })

  it('serializes availability deliveries for each Kit watcher', async () => {
    const host = new ExtensionHost()
    const kit = createActivityKit()
    const provider = defineExtension({
      id: 'ordered-watcher-provider',
      setup(ctx) {
        ctx.kits.provide(kit, {
          methods: {
            getCurrentActivity: () => ({
              agentId: 'codex',
              state: 'completed' as const,
              summary: 'Done.',
            }),
          },
        })
      },
    })
    const providerSession = await host.startExtension(provider, {
      manifest: createTestManifest(provider.id, {
        kits: { provides: [{ id: kit.id, version: kit.version, exposure: 'local-only' }] },
      }),
    })
    const firstDeliveryStarted = Promise.withResolvers<void>()
    const releaseFirstDelivery = Promise.withResolvers<void>()
    const observed: boolean[] = []
    const consumer = defineExtension({
      id: 'ordered-watcher-consumer',
      setup(ctx) {
        ctx.kits.watch(kit, async (availability) => {
          if (availability.available) {
            firstDeliveryStarted.resolve()
            await releaseFirstDelivery.promise
          }
          observed.push(availability.available)
        })
      },
    })
    await host.startExtension(consumer, {
      manifest: createTestManifest(consumer.id, {
        invokedKitIds: [kit.id],
        kits: { uses: [{ id: kit.id, version: kit.version }] },
      }),
    })
    await firstDeliveryStarted.promise

    await host.stop(providerSession.id)
    expect(observed).toEqual([])

    releaseFirstDelivery.resolve()
    await vi.waitFor(() => expect(observed).toEqual([true, false]))
  })

  it('discards stale Kit availability while an earlier delivery is pending', async () => {
    const host = new ExtensionHost()
    const kit = createActivityKit()
    const firstDeliveryStarted = Promise.withResolvers<void>()
    const releaseFirstDelivery = Promise.withResolvers<void>()
    const observed: boolean[] = []
    const consumer = defineExtension({
      id: 'stale-watcher-consumer',
      setup(ctx) {
        let deliveryCount = 0
        ctx.kits.watch(kit, async (availability) => {
          deliveryCount += 1
          if (deliveryCount === 1) {
            firstDeliveryStarted.resolve()
            await releaseFirstDelivery.promise
          }
          observed.push(availability.available)
        })
      },
    })
    await host.startExtension(consumer, {
      manifest: createTestManifest(consumer.id, {
        invokedKitIds: [kit.id],
        kits: { uses: [{ id: kit.id, version: kit.version, optional: true }] },
      }),
    })
    await firstDeliveryStarted.promise

    const provider = defineExtension({
      id: 'stale-watcher-provider',
      setup(ctx) {
        ctx.kits.provide(kit, {
          methods: {
            getCurrentActivity: () => ({
              agentId: 'codex',
              state: 'completed' as const,
              summary: 'Done.',
            }),
          },
        })
      },
    })
    const providerSession = await host.startExtension(provider, {
      manifest: createTestManifest(provider.id, {
        kits: { provides: [{ id: kit.id, version: kit.version, exposure: 'local-only' }] },
      }),
    })
    await host.stop(providerSession.id)
    releaseFirstDelivery.resolve()

    await vi.waitFor(() => expect(observed.length).toBeGreaterThanOrEqual(2))
    expect(observed).not.toContain(true)
  })

  it('rejects values that cannot cross the Kit protocol seam', async () => {
    const host = new ExtensionHost()
    const kit = defineKitContract({
      id: 'dev.airi.echo',
      version: '1.0.0',
      methods: {
        echo: defineKitMethod<{ value: string }, { value: string }>(),
      },
      events: {},
    })
    const provider = defineExtension({
      id: 'echo-provider',
      setup(ctx) {
        ctx.kits.provide(kit, {
          methods: {
            echo: input => input,
          },
        })
      },
    })
    await host.startExtension(provider, {
      manifest: createTestManifest(provider.id, {
        kits: { provides: [{ id: kit.id, version: kit.version, exposure: 'local-only' }] },
      }),
    })

    const consumer = defineExtension({
      id: 'echo-consumer',
      async setup(ctx) {
        const client = await ctx.kits.use(kit)
        const echo = Reflect.get(client, 'echo') as (input: unknown) => Promise<unknown>
        await expect(echo({ callback: () => 'raw capability' })).rejects.toThrow('must be a KitValue')
      },
    })
    await host.startExtension(consumer, {
      manifest: createTestManifest(consumer.id, {
        invokedKitIds: [kit.id],
        kits: { uses: [{ id: kit.id, version: kit.version }] },
      }),
    })
  })

  it('rejects Provider outputs and events that contain JavaScript capabilities', async () => {
    const host = new ExtensionHost()
    const kit = defineKitContract({
      id: 'dev.airi.invalid-output',
      version: '1.0.0',
      methods: {
        read: defineKitMethod<undefined, { value: string }>(),
      },
      events: {
        changed: defineKitEvent<{ value: string }>(),
      },
    })
    let publishInvalid: (() => void) | undefined
    const provider = defineExtension({
      id: 'invalid-output-provider',
      setup(ctx) {
        const invalidMethod = () => () => 'raw capability'
        const handle = Reflect.apply(ctx.kits.provide, ctx.kits, [kit, {
          methods: { read: invalidMethod },
        }])
        publishInvalid = () => {
          Reflect.apply(handle.emit, handle, ['changed', { callback: () => 'raw capability' }])
        }
      },
    })
    await host.startExtension(provider, {
      manifest: createTestManifest(provider.id, {
        kits: { provides: [{ id: kit.id, version: kit.version, exposure: 'local-only' }] },
      }),
    })

    const consumer = defineExtension({
      id: 'invalid-output-consumer',
      async setup(ctx) {
        const client = await ctx.kits.use(kit)
        await expect(client.read()).rejects.toThrow('output must be a KitValue')
      },
    })
    await host.startExtension(consumer, {
      manifest: createTestManifest(consumer.id, {
        invokedKitIds: [kit.id],
        kits: { uses: [{ id: kit.id, version: kit.version }] },
      }),
    })

    const publish = publishInvalid
    if (!publish) {
      throw new Error('Expected the Provider to expose an event publisher.')
    }
    expect(publish).toThrow('payload must be a KitValue')
  })

  it('rejects an Extension-hosted Kit that is absent from the Provider manifest', async () => {
    const host = new ExtensionHost()
    const kit = createActivityKit()

    await expect(host.startExtension(defineExtension({
      id: 'undeclared-kit-provider',
      setup(ctx) {
        ctx.kits.provide(kit, {
          methods: {
            getCurrentActivity: () => ({
              agentId: 'codex',
              state: 'completed' as const,
              summary: 'Done.',
            }),
          },
        })
      },
    }), {
      manifest: createTestManifest('undeclared-kit-provider'),
    })).rejects.toThrow(`cannot provide undeclared Kit \`${kit.id}\``)
  })

  it('rejects a second active Provider for the same Extension-hosted Kit', async () => {
    const host = new ExtensionHost()
    const kit = createActivityKit()
    const manifestFor = (id: string) => createTestManifest(id, {
      kits: { provides: [{ id: kit.id, version: kit.version, exposure: 'local-only' }] },
    })
    const providerFor = (id: string) => defineExtension({
      id,
      setup(ctx) {
        ctx.kits.provide(kit, {
          methods: {
            getCurrentActivity: () => ({
              agentId: 'codex',
              state: 'completed' as const,
              summary: 'Done.',
            }),
          },
        })
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

  it('removes Provider-owned Kits when another Extension disposable fails', async () => {
    const host = new ExtensionHost()
    const kit = createActivityKit()
    const manifest = createTestManifest('failing-disposable-provider', {
      kits: { provides: [{ id: kit.id, version: kit.version, exposure: 'local-only' }] },
    })
    const provider = defineExtension({
      id: manifest.id,
      setup(ctx) {
        ctx.kits.provide(kit, {
          methods: {
            getCurrentActivity: () => ({
              agentId: 'codex',
              state: 'completed' as const,
              summary: 'Done.',
            }),
          },
        })
        ctx.subscriptions.add({
          dispose() {
            throw new Error('Extension cleanup failed.')
          },
        })
      },
    })
    const providerSession = await host.startExtension(provider, { manifest })

    await expect(host.stop(providerSession.id)).rejects.toThrow('Extension cleanup failed.')

    expect(host.getSession(providerSession.id)).toBeUndefined()
    expect(host.getKit(kit.id)).toBeUndefined()
    await expect(host.startExtension(provider, { manifest })).resolves.toMatchObject({ phase: 'ready' })
  })

  it('rejects an incompatible AIRI version before importing the entrypoint', async () => {
    const host = new ExtensionHost({ runtime: 'node', airiVersion: '1.0.0' })

    await expect(host.start({
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: 'future-extension',
      version: '1.0.0',
      engines: { airi: '>=99.0.0', runtimes: ['node'] },
      permissions: {},
      entrypoints: { node: './missing-entrypoint.mjs' },
    })).rejects.toThrow('requires AIRI `>=99.0.0`')
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

    await vi.waitFor(() => expect(observed).toEqual([false, true]))
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

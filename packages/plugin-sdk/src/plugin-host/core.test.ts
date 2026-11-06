import type { Logger, ObserveRecord } from 'injeca'

import type { ExtensionModuleContext, ExtensionSelf, ExtensionSetupContext } from '../extension'
import type { ExtensionSession } from './session'
import type { ExtensionManifestV2, ModulePermissionDeclaration } from './shared/types'

import { join } from 'node:path'

import { createContainer, createNoopLogger, observe, provide, waitFor } from 'injeca'
import { drained, manualClock } from 'injeca/testing'
import { safeParse } from 'valibot'
import { describe, expect, it, vi } from 'vitest'

import { ExtensionHost, extensionManifestV2Schema, FileSystemLoader, kitProviderKey, moduleNodeKey, pluginNodeKeys } from '.'
import { defineExtension } from '../extension'
import { defineKit, defineKitContract, defineKitMethod } from '../kit'
import { ExtensionHost as NodeExtensionHost } from './runtimes/node'

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

  // https://github.com/moeru-ai/airi/pull/2506#discussion_r4013407993
  it('rejects non-semantic Extension package versions (PR #2506)', () => {
    // ROOT CAUSE:
    //
    // The manifest schema only required a non-empty package version, so an
    // invalid value could become the installed package and session identity.
    const result = safeParse(extensionManifestV2Schema, {
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: 'airi-extension-test',
      version: 'release-1',
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

  // https://github.com/moeru-ai/airi/pull/2506#discussion_r4014945385
  it('rejects Extension ids longer than one portable folder component (PR #2506)', () => {
    // ROOT CAUSE:
    //
    // The schema accepted an ID that exceeds the 255-byte component limit on
    // common file systems. Folder import then failed with ENAMETOOLONG.
    const result = safeParse(extensionManifestV2Schema, {
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: 'a'.repeat(256),
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

  // https://github.com/moeru-ai/airi/pull/2506#discussion_r4014945385
  it('rejects Windows device names as Extension ids (PR #2506)', () => {
    // ROOT CAUSE:
    //
    // Windows reserves device names even when a file extension follows them.
    // The schema accepted these names as normal installation folders.
    const result = safeParse(extensionManifestV2Schema, {
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: 'con.tools',
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

  // https://github.com/moeru-ai/airi/pull/2687
  it('accepts exact package and Provider versions with build metadata (PR #2687)', () => {
    // ROOT CAUSE:
    //
    // semver.valid omits build metadata from its result.
    // Comparing that result with the input rejected valid exact versions.
    // The exact-version predicate now reconstructs the complete version before comparison.
    const version = '1.2.3-rc.1+build.007'
    const result = safeParse(extensionManifestV2Schema, {
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: 'build-metadata-provider',
      version,
      engines: { airi: '*', runtimes: ['electron'] },
      permissions: {},
      entrypoints: { electron: './extension.mjs' },
      kits: { provides: [{ id: 'kit.build-metadata', version, exposure: 'local-only' }] },
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.output.version).toBe(version)
      expect(result.output.kits?.provides?.[0]?.version).toBe(version)
    }
  })

  it('rejects duplicate provided Kit ids', () => {
    const result = safeParse(extensionManifestV2Schema, {
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: 'duplicate-kit-provider',
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
        provides: [
          {
            id: 'dev.airi.agent-activity',
            version: '1.0.0',
            exposure: 'local-only',
          },
          {
            id: 'dev.airi.agent-activity',
            version: '2.0.0',
            exposure: 'remote-callable',
          },
        ],
      },
    })

    // ROOT CAUSE:
    //
    // Preflight and runtime resolution find Kit declarations by id. If the
    // manifest repeats an id, those stages can select different contracts.
    // The schema now rejects that ambiguity before Extension code can run.
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.issues).toContainEqual(expect.objectContaining({
        message: 'Declare each provided Kit once.',
      }))
    }
  })

  it('rejects duplicate used Kit ids', () => {
    const result = safeParse(extensionManifestV2Schema, {
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: 'duplicate-kit-consumer',
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
        uses: [
          {
            id: 'dev.airi.agent-activity',
            version: '2.0.0',
            optional: true,
          },
          {
            id: 'dev.airi.agent-activity',
            version: '1.0.0',
          },
        ],
      },
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.issues).toContainEqual(expect.objectContaining({
        message: 'Declare each used Kit once.',
      }))
    }
  })

  it('accepts Kit version ranges for Consumer declarations', () => {
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

    expect(result.success).toBe(true)
  })

  it('accepts exact Kit versions for Consumer declarations', () => {
    const result = safeParse(extensionManifestV2Schema, {
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: 'exact-version-consumer',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
      permissions: {},
      entrypoints: { electron: './extension.mjs' },
      kits: {
        uses: [{ id: 'dev.airi.agent-activity', version: '1.0.0' }],
      },
    })

    expect(result.success).toBe(true)
  })

  it('accepts compound Kit version ranges for Consumer declarations', () => {
    const result = safeParse(extensionManifestV2Schema, {
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: 'compound-range-consumer',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
      permissions: {},
      entrypoints: { electron: './extension.mjs' },
      kits: {
        uses: [{ id: 'dev.airi.agent-activity', version: '>=1 <2' }],
      },
    })

    expect(result.success).toBe(true)
  })

  it('rejects invalid Kit version ranges for Consumer declarations', () => {
    const result = safeParse(extensionManifestV2Schema, {
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: 'invalid-range-consumer',
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
      permissions: {},
      entrypoints: { electron: './extension.mjs' },
      kits: {
        uses: [{ id: 'dev.airi.agent-activity', version: 'not-a-range' }],
      },
    })

    expect(result.success).toBe(false)
  })

  it('rejects Kit version ranges for Provider declarations', () => {
    const result = safeParse(extensionManifestV2Schema, {
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: 'agent-activity-provider',
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
        provides: [{
          id: 'dev.airi.agent-activity',
          version: '^1.0.0',
          exposure: 'local-only',
        }],
      },
    })

    expect(result.success).toBe(false)
  })
})

/**
 * Creates a Node Host on a manual clock with a stop timeout of 1 second.
 * It keeps the injeca warnings, and the `timeout` and `reentrant-call` records of the Host container.
 *
 * @example
 * const { host, time, warnings } = hostOnManualClock()
 * time.advance(1_000) // runs the stop timeout
 */
function hostOnManualClock() {
  const time = manualClock()
  const warnings: string[] = []
  const logger: Logger = { ...createNoopLogger(), warn: message => warnings.push(message) }
  const host = new NodeExtensionHost({ container: createContainer({ clock: time.clock, logger }), timeouts: { stop: 1_000 } })
  const records: ObserveRecord[] = []
  observe(host.container, (record) => {
    if (record.type === 'timeout' || record.type === 'reentrant-call')
      records.push(record)
  })
  return { host, time, warnings, records }
}

describe('extension-hosted Kit registration lifecycle', () => {
  const contract = defineKitContract({
    id: 'kit.hosted-lifecycle',
    version: '1.0.0',
    methods: { read: defineKitMethod<undefined, string>() },
    events: {},
  })

  function manifest(id: string) {
    return {
      manifestVersion: 2 as const,
      kind: 'manifest.extension.airi.moeru.ai' as const,
      id,
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron' as const] },
      permissions: {},
      entrypoints: {},
      kits: { provides: [{ id: contract.id, version: contract.version, exposure: 'local-only' as const }] },
    }
  }

  it('publishes only after setup returns and withdraws before cleanup callbacks', async () => {
    const host = new ExtensionHost()
    const cleanupError = new Error('cleanup failed')
    const extension = defineExtension({
      id: 'provider-one',
      setup(ctx) {
        ctx.kits.provide(contract, { methods: { read: () => 'ready' } })
        expect(host.getKitProvider(contract.id)).toBeUndefined()
        ctx.subscriptions.add({ dispose: () => {
          expect(host.getKitProvider(contract.id)).toBeUndefined()
          throw cleanupError
        } })
      },
    })

    const session = await host.startExtension(extension, { manifest: manifest(extension.id) })
    expect(host.getKitProvider(contract.id)).toMatchObject({ instanceId: expect.any(String), owner: { kind: 'extension', sessionId: session.id } })
    await expect(host.stop(session.id)).rejects.toBe(cleanupError)
    expect(host.getKitProvider(contract.id)).toBeUndefined()
  })

  // https://github.com/moeru-ai/airi/pull/2687
  it('releases a setup on stop without waiting for it, and rejects late setup publication (PR #2687)', async () => {
    // ROOT CAUSE:
    //
    // Stop owned only committed leases, so an async setup retained its pending transaction.
    // The old setup then published after stop or blocked a replacement session.
    // The setup transaction now aborts with the start hook signal, and stop does not wait for the setup.
    const host = new ExtensionHost()
    const entered = Promise.withResolvers<void>()
    const resume = Promise.withResolvers<void>()
    const dispose = vi.fn()
    let lateProvide: unknown
    const starting = host.startExtension(defineExtension({
      id: 'provider-one',
      async setup(ctx) {
        ctx.subscriptions.add({ dispose })
        entered.resolve()
        await resume.promise
        try {
          ctx.kits.provide(contract, { methods: { read: () => 'old' } })
        }
        catch (error) {
          lateProvide = error
        }
      },
    }), { manifest: manifest('provider-one') })
    const result = starting.catch((error: unknown) => error)
    await entered.promise
    const [pending] = host.listSessions()
    expect(pending.phase).toBe('setting-up')

    await host.stop(pending.id)
    expect(await result).toMatchObject({ message: expect.stringContaining('stopped before setup completed') })
    const replacement = await host.startExtension(defineExtension({
      id: 'provider-two',
      setup(ctx) {
        ctx.kits.provide(contract, { methods: { read: () => 'new' } })
      },
    }), { manifest: manifest('provider-two') })
    resume.resolve()
    await vi.waitFor(() => expect(lateProvide).toMatchObject({ code: 'provide-after-setup' }))

    expect(pending.phase).toBe('stopped')
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(host.listSessions()).toEqual([replacement])
    expect(host.getKitProvider(contract.id)).toMatchObject({ owner: { sessionId: replacement.id } })
  })

  // https://github.com/moeru-ai/airi/pull/2687
  // ROOT CAUSE:
  //
  // Stop released only committed Providers, so suspended setup retained its transaction and module registration access.
  // The stopped round now rejects late provide and module registration.
  it('cancels an unfilled setup and rejects late provide and module registration (PR #2687)', async () => {
    const host = new ExtensionHost()
    const entered = Promise.withResolvers<void>()
    const resume = Promise.withResolvers<void>()
    const late = Promise.withResolvers<void>()
    const starting = host.startExtension(defineExtension({
      id: 'provider-one',
      async setup(ctx) {
        entered.resolve()
        await resume.promise
        expect(() => ctx.kits.provide(contract, { methods: { read: () => 'late' } })).toThrow('provide-after-setup')
        await expect(ctx.modules.register({ id: 'late-module' })).rejects.toThrow('stopped')
        late.resolve()
      },
    }), { manifest: manifest('provider-one') })
    const result = starting.catch((error: unknown) => error)
    await entered.promise
    const [pending] = host.listSessions()
    await host.stop(pending.id)
    resume.resolve()
    expect(await result).toMatchObject({ message: expect.stringContaining('stopped before setup completed') })
    await late.promise

    expect(host.listSessions()).toEqual([])
    expect(host.listModules()).toEqual([])
    expect(host.getKitProvider(contract.id)).toBeUndefined()
    const replacement = await host.startExtension(defineExtension({
      id: 'provider-two',
      setup(ctx) {
        ctx.kits.provide(contract, { methods: { read: () => 'new' } })
      },
    }), { manifest: manifest('provider-two') })
    expect(host.getKitProvider(contract.id)).toMatchObject({ owner: { sessionId: replacement.id } })
  })

  // https://github.com/moeru-ai/airi/pull/2687
  // ROOT CAUSE:
  //
  // Repeated cleanup returned early after disposal started, so a concurrent caller lost the cleanup error.
  // Concurrent stops now share one container disposal and its errors. A setup failure after stop is ignored.
  it('shares in-flight stop cleanup between callers and ignores a late setup failure (PR #2687)', async () => {
    const host = new ExtensionHost()
    const entered = Promise.withResolvers<void>()
    const resume = Promise.withResolvers<void>()
    const cleaning = Promise.withResolvers<void>()
    const finishCleanup = Promise.withResolvers<void>()
    const cleanupError = new Error('stop cleanup failure')
    const dispose = vi.fn(async () => {
      cleaning.resolve()
      await finishCleanup.promise
      throw cleanupError
    })
    const starting = host.startExtension(defineExtension({
      id: 'provider-one',
      async setup(ctx) {
        ctx.subscriptions.add({ dispose })
        entered.resolve()
        await resume.promise
        throw new Error('late setup failure')
      },
    }), { manifest: manifest('provider-one') })
    const result = starting.catch((error: unknown) => error)
    await entered.promise
    const [pending] = host.listSessions()
    const stopping = host.stop(pending.id).catch((error: unknown) => error)
    const stoppingAgain = host.stop(pending.id).catch((error: unknown) => error)
    await cleaning.promise
    resume.resolve()
    finishCleanup.resolve()
    expect(await result).toMatchObject({ message: expect.stringContaining('stopped before setup completed') })
    expect(await stopping).toBe(cleanupError)
    expect(await stoppingAgain).toBe(cleanupError)

    expect(dispose).toHaveBeenCalledTimes(1)
    expect(pending.phase).toBe('stopped')
    expect(host.listSessions()).toEqual([])
    expect(host.getKitProvider(contract.id)).toBeUndefined()
  })

  it('rolls back after setup failure and after an omitted declaration', async () => {
    const host = new ExtensionHost()
    const setupError = new Error('setup failed')
    await expect(host.startExtension(defineExtension({
      id: 'provider-one',
      setup(ctx) {
        ctx.kits.provide(contract, { methods: { read: () => 'ready' } })
        throw setupError
      },
    }), { manifest: manifest('provider-one') })).rejects.toBe(setupError)
    expect(host.getKitProvider(contract.id)).toBeUndefined()

    await expect(host.startExtension(defineExtension({
      id: 'provider-two',
      setup() {},
    }), { manifest: manifest('provider-two') })).rejects.toThrow('missing-declared-kit')
    expect(host.getKitProvider(contract.id)).toBeUndefined()

    await expect(host.startExtension(defineExtension({
      id: 'provider-withdrawn',
      async setup(ctx) {
        // A provide that setup withdraws before the commit leaves the declaration unfilled.
        await ctx.kits.provide(contract, { methods: { read: () => 'ready' } }).dispose()
      },
    }), { manifest: manifest('provider-withdrawn') })).rejects.toThrow('missing-declared-kit')

    const session = await host.startExtension(defineExtension({
      id: 'provider-three',
      setup(ctx) {
        ctx.kits.provide(contract, { methods: { read: () => 'ready' } })
      },
    }), { manifest: manifest('provider-three') })
    expect(host.getKitProvider(contract.id)?.owner).toMatchObject({ sessionId: session.id })
  })

  // https://github.com/moeru-ai/airi/pull/2687
  // ROOT CAUSE:
  //
  // Stop joined the cleanup promise that awaited its own disposer, including after await.
  // A self-stop without a signal is not found after an `await`, so it waits for itself until the configured stop timeout.
  // injeca then stops waiting for that cleanup with a warning, and every caller resolves. External callers share one outcome, and the later cleanup still runs.
  it('resolves a self-stop without a signal after the stop timeout, with a warning, while external stops share the outcome (PR #2687)', async () => {
    const { host, time, warnings, records } = hostOnManualClock()
    const entered = Promise.withResolvers<void>()
    const resume = Promise.withResolvers<void>()
    const remaining = vi.fn()
    let selfStop: Promise<ExtensionSession | undefined> | undefined
    const session = await host.startExtension(defineExtension({
      id: 'self-stop',
      setup(ctx) {
        ctx.kits.provide(contract, { methods: { read: () => 'ready' } })
        ctx.subscriptions.add({ dispose: remaining })
        ctx.subscriptions.add({ dispose: async () => {
          entered.resolve()
          await resume.promise
          selfStop = host.stop(session.id)
          await selfStop
        } })
      },
    }), { manifest: manifest('self-stop') })

    const stopping = host.stop(session.id)
    await entered.promise
    const stoppingAgain = host.stop(session.id)
    let externalFinished = false
    void stoppingAgain.then(() => {
      externalFinished = true
    })
    resume.resolve()
    await vi.waitFor(() => expect(selfStop).toBeDefined())
    await drained(host.container)
    expect(externalFinished).toBe(false)
    expect(remaining).not.toHaveBeenCalled()

    time.advance(1_000)
    expect(await stopping).toBe(session)
    expect(await stoppingAgain).toBe(session)
    expect(await selfStop).toBe(session)
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ type: 'timeout', hook: 'stop', key: pluginNodeKeys.session, timeoutMs: 1_000 })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('It must pass its signal to stop() or dispose().')
    expect(remaining).toHaveBeenCalledTimes(1)
    expect(host.listSessions()).toEqual([])
    expect(host.getKitProvider(contract.id)).toBeUndefined()
  })

  // https://github.com/moeru-ai/airi/pull/2687
  // ROOT CAUSE:
  //
  // Reload joined the same session cleanup from inside a module disposer and never reached fresh start.
  // Without a signal, the reload waits for its own cleanup until the configured stop timeout. injeca then warns, and the stop and the reload resolve.
  // The reload then starts a fresh session, because the old session is gone.
  it('resolves a module self-reload without a signal after the stop timeout, with a warning (PR #2687)', async () => {
    const { host, time, warnings, records } = hostOnManualClock()
    const remaining = vi.fn()
    let selfReload: Promise<ExtensionSession> | undefined
    const session = await host.startExtension(defineExtension({
      id: 'self-reload',
      async setup(ctx) {
        ctx.kits.provide(contract, { methods: { read: () => 'ready' } })
        ctx.subscriptions.add({ dispose: remaining })
        const module = await ctx.modules.register({ id: 'module-one' })
        module.subscriptions.add({ dispose: async () => {
          await Promise.resolve()
          // Only the first session reloads. The fresh session must not reload again when the test disposes it.
          selfReload ??= host.reload(session.id)
          await selfReload
        } })
      },
    }), { manifest: manifest('self-reload') })

    const stopping = host.stop(session.id)
    let reloadFinished = false
    await vi.waitFor(() => expect(selfReload).toBeDefined())
    void selfReload!.then(() => {
      reloadFinished = true
    })
    await drained(host.container)
    expect(reloadFinished).toBe(false)

    time.advance(1_000)
    expect(await stopping).toBe(session)
    const fresh = await selfReload!
    expect(fresh.id).not.toBe(session.id)
    expect(fresh.phase).toBe('ready')
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ type: 'timeout', hook: 'stop', key: pluginNodeKeys.session, timeoutMs: 1_000 })
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain('It must pass its signal to stop() or dispose().')
    // The abandoned cleanup goes on in the background after the timeout.
    await vi.waitFor(() => expect(remaining).toHaveBeenCalledTimes(1))
    expect(session.modules.size).toBe(0)
    expect(host.listSessions().map(listed => listed.id)).toEqual([fresh.id])
    await host.dispose()
  })

  // A plugin cleanup gets the stop signal of its Host run in `DisposeOptions`. `ctx.self.stop({ signal })` sends the run id back,
  // so injeca finds the self-wait also after an `await`. The manual clock never moves, so the stop timeout cannot end this cleanup.
  it('resolves ctx.self.stop({ signal }) from a module cleanup at once while external stops share the outcome', async () => {
    const { host, records } = hostOnManualClock()
    const entered = Promise.withResolvers<void>()
    const resume = Promise.withResolvers<void>()
    const remaining = vi.fn()
    let selfStopped = false
    const session = await host.startExtension(defineExtension({
      id: 'self-stop-signal',
      async setup(ctx) {
        ctx.kits.provide(contract, { methods: { read: () => 'ready' } })
        ctx.subscriptions.add({ dispose: remaining })
        const module = await ctx.modules.register({ id: 'module-one' })
        module.subscriptions.add({ dispose: async (options) => {
          entered.resolve()
          await resume.promise
          await ctx.self.stop({ signal: options?.signal })
          selfStopped = true
        } })
      },
    }), { manifest: manifest('self-stop-signal') })

    const stopping = host.stop(session.id)
    await entered.promise
    const stoppingAgain = host.stop(session.id)
    resume.resolve()

    expect(await stopping).toBe(session)
    expect(await stoppingAgain).toBe(session)
    expect(selfStopped).toBe(true)
    expect(remaining).toHaveBeenCalledTimes(1)
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ type: 'reentrant-call', call: 'dispose', key: pluginNodeKeys.session, owner: { kind: 'plugin', pluginId: 'self-stop-signal', sessionId: session.id } })
    expect(host.listSessions()).toEqual([])
    expect(host.getKitProvider(contract.id)).toBeUndefined()
  })

  it('resolves ctx.self.stop({ signal }) from a dynamic module cleanup at once', async () => {
    const { host, records } = hostOnManualClock()
    const contexts: ExtensionSetupContext[] = []
    let selfStopped = false
    const session = await host.startExtension(defineExtension({
      id: 'self-stop-dynamic',
      setup(ctx) {
        contexts.push(ctx)
      },
    }), { manifest: { ...manifest('self-stop-dynamic'), kits: undefined } })
    await contexts[0].modules.upsert('script', {
      kits: [],
      setup(module) {
        module.subscriptions.add({ dispose: async (options) => {
          await Promise.resolve()
          await contexts[0].self.stop({ signal: options?.signal })
          selfStopped = true
        } })
      },
    })

    expect(await host.stop(session.id)).toBe(session)
    expect(selfStopped).toBe(true)
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ type: 'reentrant-call', call: 'dispose', key: moduleNodeKey('script') })
    expect(host.listSessions()).toEqual([])
  })

  // Only the signal of the cleanup tells the Host where the call comes from. A call without it waits for its own cleanup.
  it('waits for ctx.self.stop() without the cleanup signal until the stop timeout', async () => {
    const { host, time, warnings, records } = hostOnManualClock()
    let selfStop: Promise<void> | undefined
    const session = await host.startExtension(defineExtension({
      id: 'self-stop-no-signal',
      setup(ctx) {
        ctx.subscriptions.add({ dispose: async () => {
          await Promise.resolve()
          selfStop = ctx.self.stop()
          await selfStop
        } })
      },
    }), { manifest: { ...manifest('self-stop-no-signal'), kits: undefined } })

    const stopping = host.stop(session.id)
    await vi.waitFor(() => expect(selfStop).toBeDefined())
    await drained(host.container)
    expect(records).toEqual([])

    time.advance(1_000)
    expect(await stopping).toBe(session)
    await selfStop
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ type: 'timeout', hook: 'stop', key: pluginNodeKeys.session })
    expect(warnings).toHaveLength(1)
  })

  it('aborts the signal of a plugin cleanup when the stop timeout passes', async () => {
    const { host, time } = hostOnManualClock()
    const signals: AbortSignal[] = []
    const session = await host.startExtension(defineExtension({
      id: 'cleanup-timeout',
      setup(ctx) {
        ctx.effect(() => async ({ signal }) => {
          if (signal)
            signals.push(signal)
          await new Promise(() => {})
        })
      },
    }), { manifest: { ...manifest('cleanup-timeout'), kits: undefined } })

    const stopping = host.stop(session.id)
    await vi.waitFor(() => expect(signals).toHaveLength(1))
    expect(signals[0].aborted).toBe(false)

    time.advance(1_000)
    expect(await stopping).toBe(session)
    await vi.waitFor(() => expect(signals[0].aborted).toBe(true))
    expect(signals[0].reason).toMatchObject({ name: 'HookTimeoutError', code: 'hook-timeout' })
  })

  // A Host service that uses a plugin Kit stops before the Kit withdraws. Here its cleanup stops that plugin with its signal.
  // The withdrawal of the Kit from that stop waits for the cleanup, so injeca resolves the withdraw at once with a `reentrant-call` record.
  it('resolves the Kit withdraw of a provider stop from the cleanup of a consumer of that Kit', async () => {
    const { host, time, records } = hostOnManualClock()
    const session = await host.startExtension(defineExtension({
      id: 'provider-reentrant',
      setup(ctx) {
        ctx.kits.provide(contract, { methods: { read: () => 'ready' } })
      },
    }), { manifest: manifest('provider-reentrant') })
    let innerStop: Promise<unknown> | undefined
    const consumer = provide(host.container, 'host:consumer', {
      dependsOn: { kit: kitProviderKey(contract.id, 'provider-reentrant') },
      build: ({ on }) => {
        on('stop', async ({ signal }) => {
          await Promise.resolve()
          innerStop = host.stop(session.id, { signal }).catch((error: unknown) => error)
          await innerStop
        })
        return {}
      },
    })
    await waitFor(host.container, 'host:consumer', { status: 'ready' })

    const withdrawing = consumer.withdraw()
    await vi.waitFor(() => expect(records).toHaveLength(1))
    expect(records[0]).toMatchObject({ type: 'reentrant-call', call: 'withdraw', key: 'host:consumer' })

    // TODO: The disposal of the plugin container after the withdraw still waits for this cleanup, because the cleanup is outside that container.
    // injeca finds a re-entrant dispose() only in the subtree of the container. Remove the clock step when injeca also follows the held instances.
    time.advance(1_000)
    expect(await withdrawing).toBe(true)
    expect(await innerStop).toMatchObject({ code: 'hook-timeout' })
    await vi.waitFor(() => expect(session.phase).toBe('stopped'))
  })

  it('stops its own session with ctx.self.stop() after setup', async () => {
    const host = new NodeExtensionHost()
    const selves: ExtensionSelf[] = []
    const remaining = vi.fn()
    const session = await host.startExtension(defineExtension({
      id: 'self-stop-running',
      setup(ctx) {
        selves.push(ctx.self)
        ctx.subscriptions.add({ dispose: remaining })
      },
    }), { manifest: { ...manifest('self-stop-running'), kits: undefined } })

    await selves[0].stop()
    expect(remaining).toHaveBeenCalledTimes(1)
    expect(session.phase).toBe('stopped')
    expect(host.listSessions()).toEqual([])
  })

  // https://github.com/moeru-ai/airi/pull/2687
  // ROOT CAUSE:
  //
  // A Host-wide flag cannot distinguish valid nested cleanup from self-wait.
  // This companion case requires exact session ancestry and permits independent later operations.
  it('keeps cleanup context isolated from unrelated sessions and later operations (PR #2687)', async () => {
    const host = new NodeExtensionHost()
    const remaining = vi.fn()
    const second = await host.startExtension(defineExtension({
      id: 'independent-cleanup',
      setup(ctx) {
        ctx.subscriptions.add({ dispose: remaining })
      },
    }), { manifest: { ...manifest('independent-cleanup'), kits: undefined } })
    const first = await host.startExtension(defineExtension({
      id: 'nested-cleanup',
      setup(ctx) {
        ctx.subscriptions.add({ dispose: async () => {
          await Promise.resolve()
          await host.stop(second.id)
        } })
      },
    }), { manifest: { ...manifest('nested-cleanup'), kits: undefined } })

    await expect(host.stop(first.id)).resolves.toBe(first)
    expect(remaining).toHaveBeenCalledTimes(1)
    expect(host.listSessions()).toEqual([])
    await expect(host.stop(first.id)).resolves.toBeUndefined()
  })

  it('preserves shared external cleanup for a Web Host', async () => {
    const host = new ExtensionHost({ runtime: 'web' })
    const entered = Promise.withResolvers<void>()
    const resume = Promise.withResolvers<void>()
    const remaining = vi.fn()
    const session = await host.startExtension(defineExtension({
      id: 'web-cleanup',
      setup(ctx) {
        ctx.subscriptions.add({ dispose: remaining })
        ctx.subscriptions.add({ dispose: async () => {
          entered.resolve()
          await resume.promise
        } })
      },
    }), { manifest: { ...manifest('web-cleanup'), kits: undefined, engines: { airi: '*', runtimes: ['web'] } } })

    const stopping = host.stop(session.id)
    await entered.promise
    const stoppingAgain = host.stop(session.id)
    expect(remaining).not.toHaveBeenCalled()
    resume.resolve()
    expect(await stopping).toBe(session)
    expect(await stoppingAgain).toBe(session)
    expect(remaining).toHaveBeenCalledTimes(1)
    expect(host.listSessions()).toEqual([])
  })

  // https://github.com/moeru-ai/airi/pull/2687
  // ROOT CAUSE:
  //
  // A module failure skipped later cleanup before the Host removed the session.
  // The watcher then remained active without an owning session to release it.
  // Composite disposal now attempts remaining modules and root subscriptions before reporting failure.
  it('cleans remaining modules and root watchers after a module fails (PR #2687)', async () => {
    const host = new ExtensionHost()
    const cleanupError = new Error('module cleanup failed')
    const order: string[] = []
    const observe = vi.fn()
    const kit = defineKit({ id: 'kit.cleanup-watch', version: '1.0.0', createClient: () => ({}) })
    const registration = host.provideKit({ api: kit })
    const session = await host.startExtension(defineExtension({
      id: 'provider-one',
      async setup(ctx) {
        ctx.kits.provide(contract, { methods: { read: () => 'ready' } })
        ctx.subscriptions.add({ dispose: () => {
          order.push('root')
        } })
        ctx.kits.watch(kit, observe)
        const first = await ctx.modules.register({ id: 'first' })
        first.subscriptions.add({ dispose: () => {
          order.push('first')
        } })
        const failing = await ctx.modules.register({ id: 'failing' })
        failing.subscriptions.add({ dispose: () => {
          order.push('failing-tail')
        } })
        failing.subscriptions.add({ dispose: () => {
          order.push('failing-error')
          throw cleanupError
        } })
      },
    }), { manifest: {
      ...manifest('provider-one'),
      permissions: { apis: [{ key: kit.id, actions: ['invoke'] }] },
    } })
    await vi.waitFor(() => expect(observe).toHaveBeenCalledTimes(1))

    await expect(host.stop(session.id)).rejects.toBe(cleanupError)
    expect(order).toEqual(['failing-error', 'failing-tail', 'first', 'root'])
    expect(session.modules.size).toBe(0)
    expect(host.listSessions()).toEqual([])
    expect(host.getKitProvider(contract.id)).toBeUndefined()
    await registration.withdraw()
    const replacement = host.provideKit({ api: kit })
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(observe).toHaveBeenCalledTimes(1)
    await replacement.withdraw()
  })

  // https://github.com/moeru-ai/airi/pull/2687
  // ROOT CAUSE:
  //
  // Fail-fast cleanup reported only the first module failure and never attempted root subscriptions.
  // Each cleanup group now retains its failures, and concurrent stops receive the same completed result.
  it('shares all module and root cleanup failures between concurrent stops (PR #2687)', async () => {
    const host = new ExtensionHost()
    const firstError = new Error('first module cleanup failed')
    const secondError = new Error('second module cleanup failed')
    const rootError = new Error('root cleanup failed')
    const entered = Promise.withResolvers<void>()
    const resume = Promise.withResolvers<void>()
    const remaining = vi.fn()
    const session = await host.startExtension(defineExtension({
      id: 'provider-one',
      async setup(ctx) {
        ctx.kits.provide(contract, { methods: { read: () => 'ready' } })
        ctx.subscriptions.add({ dispose: remaining })
        ctx.subscriptions.add({ dispose: () => {
          throw rootError
        } })
        const first = await ctx.modules.register({ id: 'first' })
        first.subscriptions.add({ dispose: () => {
          throw firstError
        } })
        const second = await ctx.modules.register({ id: 'second' })
        second.subscriptions.add({ dispose: async () => {
          entered.resolve()
          await resume.promise
          throw secondError
        } })
      },
    }), { manifest: manifest('provider-one') })

    const stopping = host.stop(session.id).catch((error: unknown) => error)
    const stoppingAgain = host.stop(session.id).catch((error: unknown) => error)
    await entered.promise
    expect(remaining).not.toHaveBeenCalled()
    resume.resolve()
    const failure = await stopping
    expect(failure).toBeInstanceOf(AggregateError)
    if (!(failure instanceof AggregateError)) {
      throw new Error('Expected all cleanup failures.')
    }
    expect(failure.errors).toEqual([secondError, firstError, rootError])
    expect(await stoppingAgain).toBe(failure)
    expect(remaining).toHaveBeenCalledTimes(1)
    expect(session.modules.size).toBe(0)
    expect(host.listSessions()).toEqual([])
  })

  // https://github.com/moeru-ai/airi/pull/2687
  // ROOT CAUSE:
  //
  // A rejected module subscription skipped removal of its module record.
  // Module cleanup now releases its record after all cleanup attempts, including failures.
  it('removes a manually disposed module after its cleanup fails without retrying it (PR #2687)', async () => {
    const host = new ExtensionHost()
    const cleanupError = new Error('module cleanup failed')
    const remaining = vi.fn()
    const failing = vi.fn(() => {
      throw cleanupError
    })
    let module: ExtensionModuleContext | undefined
    const session = await host.startExtension(defineExtension({
      id: 'provider-one',
      async setup(ctx) {
        ctx.kits.provide(contract, { methods: { read: () => 'ready' } })
        module = await ctx.modules.register({ id: 'module-one' })
        module.subscriptions.add({ dispose: remaining })
        module.subscriptions.add({ dispose: failing })
      },
    }), { manifest: manifest('provider-one') })

    await expect(module!.dispose()).rejects.toBe(cleanupError)
    expect(session.modules.size).toBe(0)
    await host.stop(session.id)
    expect(remaining).toHaveBeenCalledTimes(1)
    expect(failing).toHaveBeenCalledTimes(1)
  })

  it('keeps both setup and cleanup errors after withdrawing the Provider', async () => {
    const host = new ExtensionHost()
    const setupError = new Error('setup failed')
    const cleanupError = new Error('cleanup failed')
    const extension = defineExtension({
      id: 'provider-one',
      setup(ctx) {
        ctx.kits.provide(contract, { methods: { read: () => 'ready' } })
        ctx.subscriptions.add({
          dispose: () => {
            throw cleanupError
          },
        })
        throw setupError
      },
    })

    try {
      await host.startExtension(extension, { manifest: manifest(extension.id) })
      throw new Error('Expected setup to fail.')
    }
    catch (error) {
      if (!(error instanceof AggregateError)) {
        throw error
      }
      expect(error.errors).toEqual([setupError, cleanupError])
      expect(error.cause).toBe(setupError)
    }
    expect(host.getKitProvider(contract.id)).toBeUndefined()
  })

  it('lets a Host Kit and a plugin provide one Kit id, and selects by the provider order', async () => {
    // Each provider has its own key (`kit:<id>@host`, `kit:<id>@<plugin>`), so two providers do not conflict.
    const host = new ExtensionHost({ kitProviderOrder: { [contract.id]: ['provider-one', 'host'] } })
    host.provideKit({ descriptor: { kitId: contract.id, version: '1.0.0', runtimes: ['electron'], capabilities: [] } })
    expect(host.getKitProvider(contract.id)?.owner.kind).toBe('host')

    const session = await host.startExtension(defineExtension({
      id: 'provider-one',
      setup(ctx) {
        ctx.kits.provide(contract, { methods: { read: () => 'ready' } })
      },
    }), { manifest: manifest('provider-one') })
    expect(host.getKit(contract.id)?.version).toBe('1.0.0')
    expect(host.getKitProvider(contract.id)?.owner).toMatchObject({ kind: 'extension', sessionId: session.id })
    expect(host.listKitProviders().map(provider => provider.owner.kind)).toEqual(['host', 'extension'])

    await host.stop(session.id)
    expect(host.getKitProvider(contract.id)?.owner.kind).toBe('host')
  })

  it('keeps provide on root setup, not on a registered module', async () => {
    const host = new ExtensionHost()
    const extension = defineExtension({
      id: 'provider-one',
      async setup(ctx) {
        const module = await ctx.modules.register({ id: 'module-one' })
        expect('provide' in ctx.kits).toBe(true)
        expect('provide' in module.kits).toBe(false)
        ctx.kits.provide(contract, { methods: { read: () => 'ready' } })
      },
    })

    await host.startExtension(extension, { manifest: manifest(extension.id) })
    expect(host.getKitProvider(contract.id)?.owner.kind).toBe('extension')
  })

  it('reloads after a full stop, and a stale handle cannot withdraw the new provider', async () => {
    const host = new ExtensionHost()
    const fixture = await import('./testdata/test-hosted-kit-provider-entrypoint')
    const session = await host.start({
      ...manifest('reload-provider'),
      kits: { provides: [{ id: fixture.hostedKitContract.id, version: '1.0.0', exposure: 'local-only' }] },
      entrypoints: { electron: join(import.meta.dirname, 'testdata', 'test-hosted-kit-provider-entrypoint.ts') },
    })
    const oldHandle = fixture.providerHandleState.current
    const oldProvider = host.getKitProvider(fixture.hostedKitContract.id)

    const next = await host.reload(session.id)
    await oldHandle?.dispose()

    expect(next.id).not.toBe(session.id)
    expect(host.listSessions()).toEqual([next])
    const provider = host.getKitProvider(fixture.hostedKitContract.id)
    expect(provider).toMatchObject({ owner: { sessionId: next.id } })
    expect(provider?.instanceId).not.toBe(oldProvider?.instanceId)
  })

  it('reloads atomically: the new session runs before the old one stops', async () => {
    const host = new ExtensionHost()
    const order: string[] = []
    let round = 0
    const extension = defineExtension({
      id: 'atomic-provider',
      setup(ctx) {
        round += 1
        const current = round
        order.push(`setup ${current}`)
        ctx.kits.provide(contract, { methods: { read: () => `round ${current}` } })
        ctx.subscriptions.add({ dispose: () => {
          order.push(`cleanup ${current}`)
        } })
      },
    })
    const consumer = await host.startExtension(defineExtension({
      id: 'atomic-consumer',
      setup() {},
    }), { manifest: { ...manifest('atomic-consumer'), kits: { uses: [{ id: contract.id, version: '^1' }] } } })
    expect(consumer.phase).toBe('pending')

    const session = await host.startExtension(extension, { manifest: manifest(extension.id) })
    await vi.waitFor(() => expect(host.getSession(consumer.id)?.phase).toBe('ready'))
    const client = await host.resolveKit(contract)
    await expect(client.read()).resolves.toBe('round 1')

    // `startExtension` sessions keep their loaded Extension, so the atomic reload starts the same definition again.
    await host.reload(session.id, { atomic: true })
    expect(order).toEqual(['setup 1', 'setup 2', 'cleanup 1'])
    await expect(client.read()).resolves.toBe('round 2')
    expect(host.getSession(consumer.id)?.phase).toBe('ready')
  })
})

describe('host-provided Kit registration integrity', () => {
  it('keeps Host sources under the identity captured at registration', async () => {
    // ROOT CAUSE:
    //
    // The Provider Registry captured one ID, but the Host payload stores read
    // the caller's ID again. A changing getter split one registration in two.
    // The Host now captures one ID before it registers the service.
    const host = new ExtensionHost()
    let apiReads = 0
    const apiId = vi.fn(() => ++apiReads === 1 ? 'kit.api' : 'kit.api-drift')
    const api = Object.defineProperty({ id: 'kit.api', version: '1.0.0', createClient: () => ({}) }, 'id', {
      enumerable: true,
      get: apiId,
    })

    const apiRegistration = host.provideKit({ api })
    expect(apiId).toHaveBeenCalledTimes(1)
    expect(host.getKitProvider('kit.api')?.owner.kind).toBe('host')
    await expect(apiRegistration.withdraw()).resolves.toBe(true)
    expect(host.getKitProvider('kit.api')).toBeUndefined()

    let descriptorReads = 0
    const descriptorId = vi.fn(() => ++descriptorReads === 1 ? 'kit.descriptor' : 'kit.descriptor-drift')
    const descriptor = Object.defineProperty({ kitId: 'kit.descriptor', version: '1.0.0', runtimes: ['electron' as const], capabilities: [] }, 'kitId', {
      enumerable: true,
      get: descriptorId,
    })

    const descriptorRegistration = host.provideKit({ descriptor })
    expect(descriptorId).toHaveBeenCalledTimes(1)
    expect(host.getKit('kit.descriptor')?.kitId).toBe('kit.descriptor')
    await expect(descriptorRegistration.withdraw()).resolves.toBe(true)
    expect(host.getKitProvider('kit.descriptor')).toBeUndefined()
  })

  it('does not publish a Host source when payload capture fails', () => {
    // ROOT CAUSE:
    //
    // Host payload access failed after the Registry changed registration state.
    // The Host now captures the complete source before it registers the service.
    const host = new ExtensionHost()
    const failure = new Error('client factory is unavailable')
    const api = Object.defineProperty({ id: 'kit.failed', version: '1.0.0', createClient: () => ({}) }, 'createClient', {
      enumerable: true,
      get() {
        throw failure
      },
    })

    let registrationError: unknown
    try {
      host.provideKit({ api })
    }
    catch (error) {
      registrationError = error
    }
    expect(registrationError).toMatchObject({
      code: 'invalid-host-source',
      kitId: 'kit.failed',
    })
    expect(registrationError).not.toHaveProperty('cause')
    expect(host.getKitProvider('kit.failed')).toBeUndefined()
  })

  it('rejects invalid Host payloads before it registers a service', () => {
    const host = new ExtensionHost()
    expect(() => host.provideKit({ descriptor: { kitId: '   ', version: '1.0.0', runtimes: ['electron'], capabilities: [] } })).toThrow('invalid-host-source')
    expect(() => host.provideKit({ descriptor: { kitId: 'kit.invalid-version', version: 'latest', runtimes: ['electron'], capabilities: [] } })).toThrow('invalid-host-source')
    expect(() => host.provideKit({ descriptor: { kitId: 'kit.no-runtime', version: '1.0.0', runtimes: [], capabilities: [] } })).toThrow('invalid-host-source')
    expect(() => host.provideKit({ descriptor: {
      kitId: 'kit.duplicate-action',
      version: '1.0.0',
      runtimes: ['electron'],
      capabilities: [{ key: 'kit.duplicate-action.read', actions: ['invoke', 'invoke'] }],
    } })).toThrow('invalid-host-source')
    expect(() => Reflect.apply(host.provideKit, host, [{ api: {
      id: 'kit.invalid-policy',
      version: '1.0.0',
      allowedExposePolicies: ['unknown'],
      createClient: () => ({}),
    } }])).toThrow('invalid-host-source')
    expect(() => host.provideKit({})).toThrow('invalid-host-source')
    expect(host.listKitProviders()).toEqual([])
  })

  it('invokes a Host Kit factory without a receiver', async () => {
    // ROOT CAUSE:
    //
    // Binding the factory to its registration input preserved undeclared mutable state.
    // The Host now invokes a receiver-free factory with an undefined receiver.
    const host = new ExtensionHost()
    const kit = defineKit({
      id: 'kit.receiver',
      version: '1.0.0',
      createClient(this: void) {
        expect(this).toBeUndefined()
        return { value: 'accepted' }
      },
    })
    host.provideKit({ api: kit })
    let observed = ''
    const extension = defineExtension({
      id: 'host-kit-receiver-consumer',
      async setup(ctx) {
        observed = (await ctx.kits.use(kit)).value
      },
    })

    await host.startExtension(extension, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: extension.id,
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        permissions: { apis: [{ key: kit.id, actions: ['invoke'] }] },
        entrypoints: {},
      },
    })

    expect(observed).toBe('accepted')
  })

  it('registers a descriptor and an API of one Kit in one call', async () => {
    const host = new ExtensionHost()
    const descriptor = { kitId: 'kit.shared', version: '1.0.0', runtimes: ['electron' as const], capabilities: [] }
    const api = { id: descriptor.kitId, version: descriptor.version, createClient: () => ({}) }

    expect(() => host.provideKit({ descriptor, api: { ...api, version: '2.0.0' } })).toThrow('invalid-host-source')
    const registration = host.provideKit({ descriptor, api })
    expect(() => host.provideKit({ api })).toThrow('provider-slot-conflict')
    expect(host.getKit(descriptor.kitId)?.version).toBe('1.0.0')

    await registration.withdraw()
    expect(host.getKit(descriptor.kitId)).toBeUndefined()
    expect(host.getKitProvider(descriptor.kitId)).toBeUndefined()
  })

  it('replaces a Host Kit API without a gap, so running clients move', async () => {
    const host = new ExtensionHost()
    const first = { id: 'kit.replacement', version: '1.0.0', createClient: () => ({ value: 'first' }) }
    const registration = host.provideKit({ api: first })
    const client = await host.resolveKit(first)
    expect(client.value).toBe('first')

    await expect(registration.replace({ api: { ...first, createClient: () => ({ value: 'second' }) } })).resolves.toBe(true)
    expect(client.value).toBe('second')
    await expect(registration.replace({ api: { ...first, version: '2.0.0' } })).rejects.toThrow('kit-version-mismatch')
  })

  it('keeps accepted Host payloads stable after caller mutation', async () => {
    // ROOT CAUSE:
    //
    // The old registration stored caller-owned arrays and factory fields.
    // Caller mutations then changed the current registration without a new instance.
    // The Host now stores immutable copies of accepted Host payloads.
    const host = new ExtensionHost()
    const descriptor = {
      kitId: 'kit.mutable',
      version: '1.0.0',
      runtimes: ['electron' as const],
      capabilities: [{ key: 'kit.mutable.capability', actions: ['read'] }],
    }
    const api = {
      id: descriptor.kitId,
      version: descriptor.version,
      createClient: () => ({ value: 'original' }),
    }
    host.provideKit({ descriptor, api })

    descriptor.version = '2.0.0'
    descriptor.capabilities[0].actions.push('changed')
    api.version = '2.0.0'
    api.createClient = () => ({ value: 'changed' })

    expect(host.getKitProvider('kit.mutable')?.version).toBe('1.0.0')
    expect(host.getKit('kit.mutable')).toMatchObject({
      version: '1.0.0',
      capabilities: [{ actions: ['read'] }],
    })

    let observed = ''
    const extension = defineExtension({
      id: 'host-kit-consumer',
      async setup(ctx) {
        observed = (await ctx.kits.tryUse({ ...api, version: '1.0.0' }).then(result => result.ok ? result.client.value : 'missing'))
      },
    })
    await host.startExtension(extension, {
      manifest: {
        manifestVersion: 2,
        kind: 'manifest.extension.airi.moeru.ai',
        id: extension.id,
        version: '1.0.0',
        engines: { airi: '*', runtimes: ['electron'] },
        permissions: { apis: [{ key: 'kit.mutable', actions: ['invoke'] }] },
        entrypoints: {},
      },
    })
    expect(observed).toBe('original')
  })

  it('returns mutable copies from the Host Kit query interface', () => {
    // ROOT CAUSE:
    //
    // The Host owns frozen descriptor snapshots. It exposed
    // those internal snapshots through methods that previously returned copies.
    // The Host now returns deep mutable copies from its query methods.
    const host = new ExtensionHost()
    host.provideKit({ descriptor: {
      kitId: 'kit.query-copy',
      version: '1.0.0',
      runtimes: ['electron'],
      capabilities: [{ key: 'kit.query-copy.read', actions: ['invoke'] }],
    } })

    const descriptor = host.getKit('kit.query-copy')!
    descriptor.runtimes.push('web')
    descriptor.capabilities[0]!.actions.push('changed')
    const listed = host.listKits()
    listed[0]!.capabilities[0]!.actions.push('listed-change')
    const capabilities = host.getKitCapabilities('kit.query-copy')
    capabilities[0]!.actions.push('capability-change')

    expect(host.getKit('kit.query-copy')).toEqual({
      kitId: 'kit.query-copy',
      version: '1.0.0',
      runtimes: ['electron'],
      capabilities: [{ key: 'kit.query-copy.read', actions: ['invoke'] }],
    })
  })
})

describe('for ExtensionHost', () => {
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
    host.provideKit({
      descriptor: {
        kitId: 'kit.cleanup-failure',
        version: '1.0.0',
        runtimes: ['electron'],
        capabilities: [],
      },
      api: kit,
    })
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
    host.provideKit({
      descriptor: {
        kitId: 'kit.module-dispose',
        version: '1.0.0',
        runtimes: ['electron'],
        capabilities: [],
      },
      api: kit,
    })
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
    host.provideKit({ api: kit })

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
    host.provideKit({ api: kit })

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
    host.provideKit({ api: kit })

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
    host.provideKit({ api: kit })

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
    host.provideKit({ api: kit })

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
    host.provideKit({ api: kit })

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
    await vi.waitFor(() => expect(observed).toEqual([false]))

    const firstRegistration = host.provideKit({ api: kit })
    await vi.waitFor(() => expect(observed).toEqual([false, true]))

    await expect(firstRegistration.withdraw()).resolves.toBe(true)
    await vi.waitFor(() => expect(observed).toEqual([false, true, false]))

    const secondRegistration = host.provideKit({ api: kit })
    await vi.waitFor(() => expect(observed).toEqual([false, true, false, true]))

    // A stale registration cannot withdraw a newer one.
    await expect(firstRegistration.withdraw()).resolves.toBe(false)
    expect(observed).toEqual([false, true, false, true])

    await expect(secondRegistration.withdraw()).resolves.toBe(true)
    await vi.waitFor(() => expect(observed).toEqual([false, true, false, true, false]))
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
    await vi.waitFor(() => expect(observed).toEqual([false]))

    await host.stop(session.id)
    host.provideKit({ api: kit })
    await new Promise(resolve => setTimeout(resolve, 20))

    expect(observed).toEqual([false])
  })

  it('supports required, optional, and watched kit availability', async () => {
    const host = new ExtensionHost()
    const kit = defineKit({
      id: 'kit.test',
      version: '1.0.0',
      createClient: () => ({ ping: () => 'pong' }),
    })
    host.provideKit({ api: kit })

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

    await vi.waitFor(() => expect(watched).toBe(true))
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
    await vi.waitFor(() => expect(observed).toEqual([false]))
    await disposeModule()
    host.provideKit({ api: kit })
    await new Promise(resolve => setTimeout(resolve, 20))

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
    host.provideKit({ api: kit })

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

  it('resolves the runtime entrypoint before the default entrypoint', () => {
    const host = new FileSystemLoader()
    const extensionRoot = join(import.meta.dirname, 'testdata', 'extension')
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
      cwd: extensionRoot,
      runtime: 'node',
    })).toBe(join(extensionRoot, 'node-entry.ts'))

    expect(host.resolveEntrypointFor(defaultFallbackManifest, {
      cwd: extensionRoot,
      runtime: 'node',
    })).toBe(join(extensionRoot, 'default-entry.ts'))
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
    host.provideKit({ api: testWidgetKit })

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

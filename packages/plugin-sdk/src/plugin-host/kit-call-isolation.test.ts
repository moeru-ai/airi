import type { Extension, ExtensionSetupContext } from '../extension'
import type { HostPort } from './bridge/ports'
import type { PluginRunner } from './runners/types'
import type { ExtensionManifestV2 } from './shared/types'

import { describe, expect, it } from 'vitest'

import { defineExtension } from '../extension'
import { defineKit } from '../kit'
import { PluginRuntime } from './bridge/plugin-runtime'
import { ExtensionHost } from './core'

const pingKit = defineKit({ id: 'kit.ping', version: '1.0.0', createClient: () => ({ ping: () => 'pong', nested: { read: () => 'nested' } }) })

function manifest(id: string, extra: Partial<ExtensionManifestV2> = {}): ExtensionManifestV2 {
  return {
    manifestVersion: 2,
    kind: 'manifest.extension.airi.moeru.ai',
    id,
    version: '1.0.0',
    engines: { airi: '*', runtimes: ['electron'] },
    permissions: {},
    entrypoints: { electron: './extension.mjs' },
    ...extra,
  }
}

/**
 * A runner that runs the plugin like a worker: the plugin gets no client values, only the Host port.
 * The test keeps the Host port, so it can send calls that the plugin runtime never sends, as a hostile worker can.
 */
function createPortRunner(extension: Extension) {
  const ports: HostPort[] = []
  const runner: PluginRunner = {
    kind: 'port',
    async open(input) {
      ports.push(input.host)
      return {
        endpoint: new PluginRuntime(async () => extension, input.host),
        passesValues: false,
        onExit: () => () => {},
        close: async () => {},
      }
    },
  }
  return { runner, ports }
}

/** Starts a plugin in a port runner and returns the Host port with the id of its running round. */
async function startHostile(host: ExtensionHost, extensionManifest: ExtensionManifestV2, setup: (ctx: ExtensionSetupContext) => void | Promise<void> = () => {}) {
  const extension = defineExtension({
    id: extensionManifest.id,
    async setup(ctx) {
      await setup(ctx)
    },
  })
  const { runner, ports } = createPortRunner(extension)
  const session = await host.start(extensionManifest, { runner })
  const port = ports[0]!
  // The round id is the instance id of the `session` service of the plugin container.
  const round = host.inspect().services.find(service => service.key === 'session' && service.owner.sessionId === session.id)?.instanceId
  if (round === undefined)
    throw new Error('The session has no running round.')
  return { session, port, round }
}

const usesPing = { kits: { uses: [{ id: pingKit.id, version: '^1.0.0' }] } }

describe('kit calls from a worker', () => {
  it('denies a Kit call that walks into the prototype of the client', async () => {
    // ROOT CAUSE:
    //
    // `callKit` read each segment of a dotted method with `Reflect.get`.
    // So `constructor.constructor` reached the Host `Function`, and `__proto__` reached `Object.prototype`.
    //
    // We fixed this with `kitMemberOf`. It reads prototype members as missing.
    const host = new ExtensionHost()
    host.provideKit({ api: pingKit })
    const { port, round } = await startHostile(host, manifest('hostile-prototype', usesPing))

    await expect(port.callKit({ round, kitId: pingKit.id, method: 'ping', args: [] })).resolves.toBe('pong')
    await expect(port.callKit({ round, kitId: pingKit.id, method: 'nested.read', args: [] })).resolves.toBe('nested')
    await expect(port.callKit({ round, kitId: pingKit.id, method: 'constructor.constructor', args: ['return 1'] })).rejects.toThrow('The Kit has no method `constructor.constructor`.')
    await expect(port.callKit({ round, kitId: pingKit.id, method: '__proto__.__defineGetter__', args: ['polluted', () => true] })).rejects.toThrow('The Kit has no method')
    await expect(port.callKit({ round, kitId: pingKit.id, method: '__defineGetter__', args: ['polluted', () => true] })).rejects.toThrow('The Kit has no method')
    await expect(port.callKit({ round, kitId: pingKit.id, method: 'ping.call', args: [] })).rejects.toThrow('The Kit has no method')
    expect(Reflect.get({}, 'polluted')).toBeUndefined()
  })

  it('binds each port call to the session of its runner, also with the round and scope ids of another session', async () => {
    const host = new ExtensionHost()
    host.provideKit({ api: pingKit })
    const owner = await startHostile(host, manifest('identity-owner', usesPing), async (ctx) => {
      await ctx.modules.register({ id: 'shared-name' })
    })
    const intruder = await startHostile(host, manifest('identity-intruder'))

    await expect(intruder.port.callKit({ round: owner.round, kitId: pingKit.id, method: 'ping', args: [] })).rejects.toMatchObject({ reason: 'not-ready', detail: 'The Kit is not-running.' })
    await expect(intruder.port.useKit({ round: owner.round, kitId: pingKit.id, range: '^1.0.0' })).rejects.toThrow('The round is not active.')
    await intruder.port.disposeScope({ round: owner.round, scope: 'shared-name' })
    expect(owner.session.modules.has('shared-name')).toBe(true)

    await intruder.port.stopSession({})
    expect(host.getSession(intruder.session.id)).toBeUndefined()
    expect(host.getSession(owner.session.id)?.phase).toBe('ready')
  })
})

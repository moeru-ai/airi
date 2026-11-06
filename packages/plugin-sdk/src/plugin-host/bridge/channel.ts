import type { EventContext } from '@moeru/eventa'

import type { WireError } from './errors'
import type { HostPort, PluginEndpoint } from './ports'

import { defineInvoke, defineInvokeEventa, defineInvokeHandler } from '@moeru/eventa'

import { decodeError, encodeError } from './errors'

// NOTICE:
// This is the first version of the plugin worker bridge over one eventa channel.
// The protocol belongs in `@injeca/bridge`, which does not exist yet. It has no handshake, heartbeat, or reconnect.
// Source: docs/ai/adr/2026-11-05-plugin-system-layers.md.
// Remove this file when plugin-sdk uses a published `@injeca/bridge`.

/** The tag of a function that crossed the bridge. The other side calls it with `callback.invoke`. */
const functionTag = '$airi.bridge.fn'

/** The reply of each bridge invoke. Errors cross as data, so that their class and fields survive. */
type BridgeReply
  = | { readonly ok: true, readonly value: unknown }
    | { readonly ok: false, readonly error: WireError }

/** One method call on a port. */
interface BridgeCall {
  readonly args: readonly unknown[]
}

/** The methods of the Host port that the plugin side calls. */
export const hostPortMethods = [
  'provide',
  'withdrawProvide',
  'setStatus',
  'callKit',
  'useKit',
  'tryUseKit',
  'watchKit',
  'rebuild',
  'upsertModule',
  'registerScope',
  'disposeScope',
  'stopSession',
] as const satisfies readonly (keyof HostPort)[]

/** The methods of the plugin endpoint that the Host calls. */
export const pluginEndpointMethods = [
  'load',
  'startRound',
  'abortRound',
  'stopRound',
  'updateKits',
  'updateCatalog',
  'startModule',
  'stopModule',
  'dropModule',
  'abortCleanup',
  'invokeProvider',
] as const satisfies readonly (keyof PluginEndpoint)[]

/**
 * The eventa definitions of the bridge. Each port method is one invoke.
 *
 * - Host to plugin: setup start and abort (`startRound`, `abortRound`), round cleanup, Kit snapshots, dynamic modules, and Kit method calls with the caller identity (`invokeProvider`).
 * - Plugin to Host: provide announce (`provide`), status reports (`setStatus`), Kit calls (`callKit`), rebuild and upsert requests.
 * - Both ways: `callback.invoke` and `callback.release` for functions that crossed the bridge, for example harness hook listeners.
 */
export const bridgeEvents = {
  host: Object.fromEntries(hostPortMethods.map(method => [method, defineInvokeEventa<BridgeReply, BridgeCall>(`airi:plugin-bridge:host:${method}`)])) as Record<typeof hostPortMethods[number], ReturnType<typeof defineInvokeEventa<BridgeReply, BridgeCall>>>,
  plugin: Object.fromEntries(pluginEndpointMethods.map(method => [method, defineInvokeEventa<BridgeReply, BridgeCall>(`airi:plugin-bridge:plugin:${method}`)])) as Record<typeof pluginEndpointMethods[number], ReturnType<typeof defineInvokeEventa<BridgeReply, BridgeCall>>>,
  callbackInvoke: {
    host: defineInvokeEventa<BridgeReply, { id: string, args: readonly unknown[] }>('airi:plugin-bridge:host:callback.invoke'),
    plugin: defineInvokeEventa<BridgeReply, { id: string, args: readonly unknown[] }>('airi:plugin-bridge:plugin:callback.invoke'),
  },
  callbackRelease: {
    host: defineInvokeEventa<BridgeReply, { ids: readonly string[] }>('airi:plugin-bridge:host:callback.release'),
    plugin: defineInvokeEventa<BridgeReply, { ids: readonly string[] }>('airi:plugin-bridge:plugin:callback.release'),
  },
}

type AnyFunction = (...args: never[]) => unknown

function isPlainRecord(value: object): boolean {
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * One side of the bridge: the functions that it sent, and the functions of the other side that it holds.
 */
class BridgeSide {
  private readonly local = new Map<string, AnyFunction>()
  private nextId = 0
  private readonly released = new FinalizationRegistry<string>((id) => {
    void this.releaseRemote([id]).catch(() => undefined)
  })

  constructor(
    private readonly name: 'host' | 'plugin',
    private readonly invokeRemote: (id: string, args: readonly unknown[]) => Promise<BridgeReply>,
    private readonly releaseRemote: (ids: readonly string[]) => Promise<BridgeReply>,
  ) {}

  /** Replaces each function in plain objects and arrays with a tag. Other values cross as structured clone values. */
  encode(value: unknown): unknown {
    if (typeof value === 'function') {
      const id = `${this.name}-${++this.nextId}`
      this.local.set(id, value as AnyFunction)
      return { [functionTag]: id }
    }
    if (Array.isArray(value))
      return value.map(item => this.encode(item))
    if (value !== null && typeof value === 'object' && isPlainRecord(value))
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, this.encode(item)]))
    return value
  }

  /** Replaces each function tag with a function that calls the other side. */
  decode(value: unknown): unknown {
    if (Array.isArray(value))
      return value.map(item => this.decode(item))
    if (value !== null && typeof value === 'object' && isPlainRecord(value)) {
      const id = (value as Record<string, unknown>)[functionTag]
      if (typeof id === 'string') {
        const remote = async (...args: unknown[]) => this.unwrap(await this.invokeRemote(id, args.map(arg => this.encode(arg))))
        this.released.register(remote, id)
        return remote
      }
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, this.decode(item)]))
    }
    return value
  }

  unwrap(reply: BridgeReply): unknown {
    if (!reply.ok)
      throw decodeError(reply.error)
    return this.decode(reply.value)
  }

  async reply(run: () => unknown): Promise<BridgeReply> {
    try {
      return { ok: true, value: this.encode(await run()) }
    }
    catch (error) {
      return { ok: false, error: encodeError(error) }
    }
  }

  callLocal(id: string, args: readonly unknown[]): Promise<BridgeReply> {
    return this.reply(() => {
      const fn = this.local.get(id)
      if (!fn)
        throw new Error(`The bridge function ${id} was released.`)
      return Reflect.apply(fn, undefined, args.map(arg => this.decode(arg)))
    })
  }

  release(ids: readonly string[]): void {
    for (const id of ids)
      this.local.delete(id)
  }
}

/** An eventa context of a worker channel. The worker adapters give `raw` emit options. */
type EventaContext<CtxExt, EOpts extends { raw?: unknown }> = EventContext<CtxExt, EOpts>

/** The context type that the bridge uses inside. Its invokes take no request options. */
type BridgeContext = EventContext<Record<never, never>, { raw?: unknown }>

function bridgeContextOf<CtxExt, EOpts extends { raw?: unknown }>(context: EventaContext<CtxExt, EOpts>): BridgeContext {
  // The bridge sends no adapter-specific request options, for example transfer lists, so the adapter extensions do not matter here.
  return context as unknown as BridgeContext
}

function serveCallbacks(context: BridgeContext, side: BridgeSide, name: 'host' | 'plugin'): void {
  defineInvokeHandler(context, bridgeEvents.callbackInvoke[name], input => side.callLocal(input.id, input.args))
  defineInvokeHandler(context, bridgeEvents.callbackRelease[name], (input) => {
    side.release(input.ids)
    return { ok: true as const, value: undefined }
  })
}

function createSide(context: BridgeContext, name: 'host' | 'plugin'): BridgeSide {
  const other = name === 'host' ? 'plugin' : 'host'
  const invokeCallback = defineInvoke(context, bridgeEvents.callbackInvoke[other])
  const releaseCallbacks = defineInvoke(context, bridgeEvents.callbackRelease[other])
  const side = new BridgeSide(name, (id, args) => invokeCallback({ id, args }), ids => releaseCallbacks({ ids }))
  serveCallbacks(context, side, name)
  return side
}

/**
 * Connects the Host side of one plugin session to a bridge channel.
 * It serves the Host port for the plugin side and returns the plugin endpoint.
 *
 * @param channel The eventa context of the worker channel, on the Host side.
 * @param host The Host port of the session.
 */
export function connectHostBridge<CtxExt, EOpts extends { raw?: unknown }>(channel: EventaContext<CtxExt, EOpts>, host: HostPort): PluginEndpoint {
  const context = bridgeContextOf(channel)
  const side = createSide(context, 'host')
  for (const method of hostPortMethods) {
    defineInvokeHandler(context, bridgeEvents.host[method], call => side.reply(() => {
      const args = call.args.map(arg => side.decode(arg))
      return Reflect.apply(host[method] as AnyFunction, host, args)
    }))
  }
  const calls = Object.fromEntries(pluginEndpointMethods.map((method) => {
    const invoke = defineInvoke(context, bridgeEvents.plugin[method])
    return [method, async (...args: unknown[]) => side.unwrap(await invoke({ args: args.map(arg => side.encode(arg)) }))]
  }))
  return calls as unknown as PluginEndpoint
}

/**
 * Connects the plugin side of one session to a bridge channel.
 * It returns the Host port for the plugin runtime and serves the plugin endpoint that `createEndpoint` returns.
 *
 * @param channel The eventa context of the worker channel, on the plugin side.
 * @param createEndpoint Creates the plugin runtime with the Host port.
 */
export function connectPluginBridge<CtxExt, EOpts extends { raw?: unknown }>(channel: EventaContext<CtxExt, EOpts>, createEndpoint: (host: HostPort) => PluginEndpoint): PluginEndpoint {
  const context = bridgeContextOf(channel)
  const side = createSide(context, 'plugin')
  const host = Object.fromEntries(hostPortMethods.map((method) => {
    const invoke = defineInvoke(context, bridgeEvents.host[method])
    return [method, async (...args: unknown[]) => side.unwrap(await invoke({ args: args.map(arg => side.encode(arg)) }))]
  })) as unknown as HostPort
  const endpoint = createEndpoint(host)
  for (const method of pluginEndpointMethods) {
    defineInvokeHandler(context, bridgeEvents.plugin[method], call => side.reply(() => {
      const args = call.args.map(arg => side.decode(arg))
      return Reflect.apply(endpoint[method] as AnyFunction, endpoint, args)
    }))
  }
  return endpoint
}

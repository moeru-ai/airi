import type { PiniaPlugin, PiniaPluginContext, StateTree } from 'pinia'

import { name } from '../package.json'

interface BroadcastMessage {
  type: 'state'
  storeId: string
  state: unknown
  sourceId: string
  stamp: number
}

export interface BroadcastTransport {
  broadcast: (message: BroadcastMessage) => void
  subscribe: (listener: (message: BroadcastMessage) => void) => () => void
  close?: () => void
}

export interface BroadcastPluginOptions {
  /**
   * Disable the plugin.
   */
  disabled?: boolean
  /**
   * Name for BroadcastChannel/SharedWorker.
   */
  channel?: string
  /**
   * Custom transport implementation. Overrides channel/preferSharedWorker.
   */
  transport?: BroadcastTransport
  /**
   * Prefer SharedWorker transport even when BroadcastChannel exists.
   */
  preferSharedWorker?: boolean
  /**
   * Custom name for the SharedWorker instance (defaults to channel).
   */
  sharedWorkerName?: string
  /**
   * Decide if a store should be synchronized.
   */
  includeStore?: (context: PiniaPluginContext) => boolean
  /**
   * Convert outgoing state.
   */
  serialize?: (state: StateTree) => unknown
  /**
   * Convert incoming state before applying.
   */
  deserialize?: (state: unknown) => StateTree
  /**
   * Broadcast the initial state when the store is created. Default: true.
   */
  syncInitialState?: boolean
  /**
   * Custom instance id for debugging or tests.
   */
  instanceId?: string
}

export function createBroadcastPlugin(options: BroadcastPluginOptions = {}): PiniaPlugin {
  const channel = options.channel ?? 'airi-pinia-broadcast'
  const includeStore = options.includeStore ?? (() => true)
  const serialize = options.serialize ?? cloneState
  const deserialize = options.deserialize ?? (value => value as StateTree)
  const syncInitialState = options.syncInitialState !== false
  const instanceId = options.instanceId ?? createInstanceId()
  const transport = resolveTransport(options, channel)

  return (context) => {
    if (options.disabled)
      return

    if (!includeStore(context))
      return

    const storeId = context.store.$id
    let applyingExternal = false

    const stopTransport = transport.subscribe((message) => {
      if (!message || message.type !== 'state')
        return
      if (message.storeId !== storeId || message.sourceId === instanceId)
        return

      applyingExternal = true
      try {
        context.store.$patch(() => Object.assign(context.store.$state, deserialize(message.state)))
      }
      finally {
        applyingExternal = false
      }
    })

    const unsubscribe = context.store.$subscribe((_mutation, state) => {
      if (applyingExternal)
        return

      transport.broadcast({
        type: 'state',
        storeId,
        state: serialize(state),
        sourceId: instanceId,
        stamp: Date.now(),
      })
    }, { detached: true })

    if (syncInitialState) {
      transport.broadcast({
        type: 'state',
        storeId,
        state: serialize(context.store.$state),
        sourceId: instanceId,
        stamp: Date.now(),
      })
    }

    const originalDispose = context.store.$dispose.bind(context.store)
    context.store.$dispose = () => {
      unsubscribe()
      stopTransport()
      originalDispose()
    }
  }
}

export function createBroadcastChannelTransport(channel: string): BroadcastTransport {
  if (typeof BroadcastChannel === 'undefined')
    return createSilentTransport()

  const listeners = new Set<(message: BroadcastMessage) => void>()
  const bc = new BroadcastChannel(channel)
  const handleMessage = (event: MessageEvent<BroadcastMessage>) => {
    if (!event?.data)
      return

    listeners.forEach(listener => listener(event.data))
  }

  bc.addEventListener('message', handleMessage)

  return {
    broadcast(message) {
      bc.postMessage(message)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    close() {
      listeners.clear()
      bc.removeEventListener('message', handleMessage)
      bc.close()
    },
  }
}

export function createSharedWorkerTransport(name: string): BroadcastTransport {
  if (typeof SharedWorker === 'undefined' || typeof URL === 'undefined')
    return createSilentTransport()

  let workerUrl: URL
  try {
    workerUrl = new URL('./relay.worker.mjs', import.meta.url)
  }
  catch {
    return createSilentTransport()
  }

  let worker: SharedWorker
  try {
    worker = new SharedWorker(workerUrl, { name })
  }
  catch {
    return createSilentTransport()
  }

  const port = worker.port

  const listeners = new Set<(message: BroadcastMessage) => void>()
  const handleMessage = (event: MessageEvent<BroadcastMessage>) => {
    if (!event?.data)
      return

    listeners.forEach(listener => listener(event.data))
  }

  port.addEventListener('message', handleMessage)
  port.start()

  return {
    broadcast(message) {
      port.postMessage(message)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    close() {
      listeners.clear()
      port.removeEventListener('message', handleMessage)
      port.close()
    },
  }
}

function resolveTransport(options: BroadcastPluginOptions, channel: string): BroadcastTransport {
  if (options.transport)
    return options.transport

  if (options.preferSharedWorker && typeof SharedWorker !== 'undefined')
    return createSharedWorkerTransport(options.sharedWorkerName ?? channel)

  if (typeof BroadcastChannel !== 'undefined')
    return createBroadcastChannelTransport(channel)

  if (typeof SharedWorker !== 'undefined')
    return createSharedWorkerTransport(options.sharedWorkerName ?? channel)

  return createSilentTransport()
}

function cloneState(state: StateTree) {
  try {
    return structuredClone(state)
  }
  catch {
    return JSON.parse(JSON.stringify(state))
  }
}

function createSilentTransport(): BroadcastTransport {
  const warn = once(() => {
    console.warn?.(`[${name}] No BroadcastChannel/SharedWorker available; sync is disabled.`)
  })

  return {
    broadcast: () => warn(),
    subscribe: () => {
      warn()
      return () => {}
    },
    close: () => {},
  }
}

function once(fn: () => void) {
  let called = false
  return () => {
    if (called)
      return
    called = true
    fn()
  }
}

function createInstanceId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID()

  return `broadcast-${Math.random().toString(16).slice(2)}`
}

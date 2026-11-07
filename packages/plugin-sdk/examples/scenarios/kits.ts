import { createKitHandle, defineKitContract, defineKitMethod } from '../../src/kit'

/**
 * The Kit contracts and references of the scenarios.
 *
 * A plugin that provides a Kit publishes its contract in a package, for example `@plugin-b/kits`. This file plays that role.
 */

/** A file store that `plugin-b` provides. */
export const fsStoreKit = defineKitContract({
  id: 'airi.fs-store',
  version: '1.0.0',
  methods: {
    write: defineKitMethod<{ key: string, value: string }, { by: string, thread: number }>(),
    read: defineKitMethod<{ key: string }, { value: string | null, thread: number }>(),
    whoami: defineKitMethod<undefined, { caller: string, thread: number, instance: string }>(),
  },
  events: {},
})

/** An automatic memory that `plugin-b` provides. It stores through `airi.memory-backend`. */
export const autoMemoryKit = defineKitContract({
  id: 'airi.auto-memory',
  version: '1.0.0',
  methods: {
    remember: defineKitMethod<{ text: string }, { backend: string, by: string }>(),
    recall: defineKitMethod<undefined, { items: string[] }>(),
  },
  events: {},
})

/** A memory backend. The Host has one, and the `bmb` plugin provides a better one. */
export const memoryBackendKit = defineKitContract({
  id: 'airi.memory-backend',
  version: '1.0.0',
  methods: {
    store: defineKitMethod<{ text: string }, { backend: string }>(),
    list: defineKitMethod<undefined, { backend: string, items: string[] }>(),
  },
  events: {},
})

/** The memory backend contract of `bmb`. It has a newer minor version. */
export const betterMemoryBackendKit = defineKitContract({
  id: 'airi.memory-backend',
  version: '1.1.0',
  methods: {
    store: defineKitMethod<{ text: string }, { backend: string }>(),
    list: defineKitMethod<undefined, { backend: string, items: string[] }>(),
  },
  events: {},
})

/** The client of the built-in widget Kit stand-in. */
export interface WidgetClient {
  show: (input: { title: string }) => Promise<{ id: string, owner: string }>
}

/** The client of the built-in computer-use Kit stand-in. */
export interface ComputerUseClient {
  click: (input: { x: number, y: number }) => Promise<{ ok: boolean, caller: string }>
}

/** The built-in widget Kit stand-in. */
export const widgetKit = createKitHandle<WidgetClient>('airi.widget', '1.0.0')

/** The built-in computer-use Kit stand-in. */
export const computerUseKit = createKitHandle<ComputerUseClient>('airi.computer-use', '1.0.0')

/** A probe that `plugin-a` provides, so that the Host can ask it to call its Kits. */
export const pluginAProbeKit = defineKitContract({
  id: 'plugin-a.probe',
  version: '1.0.0',
  methods: {
    ping: defineKitMethod<{ text: string }, { write: { by: string, thread: number }, remember: { backend: string, by: string }, whoami: { caller: string, thread: number, instance: string } }>(),
  },
  events: {},
})

/** A probe that the rebuild plugins provide. */
export const rebuildProbeKit = defineKitContract({
  id: 'plugin-rebuild.probe',
  version: '1.0.0',
  methods: {
    stats: defineKitMethod<undefined, { setups: number, activeEffects: number, round: number, hasFsStore: boolean, hasAutoMemory: boolean }>(),
    addDependency: defineKitMethod<undefined, { phase: string }>(),
  },
  events: {},
})

/** A probe that `plugin-discover` provides. */
export const discoverProbeKit = defineKitContract({
  id: 'plugin-discover.probe',
  version: '1.0.0',
  methods: {
    stats: defineKitMethod<undefined, { setups: number, completed: number }>(),
  },
  events: {},
})

/** The control Kit of `plugin-shell`. The Host plays the agent that sends scripts. */
export const shellControlKit = defineKitContract({
  id: 'plugin-shell.control',
  version: '1.0.0',
  methods: {
    run: defineKitMethod<{ id: string, script: string, kits: string[], timeoutMs?: number }, { ok: boolean, error?: string, code?: string }>(),
    log: defineKitMethod<undefined, { events: string[] }>(),
  },
  events: {},
})

/** The control Kit of `bmb`, so that a scenario can end its worker. */
export const bmbControlKit = defineKitContract({
  id: 'bmb.control',
  version: '1.0.0',
  methods: {
    crash: defineKitMethod<undefined, { ok: boolean }>(),
  },
  events: {},
})

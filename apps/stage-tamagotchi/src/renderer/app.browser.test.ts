import type { ClientConnector } from '@proj-airi/server-sdk'
import type { KokoroAdapter } from '@proj-airi/stage-ui/libs/inference/adapters/kokoro'
import type { BrowserWindow, IpcMain, IpcMainEvent, IpcRendererEvent, WebContents } from 'electron'

import type { PluginCapabilityPayload } from '../shared/eventa/plugin/capabilities'

import localforage from 'localforage'

import { defineInvoke, defineInvokeHandler } from '@moeru/eventa'
import { createContext as createMainContext } from '@moeru/eventa/adapters/electron/main'
import { PiniaColada } from '@pinia/colada'
import { electron } from '@proj-airi/electron-eventa'
import { getElectronEventaContext, resetElectronEventaContextForTesting } from '@proj-airi/electron-vueuse'
import { parseEvent, stringifyEvent } from '@proj-airi/server-sdk'
import { artistrySyncConfig } from '@proj-airi/stage-shared'
import { setupSynced, usePiniaSynced } from '@proj-airi/stage-ui/libs/pinia'
import { useCharacterOrchestratorStore } from '@proj-airi/stage-ui/stores/character'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useModsServerChannelStore } from '@proj-airi/stage-ui/stores/mods/api/channel-server'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useVisionStore } from '@proj-airi/stage-ui/stores/modules/vision'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { createApp, defineComponent, h, nextTick, shallowRef } from 'vue'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'

import App from './App.vue'

import {
  electronApplyServerChannelConfig,
  electronGetServerChannelConfig,
  electronGetWindowLifecycleState,
  electronGodotStageGetStatus,
  electronMcpListTools,
  i18nGetLocale,
  i18nSetLocale,
} from '../shared/eventa'
import { electronPluginUpdateCapability, pluginProtocolListProviders, pluginProtocolListProvidersEventName } from '../shared/eventa/plugin/capabilities'
import { electronPluginListXsaiTools } from '../shared/eventa/plugin/tools'
import { resolveRendererWindowContext } from './window-context'

const inference = vi.hoisted(() => ({
  loadModel: vi.fn<KokoroAdapter['loadModel']>(async () => ({})),
  generate: vi.fn<KokoroAdapter['generate']>(async () => new ArrayBuffer(0)),
  getVoices: () => ({}),
  terminate: vi.fn(),
  state: 'ready',
  manifest: null,
  deviceLossCount: 0,
} satisfies KokoroAdapter))

// The adapter owns model downloads. Startup still uses the real preload scheduler.
vi.mock('@proj-airi/stage-ui/libs/inference/adapters/kokoro', () => ({
  getKokoroAdapter: async () => inference,
}))

type RendererIpc = NonNullable<Parameters<typeof getElectronEventaContext>[0]>
type RendererListener = Parameters<RendererIpc['on']>[1]
type MainListener = Parameters<IpcMain['on']>[1]

function connectElectron() {
  const mainListeners = new Map<string, MainListener>()
  const rendererListeners = new Map<string, RendererListener>()
  const ipcMain: Pick<IpcMain, 'on' | 'off'> = {
    on: vi.fn((channel: string, listener: MainListener) => {
      mainListeners.set(channel, listener)
      return ipcMain as IpcMain
    }),
    off: vi.fn((channel: string) => {
      mainListeners.delete(channel)
      return ipcMain as IpcMain
    }),
  }
  const webContents: Pick<WebContents, 'id' | 'isDestroyed' | 'send'> = {
    id: 1,
    isDestroyed: () => false,
    send: vi.fn((channel: string, body: unknown) => {
      const message = structuredClone(body)
      queueMicrotask(() => rendererListeners.get(channel)?.({} as IpcRendererEvent, message))
    }),
  }
  const browserWindow: Pick<BrowserWindow, 'webContents' | 'isDestroyed'> = { webContents: webContents as WebContents, isDestroyed: () => false }
  const ipcRenderer: Pick<RendererIpc, 'on' | 'removeListener' | 'send'> = {
    on: vi.fn((channel: string, listener: RendererListener) => {
      rendererListeners.set(channel, listener)
      return () => rendererListeners.delete(channel)
    }),
    removeListener: vi.fn((channel: string) => {
      rendererListeners.delete(channel)
      return ipcRenderer as RendererIpc
    }),
    send: vi.fn((channel: string, body: unknown) => {
      const message = structuredClone(body)
      queueMicrotask(() => mainListeners.get(channel)?.({ sender: webContents as WebContents } as IpcMainEvent, message))
    }),
  }
  const main = createMainContext(ipcMain as IpcMain, browserWindow as BrowserWindow)
  const renderer = getElectronEventaContext(ipcRenderer as RendererIpc)

  return {
    main: main.context,
    dispose() {
      renderer.abort(new Error('Renderer test finished'))
      main.dispose()
      rendererListeners.clear()
      resetElectronEventaContextForTesting()
    },
  }
}

// The channel store and protocol client run normally. Only the server transport
// replies locally, so App does not need a running backend to finish its handshake.
const channelConnector: ClientConnector<string> = {
  connect(events) {
    let closed = false
    return {
      send(message) {
        if (closed)
          return false

        const event = parseEvent(message)
        if (event.type === 'module:authenticate') {
          queueMicrotask(() => {
            if (!closed) {
              events.message(stringifyEvent({
                type: 'module:authenticated',
                data: { authenticated: true },
                metadata: event.metadata,
              }))
            }
          })
        }
        else if (event.type === 'extension:module:announce') {
          queueMicrotask(() => {
            if (!closed) {
              events.message(stringifyEvent({
                ...event,
                type: 'extension:module:announced',
                data: { ...event.data, index: 0 },
              }))
            }
          })
        }
        return true
      },
      close() {
        closed = true
        events.close({ code: 1000, reason: 'Test finished', wasClean: true })
      },
    }
  },
}

async function renderStage(routePath: string, search: string) {
  const originalUrl = location.href
  const url = new URL(originalUrl)
  const windowQuery = new URLSearchParams(search)
  for (const key of ['synced-leader', 'stage-runtime']) {
    const value = windowQuery.get(key)
    if (value === null)
      url.searchParams.delete(key)
    else
      url.searchParams.set(key, value)
  }
  url.hash = routePath
  history.replaceState(null, '', url)
  const windowContext = resolveRendererWindowContext()

  const bridge = connectElectron()
  const reports: PluginCapabilityPayload[] = []
  const errors: unknown[] = []
  defineInvokeHandler(bridge.main, electronPluginUpdateCapability, (payload) => {
    reports.push(payload)
    return { ...payload, updatedAt: Date.now() }
  })
  defineInvokeHandler(bridge.main, i18nGetLocale, () => 'en')
  defineInvokeHandler(bridge.main, i18nSetLocale, () => {})
  defineInvokeHandler(bridge.main, electron.app.isWindows, () => false)
  defineInvokeHandler(bridge.main, artistrySyncConfig, () => {})
  const getWindowLifecycleState = vi.fn(() => ({
    focused: true,
    minimized: false,
    reason: 'initial' as const,
    updatedAt: 0,
    visible: true,
  }))
  defineInvokeHandler(bridge.main, electronGetWindowLifecycleState, getWindowLifecycleState)
  defineInvokeHandler(bridge.main, electronGodotStageGetStatus, () => ({ state: 'stopped' as const, pid: null, updatedAt: 0 }))
  defineInvokeHandler(bridge.main, electronGetServerChannelConfig, () => ({
    hostname: '127.0.0.1',
    authToken: 'startup-test-token',
  }))
  defineInvokeHandler(bridge.main, electronApplyServerChannelConfig, payload => ({
    hostname: '127.0.0.1',
    authToken: 'startup-test-token',
    ...payload,
  }))
  defineInvokeHandler(bridge.main, electronMcpListTools, () => [])
  defineInvokeHandler(bridge.main, electronPluginListXsaiTools, () => ({ prompts: [], tools: [] }))

  const pinia = createPinia()
  const synced = setupSynced({ leadership: windowContext.leadership })
  pinia.use(synced.pinia)
  let unmount: (() => void | Promise<void>) | undefined
  let disposeCharacter: (() => void) | undefined
  let disposeChannel: (() => void) | undefined
  let disposeLeader: (() => void) | undefined
  let leader: {
    pinia: ReturnType<typeof createPinia>
    runtime: ReturnType<typeof usePiniaSynced>
  } | undefined
  onTestFinished(async () => {
    // Stop component consumers before their transports and Pinia state disappear.
    await unmount?.()
    disposeCharacter?.()
    disposeChannel?.()
    await nextTick()
    disposePinia(pinia)
    // Keep the leader available until the follower releases its local consumers.
    disposeLeader?.()
    bridge.dispose()
    history.replaceState(null, '', originalUrl)
  })

  if (windowContext.leadership === 'follower-only') {
    const leaderPinia = createPinia()
    const leaderSynced = setupSynced({ leadership: 'leader-only' })
    leaderPinia.use(leaderSynced.pinia)
    let disposeLeaderChat: (() => void) | undefined
    const leaderApp = createApp(defineComponent({
      setup() {
        const chat = useChatStore()
        disposeLeaderChat = () => chat.dispose()
        // Card actions run in this leader. Create their module stores during
        // setup so their i18n consumers retain a component context.
        useSpeechStore()
        useVisionStore()
        return () => null
      },
    }))
    leaderApp.config.errorHandler = error => errors.push(error)
    leaderApp.use(leaderPinia)
      .use(leaderSynced.vue)
      .use(PiniaColada)
      .use(createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false }))
    disposeLeader = () => {
      leaderApp.unmount()
      disposeLeaderChat?.()
      disposePinia(leaderPinia)
    }
    leaderApp.mount(document.createElement('div'))
    const leaderRuntime = leaderApp.runWithContext(usePiniaSynced)
    await expect.poll(() => leaderRuntime.isLeader(), { timeout: 5000 }).toBe(true)
    leader = { pinia: leaderPinia, runtime: leaderRuntime }
  }

  const initializeCharacter = vi.fn()
  pinia.use(({ store }) => {
    if (store.$id === 'character-orchestrator') {
      store.$onAction(({ name }) => {
        if (name === 'initialize')
          initializeCharacter()
      })
    }
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: defineComponent(() => () => null) }],
  })
  await router.push(routePath)
  await router.isReady()
  let runtime: ReturnType<typeof usePiniaSynced> | undefined
  let channel: ReturnType<typeof useModsServerChannelStore> | undefined
  const readyToMount = shallowRef(false)
  const Host = defineComponent({
    setup() {
      runtime = usePiniaSynced()
      useProviderConfigStore()
      if (windowContext.stageRuntime === 'full') {
        const serverChannel = useModsServerChannelStore()
        channel = serverChannel
        disposeChannel = () => serverChannel.dispose()
        const character = useCharacterOrchestratorStore()
        disposeCharacter = () => character.dispose()
      }
      return () => readyToMount.value ? h(App) : null
    },
  })
  const screen = await render(Host, {
    global: {
      config: { errorHandler: error => errors.push(error) },
      plugins: [
        pinia,
        synced.vue,
        PiniaColada,
        createI18n({ legacy: false, locale: 'en', messages: { en: {} }, missingWarn: false, fallbackWarn: false }),
        router,
      ],
    },
  })
  unmount = () => screen.unmount()
  if (!runtime)
    throw new Error('The renderer did not install Pinia synchronization.')
  const rendererRuntime = runtime
  if (leader) {
    const leaderId = leader.runtime.participantId
    await expect.poll(() => rendererRuntime.getLeaderId(), { timeout: 5000 }).toBe(leaderId)
  }
  else {
    await expect.poll(() => rendererRuntime.isLeader(), { timeout: 5000 }).toBe(true)
  }

  // Seed provider state through its owner before App schedules inference.
  // Followers receive that state through the real synchronization transport.
  const providers = useProviderConfigStore(leader?.pinia ?? pinia)
  await providers.ensureProvider('kokoro-local', 'kokoro-local', { model: 'q8' })
  await providers.setProviderStatus('kokoro-local', 'configured')
  await expect.poll(() => useProviderConfigStore(pinia).configuredProviders['kokoro-local'], { timeout: 5000 }).toBeDefined()
  await channel?.initialize({ token: 'startup-test-token', connector: () => channelConnector })
  readyToMount.value = true
  await nextTick()

  return {
    errors,
    getWindowLifecycleState,
    initializeCharacter,
    leader,
    listProviders: defineInvoke(bridge.main, pluginProtocolListProviders),
    pinia,
    reports,
    runtime: rendererRuntime,
  }
}

beforeEach(async () => {
  vi.stubEnv('RUNTIME_ENVIRONMENT', 'electron')
  localStorage.clear()
  await localforage.clear()
  inference.loadModel.mockClear()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('renderer startup', () => {
  // ROOT CAUSE:
  //
  // The full runtime awaited a mouse RPC after its main-process handler was removed.
  // That unresolved call blocked provider registration, capability reporting, and preload.
  // Removing the obsolete call lets these startup steps finish through the current IPC contracts.
  // https://github.com/moeru-ai/airi/pull/2530
  it('completes main window startup without the obsolete mouse handler (PR #2530)', async () => {
    const stage = await renderStage('/', '?synced-leader=true')

    await expect.poll(() => ({ errors: stage.errors, reports: stage.reports }), { timeout: 5000 }).toEqual({
      errors: [],
      reports: [{
        key: pluginProtocolListProvidersEventName,
        state: 'ready',
        metadata: { source: 'stage-ui' },
      }],
    })
    expect(stage.runtime.isLeader()).toBe(true)
    expect(stage.initializeCharacter).toHaveBeenCalledTimes(1)
    await expect(stage.listProviders()).resolves.toContainEqual({ name: 'Kokoro TTS' })
    await expect.poll(() => inference.loadModel.mock.calls, { timeout: 5000 }).toHaveLength(1)
    expect(inference.loadModel).toHaveBeenCalledWith('q8', 'wasm', { signal: expect.any(AbortSignal) })
  }, 15000)

  // ROOT CAUSE:
  //
  // The fixture forced chat and widgets into leader/full mode. Their Electron
  // windows use follower-only leadership, and chat uses the minimal runtime.
  // Each fixture must preserve its window configuration and use a real store leader.
  // https://github.com/moeru-ai/airi/pull/2530#discussion_r4002175977
  it('starts chat as a minimal follower (PR #2530)', async () => {
    const stage = await renderStage('/chat', '?stage-runtime=minimal&synced-leader=false')
    const sessions = useChatSessionStore(stage.pinia)
    const leaderSessions = stage.leader && useChatSessionStore(stage.leader.pinia)

    await expect.poll(() => sessions.isReady, { timeout: 5000 }).toBe(true)
    expect(sessions.activeSessionId).not.toBe('')
    expect(sessions.activeSessionId).toBe(leaderSessions?.index?.characters.default?.activeSessionId)
    expect(stage.runtime.isLeader()).toBe(false)
    expect(stage.runtime.getLeaderId()).toBe(stage.leader?.runtime.participantId)
    expect(stage.errors).toEqual([])
    expect(stage.getWindowLifecycleState).not.toHaveBeenCalled()
    expect(stage.initializeCharacter).not.toHaveBeenCalled()
    expect(stage.reports).toEqual([])
    expect(inference.loadModel).not.toHaveBeenCalled()
  }, 15000)

  // https://github.com/moeru-ai/airi/pull/2530#discussion_r4002175977
  it('starts widgets as a full follower without the character orchestrator (PR #2530)', async () => {
    const stage = await renderStage('/widgets', '?synced-leader=false')

    await expect.poll(() => ({ errors: stage.errors, reports: stage.reports }), { timeout: 5000 }).toMatchObject({
      errors: [],
      reports: [{ key: pluginProtocolListProvidersEventName, state: 'ready' }],
    })
    expect(stage.runtime.isLeader()).toBe(false)
    expect(stage.runtime.getLeaderId()).toBe(stage.leader?.runtime.participantId)
    expect(stage.initializeCharacter).not.toHaveBeenCalled()
    await expect(stage.listProviders()).resolves.toContainEqual({ name: 'Kokoro TTS' })
    await expect.poll(() => inference.loadModel.mock.calls, { timeout: 5000 }).toHaveLength(1)
  }, 15000)
})

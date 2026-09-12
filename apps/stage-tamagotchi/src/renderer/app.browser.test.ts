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
import { setupSynced } from '@proj-airi/stage-ui/libs/pinia'
import { useCharacterOrchestratorStore } from '@proj-airi/stage-ui/stores/character'
import { useModsServerChannelStore } from '@proj-airi/stage-ui/stores/mods/api/channel-server'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { createPinia, disposePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, nextTick } from 'vue'
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

async function renderStage(routePath: string) {
  const originalUrl = location.href
  const url = new URL(originalUrl)
  url.searchParams.set('synced-leader', 'true')
  url.searchParams.delete('stage-runtime')
  url.hash = routePath
  history.replaceState(null, '', url)

  const bridge = connectElectron()
  const reports: PluginCapabilityPayload[] = []
  defineInvokeHandler(bridge.main, electronPluginUpdateCapability, (payload) => {
    reports.push(payload)
    return { ...payload, updatedAt: Date.now() }
  })
  defineInvokeHandler(bridge.main, i18nGetLocale, () => 'en')
  defineInvokeHandler(bridge.main, i18nSetLocale, () => {})
  defineInvokeHandler(bridge.main, electron.app.isWindows, () => false)
  defineInvokeHandler(bridge.main, artistrySyncConfig, () => {})
  defineInvokeHandler(bridge.main, electronGetWindowLifecycleState, () => ({
    focused: true,
    minimized: false,
    reason: 'initial',
    updatedAt: 0,
    visible: true,
  }))
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
  const synced = setupSynced({ leadership: 'leader-only' })
  pinia.use(synced.pinia)
  let unmount: (() => void | Promise<void>) | undefined
  let disposeCharacter: (() => void) | undefined
  let disposeChannel: (() => void) | undefined
  onTestFinished(async () => {
    // Stop component consumers before their transports and Pinia state disappear.
    await unmount?.()
    disposeCharacter?.()
    disposeChannel?.()
    await nextTick()
    disposePinia(pinia)
    bridge.dispose()
    history.replaceState(null, '', originalUrl)
  })
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
  const errors: unknown[] = []
  const Host = defineComponent({
    setup() {
      const channel = useModsServerChannelStore()
      disposeChannel = () => channel.dispose()
      void channel.initialize({ token: 'startup-test-token', connector: () => channelConnector })
      const providers = useProviderConfigStore()
      providers.ensureProvider('kokoro-local', 'kokoro-local', { model: 'q8' })
      providers.setProviderStatus('kokoro-local', 'configured')
      const character = useCharacterOrchestratorStore()
      disposeCharacter = () => character.dispose()
      return () => h(App)
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

  return {
    errors,
    initializeCharacter,
    listProviders: defineInvoke(bridge.main, pluginProtocolListProviders),
    reports,
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
  it.each(['/', '/chat'])('completes full startup at %s without the obsolete mouse handler (PR #2530)', async (routePath) => {
    const stage = await renderStage(routePath)

    await expect.poll(() => ({ errors: stage.errors, reports: stage.reports }), { timeout: 5000 }).toEqual({
      errors: [],
      reports: [{
        key: pluginProtocolListProvidersEventName,
        state: 'ready',
        metadata: { source: 'stage-ui' },
      }],
    })
    expect(stage.initializeCharacter).toHaveBeenCalledTimes(1)
    await expect(stage.listProviders()).resolves.toContainEqual({ name: 'Kokoro TTS' })
    await expect.poll(() => inference.loadModel.mock.calls, { timeout: 5000 }).toHaveLength(1)
    expect(inference.loadModel).toHaveBeenCalledWith('q8', 'wasm', { signal: expect.any(AbortSignal) })
  }, 15000)

  // https://github.com/moeru-ai/airi/pull/2530
  it('starts widgets without the character orchestrator (PR #2530)', async () => {
    const stage = await renderStage('/widgets')

    await expect.poll(() => ({ errors: stage.errors, reports: stage.reports }), { timeout: 5000 }).toMatchObject({
      errors: [],
      reports: [{ key: pluginProtocolListProvidersEventName, state: 'ready' }],
    })
    expect(stage.initializeCharacter).not.toHaveBeenCalled()
    await expect(stage.listProviders()).resolves.toContainEqual({ name: 'Kokoro TTS' })
    await expect.poll(() => inference.loadModel.mock.calls, { timeout: 5000 }).toHaveLength(1)
  }, 15000)
})

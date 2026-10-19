import type { BrowserWindow, IpcMainEvent } from 'electron'

import { defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { createTransportFetch, RequestSession } from '@proj-airi/ai-transport'
import { app, ipcMain } from 'electron'
import { injeca } from 'injeca'
import { array, boolean, instance, object, optional, parse, picklist, string, tuple } from 'valibot'

import { aiTransportCancel, aiTransportEnabledChanged, aiTransportGetEnabled, aiTransportRead, aiTransportSetEnabled, aiTransportStart } from '../../../shared/eventa/ai-transport'
import { networkProxyChanged, networkProxyGet, networkProxySet } from '../../../shared/eventa/network-proxy'
import { createConfig } from '../../libs/electron/persistence'
import { fetchNativeHTTP } from './native-http'
import { networkProxyService } from './network-proxy'

const requestSchema = object({
  id: string(),
  url: string(),
  method: string(),
  headers: array(tuple([string(), string()])),
  body: optional(instance(Uint8Array)),
  redirect: picklist(['follow', 'error', 'manual']),
})

const enabledSchema = boolean()
let config: ReturnType<typeof createConfig<typeof enabledSchema>> | undefined
const listeners = new Set<(enabled: boolean) => void>()

function getConfig() {
  if (!config) {
    config = createConfig('ai-transport', 'enabled.json', enabledSchema, { default: false })
    config.setup()
  }
  return config
}

let mainRequests: RequestSession | undefined
/** Main-process drawing and downloads use the same HTTP policy without renderer IPC. */
export const fetchAI: typeof fetch = (input, init) => {
  if (!mainRequests) {
    mainRequests = new RequestSession(fetchNativeHTTP)
    app.once('before-quit', () => {
      void mainRequests?.dispose()
    })
  }
  return createTransportFetch(mainRequests)(input, init)
}

/** Registers only on privileged AIRI windows. Each window owns a separate request map and lifecycle. */
export function setupAITransport(window: BrowserWindow) {
  const { context, dispose: disposeContext } = createContext(ipcMain, window, { onlySameWindow: true })
  let requests = new RequestSession(fetchNativeHTTP)
  function assertCaller(event: IpcMainEvent | undefined) {
    if (!event || window.isDestroyed() || event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame)
      throw new Error('AI request proxy rejected the caller.')
  }
  const proxy = injeca.resolve({ service: networkProxyService })
  let unsubscribeProxy: (() => void) | undefined
  void proxy.then(({ service }) => {
    if (!window.isDestroyed()) {
      unsubscribeProxy = service.subscribe(state => void context.emit(networkProxyChanged, state))
    }
  }).catch(() => {})
  defineInvokeHandler(context, networkProxyGet, async (_, options) => {
    assertCaller(options?.raw.ipcMainEvent)
    return (await proxy).service.get()
  })
  defineInvokeHandler(context, networkProxySet, async (value, options) => {
    assertCaller(options?.raw.ipcMainEvent)
    return (await proxy).service.set(value)
  })
  defineInvokeHandler(context, aiTransportStart, (value, options) => {
    assertCaller(options?.raw.ipcMainEvent)
    if (!getConfig().get())
      throw new Error('AI request proxy is disabled.')
    return requests.start(parse(requestSchema, value))
  })
  defineInvokeHandler(context, aiTransportRead, (id, options) => {
    assertCaller(options?.raw.ipcMainEvent)
    return requests.read(parse(string(), id))
  })
  defineInvokeHandler(context, aiTransportCancel, (id, options) => {
    assertCaller(options?.raw.ipcMainEvent)
    return requests.cancel(parse(string(), id))
  })
  defineInvokeHandler(context, aiTransportGetEnabled, (_, options) => {
    assertCaller(options?.raw.ipcMainEvent)
    return getConfig().get() === true
  })
  defineInvokeHandler(context, aiTransportSetEnabled, (value, options) => {
    assertCaller(options?.raw.ipcMainEvent)
    const enabled = parse(boolean(), value)
    getConfig().update(enabled)
    for (const listener of listeners)
      listener(enabled)
    return enabled
  })
  const broadcast = (enabled: boolean) => {
    void context.emit(aiTransportEnabledChanged, enabled)
  }
  listeners.add(broadcast)
  const dispose = () => {
    void requests.dispose()
  }
  window.webContents.on('did-start-navigation', (_event, _url, inPlace, mainFrame) => {
    if (mainFrame && !inPlace) {
      dispose()
      requests = new RequestSession(fetchNativeHTTP)
    }
  })
  window.webContents.on('render-process-gone', dispose)
  app.on('before-quit', dispose)
  window.once('closed', () => {
    unsubscribeProxy?.()
    dispose()
    disposeContext()
    listeners.delete(broadcast)
    app.removeListener('before-quit', dispose)
  })
}

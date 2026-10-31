import { Buffer } from 'node:buffer'

import { ipcMain } from 'electron'

import { isLocalAppURL } from '../../libs/electron/url'

export const ELECTRON_FETCH_IPC_CHANNEL = 'airi:electron:fetch'

export interface ElectronFetchPayload {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string
  requestId?: string
}

export interface ElectronFetchResult {
  ok: boolean
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  bodyBase64?: string
}

let fetchServiceRegistered = false
const activeFetches = new Map<string, AbortController>()

export function createFetchService() {
  if (fetchServiceRegistered)
    return

  fetchServiceRegistered = true

  ipcMain.handle(ELECTRON_FETCH_IPC_CHANNEL, async (event, payload: ElectronFetchPayload): Promise<ElectronFetchResult> => {
    if (!isLocalAppURL(event.senderFrame?.url ?? event.sender.getURL()))
      throw new Error('Renderer is not authorized to use the fetch bridge')
    const target = new URL(payload.url)
    if (target.protocol !== 'http:' && target.protocol !== 'https:')
      throw new Error('Fetch bridge only supports HTTP(S) targets')
    const controller = payload.requestId ? new AbortController() : undefined
    if (payload.requestId && controller)
      activeFetches.set(payload.requestId, controller)
    try {
      const response = await fetch(target, {
        method: payload.method ?? 'GET',
        headers: payload.headers,
        body: payload.body,
        signal: controller?.signal,
      })

      const headers: Record<string, string> = {}
      response.headers.forEach((value, key) => {
        headers[key] = value
      })

      const contentType = headers['content-type'] || ''
      const isBinary = contentType.includes('audio/') || contentType.includes('image/') || contentType.includes('video/') || contentType.includes('application/octet-stream')

      if (isBinary) {
        const arrayBuffer = await response.arrayBuffer()
        const base64 = Buffer.from(arrayBuffer).toString('base64')
        return {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText,
          headers,
          body: '',
          bodyBase64: base64,
        }
      }

      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers,
        body: await response.text(),
      }
    }
    finally {
      if (payload.requestId)
        activeFetches.delete(payload.requestId)
    }
  })
  ipcMain.handle('airi:electron:fetch-cancel', (event, requestId: string) => {
    if (!isLocalAppURL(event.senderFrame?.url ?? event.sender.getURL()))
      throw new Error('Renderer is not authorized to cancel fetches')
    activeFetches.get(requestId)?.abort()
  })
}

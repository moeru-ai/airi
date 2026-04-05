import { ipcMain } from 'electron'

export const ELECTRON_FETCH_IPC_CHANNEL = 'airi:electron:fetch'

export interface ElectronFetchPayload {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: string
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

export function createFetchService() {
  if (fetchServiceRegistered)
    return

  fetchServiceRegistered = true

  ipcMain.handle(ELECTRON_FETCH_IPC_CHANNEL, async (_event, payload: ElectronFetchPayload): Promise<ElectronFetchResult> => {
    const response = await fetch(payload.url, {
      method: payload.method ?? 'GET',
      headers: payload.headers,
      body: payload.body,
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
  })
}

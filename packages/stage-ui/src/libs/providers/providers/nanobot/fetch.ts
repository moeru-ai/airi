import { isElectronWindow } from '@proj-airi/stage-shared'

const NANOBOT_FETCH_IPC_CHANNEL = 'proj-airi:nanobot:http-fetch'

interface NanobotIpcFetchRequest {
  body?: string
  headers?: Record<string, string>
  method?: string
  url: string
}

interface NanobotIpcFetchResponse {
  bodyText: string
  headers: Record<string, string>
  ok: boolean
  status: number
  statusText: string
}

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  const normalized = new Headers(headers)
  const result: Record<string, string> = {}
  normalized.forEach((value, key) => {
    result[key] = value
  })
  return result
}

async function fetchThroughElectron(request: NanobotIpcFetchRequest): Promise<Response> {
  if (!isElectronWindow(window)) {
    throw new Error('Electron HTTP bridge is unavailable in the current runtime.')
  }

  const response = await window.electron.ipcRenderer.invoke(NANOBOT_FETCH_IPC_CHANNEL, request) as NanobotIpcFetchResponse
  return new Response(response.bodyText, {
    headers: response.headers,
    status: response.status,
    statusText: response.statusText,
  })
}

export async function fetchNanobot(input: string | URL, init?: RequestInit): Promise<Response> {
  const request = new Request(input, init)

  if (typeof window !== 'undefined' && isElectronWindow(window)) {
    const bodyText = request.method.toUpperCase() === 'GET'
      ? undefined
      : await request.clone().text()

    return fetchThroughElectron({
      body: bodyText,
      headers: normalizeHeaders(request.headers),
      method: request.method,
      url: request.url,
    })
  }

  return fetch(request)
}

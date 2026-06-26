import type { Fetch } from '@xsai/shared'

import { defineStreamInvoke } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/renderer'
import { openAICompatibleFetch } from '@proj-airi/stage-shared'

type IpcRendererLike = Parameters<typeof createContext>[0]

let sharedFetch: Fetch | undefined

function resolveElectronIpcRenderer(): IpcRendererLike | undefined {
  if (typeof window === 'undefined')
    return undefined

  return (window as { electron?: { ipcRenderer?: IpcRendererLike } }).electron?.ipcRenderer
}

async function readRequestBody(init: RequestInit): Promise<string | undefined> {
  if (typeof init.body === 'string')
    return init.body
  if (init.body == null)
    return undefined

  return await new Response(init.body).text()
}

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> | undefined {
  if (!headers)
    return undefined

  const result: Record<string, string> = {}
  new Headers(headers).forEach((value, key) => {
    result[key] = value
  })
  return result
}

function shouldUseElectronFetchFallback(error: unknown) {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError')
    return false

  return error instanceof TypeError
}

function normalizeRequestMethod(init: RequestInit): string {
  return (init.method ?? 'GET').toUpperCase()
}

function canReplayRequest(method: string): boolean {
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS' || method === 'TRACE'
}

function createElectronFetch(ipcRenderer: IpcRendererLike): Fetch {
  const { context } = createContext(ipcRenderer)
  const invokeFetch = defineStreamInvoke(context, openAICompatibleFetch)

  return async (input, init) => {
    const requestUrl = input.toString()
    const requestMethod = normalizeRequestMethod(init)

    const fetchThroughElectron = async () => {
      const responseEvents = invokeFetch({
        url: requestUrl,
        method: init.method,
        headers: headersToRecord(init.headers),
        body: await readRequestBody(init),
      }, init.signal ? { signal: init.signal } : undefined)
      const reader = responseEvents.getReader()
      const head = await reader.read()

      if (head.done || head.value.type !== 'head') {
        await reader.cancel()
        throw new Error('OpenAI-compatible fetch bridge closed before response headers.')
      }

      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          const next = await reader.read()
          if (next.done) {
            controller.close()
            return
          }

          if (next.value.type !== 'chunk') {
            controller.error(new Error('OpenAI-compatible fetch bridge received an unexpected response event.'))
            await reader.cancel()
            return
          }

          controller.enqueue(next.value.chunk)
        },
        async cancel(reason) {
          await reader.cancel(reason)
        },
      })

      return new Response(body, {
        status: head.value.status,
        statusText: head.value.statusText,
        headers: head.value.headers,
      })
    }

    if (!canReplayRequest(requestMethod))
      return await fetchThroughElectron()

    try {
      return await globalThis.fetch(input, init)
    }
    catch (error) {
      if (!shouldUseElectronFetchFallback(error))
        throw error

      return await fetchThroughElectron()
    }
  }
}

export function resolveOpenAICompatibleFetch(): Fetch | undefined {
  const ipcRenderer = resolveElectronIpcRenderer()
  if (!ipcRenderer)
    return undefined

  sharedFetch ??= createElectronFetch(ipcRenderer)
  return sharedFetch
}

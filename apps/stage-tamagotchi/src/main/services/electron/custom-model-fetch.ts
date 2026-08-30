import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type {
  FetchTransportPort,
  FetchTransportRequest,
} from '@proj-airi/core-agent'
import type { BrowserWindow } from 'electron'

import type {
  CustomModelFetchRequestPayload,
  CustomModelFetchStreamEvent,
} from '../../../shared/eventa/custom-model-fetch'

import { defineInvokeHandler, defineStreamInvokeHandler } from '@moeru/eventa'
import {
  createDirectFetchTransport,
  ModelConnectionError,
  parseFetchTransportRequest,
  toModelConnectionError,
} from '@proj-airi/core-agent'

import {
  electronCustomModelFetch,
  electronCustomModelFetchCancel,
} from '../../../shared/eventa/custom-model-fetch'
import { onAppBeforeQuit } from '../../libs/bootkit/lifecycle'

type EventaContext = ReturnType<typeof createContext>['context']

export interface RegisterCustomModelFetchWindowParams {
  context: EventaContext
  window: BrowserWindow
}

export interface CustomModelFetchServiceOptions {
  /**
   * Fetch implementation used for upstream requests in Main Process.
   *
   * @default globalThis.fetch
   */
  fetch?: typeof globalThis.fetch
}

export interface CustomModelFetchService {
  registerWindow: (params: RegisterCustomModelFetchWindowParams) => void
  dispose: () => void
}

interface ActiveRequest {
  requestId: string
  controller: AbortController
  timeout: ReturnType<typeof setTimeout> | undefined
  window: BrowserWindow
}

const RENDERER_CLOSED = 'renderer-closed'

let activeService: CustomModelFetchService | undefined
let quitHookRegistered = false

/**
 * Creates one Main Process custom-model fetch service.
 *
 * The service owns an `AbortController` per `requestId`. Cancel, timeout, and
 * Renderer close abort the matching upstream request.
 */
export function createCustomModelFetchService(
  options: CustomModelFetchServiceOptions = {},
): CustomModelFetchService {
  const upstream = createDirectFetchTransport({ fetch: options.fetch })
  const active = new Map<string, ActiveRequest>()
  const cleanups = new Set<() => void>()

  function clearRequest(requestId: string): void {
    const entry = active.get(requestId)
    if (!entry)
      return
    if (entry.timeout != null)
      clearTimeout(entry.timeout)
    active.delete(requestId)
  }

  function abortRequest(requestId: string, reason?: unknown): void {
    const entry = active.get(requestId)
    if (!entry)
      return
    if (!entry.controller.signal.aborted)
      entry.controller.abort(reason)
    clearRequest(requestId)
  }

  function abortWindow(window: BrowserWindow): void {
    for (const [requestId, entry] of active) {
      if (entry.window === window)
        abortRequest(requestId, RENDERER_CLOSED)
    }
  }

  function abortAll(): void {
    const requestIds = Array.from(active.keys())
    for (const requestId of requestIds)
      abortRequest(requestId, RENDERER_CLOSED)
  }

  const registerWindow: CustomModelFetchService['registerWindow'] = ({ context, window }) => {
    const offFetch = defineStreamInvokeHandler(
      context,
      electronCustomModelFetch,
      async function* (payload, invokeOptions) {
        // Eventa's Electron main adapter delivers every ipcMain message to
        // every window context. Ignore invokes that another window sent.
        if (!isInvokeFromWindow(window, invokeOptions))
          return

        yield* streamUpstreamRequest({
          payload,
          window,
          upstream,
          active,
          abortRequest,
          clearRequest,
          abortController: invokeOptions?.abortController,
        })
      },
    )

    const offCancel = defineInvokeHandler(context, electronCustomModelFetchCancel, (payload) => {
      if (!payload?.requestId)
        return
      abortRequest(payload.requestId)
    })

    let closed = false
    const onClosed = () => {
      if (closed)
        return
      closed = true
      abortWindow(window)
      offFetch()
      offCancel()
      cleanups.delete(onClosed)
    }

    window.once('closed', onClosed)
    window.webContents.once('destroyed', onClosed)
    window.webContents.once('render-process-gone', onClosed)
    cleanups.add(onClosed)
  }

  const dispose: CustomModelFetchService['dispose'] = () => {
    abortAll()
    const pending = Array.from(cleanups)
    for (const cleanup of pending)
      cleanup()
    cleanups.clear()
  }

  return { registerWindow, dispose }
}

/**
 * Starts the process-wide custom-model fetch service used by Electron windows.
 */
export function setupCustomModelFetchService(
  options: CustomModelFetchServiceOptions = {},
): CustomModelFetchService {
  activeService ??= createCustomModelFetchService(options)
  if (!quitHookRegistered) {
    quitHookRegistered = true
    onAppBeforeQuit(() => {
      activeService?.dispose()
      activeService = undefined
    })
  }
  return activeService
}

/**
 * Returns the process-wide custom-model fetch service, and creates it if needed.
 */
export function getCustomModelFetchService(): CustomModelFetchService {
  return setupCustomModelFetchService()
}

/**
 * Clears the process-wide custom-model fetch service.
 *
 * Tests call this after they create the singleton.
 */
export function resetCustomModelFetchServiceForTesting(): void {
  activeService?.dispose()
  activeService = undefined
  quitHookRegistered = false
}

async function* streamUpstreamRequest(params: {
  payload: CustomModelFetchRequestPayload
  window: BrowserWindow
  upstream: FetchTransportPort
  active: Map<string, ActiveRequest>
  abortRequest: (requestId: string, reason?: unknown) => void
  clearRequest: (requestId: string) => void
  abortController?: AbortController
}): AsyncGenerator<CustomModelFetchStreamEvent, void, unknown> {
  let envelope: FetchTransportRequest
  try {
    envelope = parseFetchTransportRequest({
      requestId: params.payload.requestId,
      protocol: params.payload.protocol,
      operation: params.payload.operation,
      url: params.payload.url,
      method: params.payload.method,
      headers: params.payload.headers,
      body: params.payload.body,
      timeoutMs: params.payload.timeoutMs,
    })
  }
  catch (error) {
    yield {
      type: 'error',
      requestId: params.payload.requestId,
      error: toModelConnectionError(error, 'transport').toJSON(),
    }
    return
  }

  if (params.active.has(envelope.requestId)) {
    yield {
      type: 'error',
      requestId: envelope.requestId,
      error: new ModelConnectionError({
        stage: 'transport',
        code: 'invalid-config',
        message: 'The transport request id is already in use.',
        retryable: false,
      }).toJSON(),
    }
    return
  }

  const controller = new AbortController()
  const timeout = scheduleTimeout(envelope.timeoutMs ?? params.payload.timeoutMs, () => {
    params.abortRequest(envelope.requestId, timeoutError())
  })
  params.active.set(envelope.requestId, {
    requestId: envelope.requestId,
    controller,
    timeout,
    window: params.window,
  })

  const abortFromEventa = () => {
    params.abortRequest(envelope.requestId, params.abortController?.signal.reason)
  }
  if (params.abortController?.signal.aborted)
    abortFromEventa()
  else
    params.abortController?.signal.addEventListener('abort', abortFromEventa, { once: true })

  try {
    const response = await params.upstream.request({
      ...envelope,
      signal: controller.signal,
    })

    yield {
      type: 'headers',
      requestId: envelope.requestId,
      status: response.status,
      headers: response.headers,
    }

    if (response.body) {
      const reader = response.body.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done)
            break
          if (value && value.byteLength > 0) {
            yield {
              type: 'chunk',
              requestId: envelope.requestId,
              bytes: value,
            }
          }
        }
      }
      finally {
        reader.releaseLock()
      }
    }

    yield {
      type: 'complete',
      requestId: envelope.requestId,
    }
  }
  catch (error) {
    if (controller.signal.reason === RENDERER_CLOSED)
      return
    if (
      params.abortController?.signal.aborted
      && !(controller.signal.reason instanceof ModelConnectionError)
    ) {
      return
    }

    yield {
      type: 'error',
      requestId: envelope.requestId,
      error: toModelConnectionError(
        controller.signal.reason instanceof ModelConnectionError
          ? controller.signal.reason
          : error,
        'transport',
      ).toJSON(),
    }
  }
  finally {
    params.abortController?.signal.removeEventListener('abort', abortFromEventa)
    params.clearRequest(envelope.requestId)
  }
}

function isInvokeFromWindow(window: BrowserWindow, invokeOptions: unknown): boolean {
  const senderId = readSenderWebContentsId(invokeOptions)
  if (senderId == null)
    return true
  if (window.isDestroyed() || window.webContents.isDestroyed())
    return false
  return window.webContents.id === senderId
}

function readSenderWebContentsId(invokeOptions: unknown): number | undefined {
  if (typeof invokeOptions !== 'object' || invokeOptions == null)
    return undefined

  const raw = (invokeOptions as { raw?: { ipcMainEvent?: { sender?: { id?: unknown } } } }).raw
  const id = raw?.ipcMainEvent?.sender?.id
  return typeof id === 'number' ? id : undefined
}

function scheduleTimeout(
  timeoutMs: number | undefined,
  onTimeout: () => void,
): ReturnType<typeof setTimeout> | undefined {
  if (timeoutMs == null || !Number.isFinite(timeoutMs) || timeoutMs <= 0)
    return undefined
  return setTimeout(onTimeout, timeoutMs)
}

function timeoutError(): ModelConnectionError {
  return new ModelConnectionError({
    stage: 'transport',
    code: 'timeout',
    message: 'The request timed out.',
    retryable: true,
  })
}

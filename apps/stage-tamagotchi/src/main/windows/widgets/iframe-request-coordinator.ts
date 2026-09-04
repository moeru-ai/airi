import type {
  WidgetsIframeRequestPayload,
  WidgetsIframeRequestResultPayload,
} from '../../../shared/eventa'

import { randomUUID } from 'node:crypto'

import { errorMessageFrom } from '@moeru/std'

const DEFAULT_WIDGET_IFRAME_REQUEST_TIMEOUT_MS = 30000
const WIDGET_IFRAME_REQUEST_CLOSED_MESSAGE = 'Gamelet was closed before the request completed.'

interface PendingWidgetIframeRequest {
  id: string
  resolve: (result: Record<string, unknown>) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
  releaseWait: () => void
}

/**
 * Runtime hooks used by the widget iframe request coordinator.
 */
export interface WidgetIframeRequestCoordinatorOptions {
  /** Emits the main-to-renderer iframe request event after pending state is registered. */
  emitRequest: (payload: WidgetsIframeRequestPayload) => void
  /** Returns whether the widget id currently has a mounted main-process record. */
  hasWidget: (id: string) => boolean
  /** Returns whether the widget id has a renderer relay for iframe request events. */
  hasRelay: (id: string) => boolean
  /** Waits until the widget renderer has installed its request listener. */
  waitForRelay?: (id: string) => Promise<void>
}

/**
 * Coordinates pending request state for main-to-widget-iframe requests.
 *
 * The widgets renderer is an asynchronous relay between Electron main and the mounted iframe,
 * so this helper owns the correlation, timeout, widget-id isolation, and close cleanup policy
 * that would otherwise be hidden inside the window manager's Electron setup code.
 */
export function createWidgetIframeRequestCoordinator(options: WidgetIframeRequestCoordinatorOptions) {
  const pendingRequests = new Map<string, PendingWidgetIframeRequest>()

  function settlePendingRequest(requestId: string, settle: (pending: PendingWidgetIframeRequest) => void) {
    const pending = pendingRequests.get(requestId)
    if (!pending)
      return undefined

    pendingRequests.delete(requestId)
    clearTimeout(pending.timeout)
    pending.releaseWait()
    settle(pending)
    return pending
  }

  function createTimeoutError(timeoutMs: number) {
    return new Error(`Gamelet request timed out after ${timeoutMs}ms.`)
  }

  async function requestWidgetIframe<TResponse extends Record<string, unknown> = Record<string, unknown>>(
    id: string,
    payload: Record<string, unknown>,
    requestOptions?: { timeoutMs?: number },
  ): Promise<TResponse> {
    if (!options.hasWidget(id))
      return Promise.reject(new Error(`Gamelet \`${id}\` is not open.`))
    const requestId = randomUUID()
    const timeoutMs = requestOptions?.timeoutMs ?? DEFAULT_WIDGET_IFRAME_REQUEST_TIMEOUT_MS
    const expiresAt = Date.now() + timeoutMs
    let releaseWait!: () => void
    const deadlineReached = new Promise<void>((resolve) => {
      releaseWait = resolve
    })

    const response = new Promise<TResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        settlePendingRequest(requestId, pending => pending.reject(createTimeoutError(timeoutMs)))
      }, Math.max(0, expiresAt - Date.now()))

      pendingRequests.set(requestId, {
        id,
        resolve: result => resolve(result as TResponse),
        reject,
        timeout,
        releaseWait,
      })
    })

    try {
      if (!options.hasRelay(id)) {
        if (!options.waitForRelay) {
          throw new Error('Gamelet iframe relay is not available.')
        }
        await Promise.race([
          options.waitForRelay(id),
          deadlineReached,
        ])
      }
      if (!pendingRequests.has(requestId)) {
        return response
      }
      if (!options.hasRelay(id)) {
        throw new Error('Gamelet iframe relay is not available.')
      }

      options.emitRequest({
        id,
        requestId,
        payload: payload as WidgetsIframeRequestPayload['payload'],
        timeoutMs,
        expiresAt,
      })
    }
    catch (error) {
      settlePendingRequest(requestId, pending => pending.reject(new Error(errorMessageFrom(error) ?? String(error))))
    }

    return response
  }

  function publishWidgetIframeRequestResult(result: WidgetsIframeRequestResultPayload) {
    const pending = pendingRequests.get(result.requestId)
    if (!pending || pending.id !== result.id)
      return

    settlePendingRequest(result.requestId, (settled) => {
      if (result.ok) {
        settled.resolve(result.result)
        return
      }

      settled.reject(new Error(result.error))
    })
  }

  function rejectPendingWidgetIframeRequests(id: string, message = WIDGET_IFRAME_REQUEST_CLOSED_MESSAGE) {
    for (const [requestId, pending] of pendingRequests) {
      if (pending.id !== id)
        continue

      settlePendingRequest(requestId, settled => settled.reject(new Error(message)))
    }
  }

  function rejectAllPendingWidgetIframeRequests(message = WIDGET_IFRAME_REQUEST_CLOSED_MESSAGE) {
    for (const requestId of pendingRequests.keys()) {
      settlePendingRequest(requestId, settled => settled.reject(new Error(message)))
    }
  }

  return {
    requestWidgetIframe,
    publishWidgetIframeRequestResult,
    rejectPendingWidgetIframeRequests,
    rejectAllPendingWidgetIframeRequests,
  }
}

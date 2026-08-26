import type {
  WidgetsIframeRequestPayload,
  WidgetsIframeRequestResultPayload,
} from '../../../shared/eventa'

import { randomUUID } from 'node:crypto'

const DEFAULT_WIDGET_IFRAME_REQUEST_TIMEOUT_MS = 30000
const WIDGET_IFRAME_REQUEST_CLOSED_MESSAGE = 'Gamelet was closed before the request completed.'

interface PendingWidgetIframeRequest {
  id: string
  resolve: (result: Record<string, unknown>) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

/**
 * Runtime hooks used by the widget iframe request coordinator.
 */
export interface WidgetIframeRequestCoordinatorOptions {
  /** Emits the main-to-renderer iframe request event after pending state is registered. */
  emitRequest: (payload: WidgetsIframeRequestPayload) => void
  /** Returns whether the widget id currently has a mounted main-process record. */
  hasWidget: (id: string) => boolean
  /** Returns whether a renderer relay is available to receive iframe request events. */
  hasRelay: () => boolean
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
    settle(pending)
    return pending
  }

  function requestWidgetIframe<TResponse extends Record<string, unknown> = Record<string, unknown>>(
    id: string,
    payload: Record<string, unknown>,
    requestOptions?: { timeoutMs?: number },
  ): Promise<TResponse> {
    if (!options.hasWidget(id))
      return Promise.reject(new Error(`Gamelet \`${id}\` is not open.`))
    if (!options.hasRelay())
      return Promise.reject(new Error('Gamelet iframe relay is not available.'))

    const requestId = randomUUID()
    const timeoutMs = requestOptions?.timeoutMs ?? DEFAULT_WIDGET_IFRAME_REQUEST_TIMEOUT_MS

    const response = new Promise<TResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        pendingRequests.delete(requestId)
        reject(new Error(`Gamelet request timed out after ${timeoutMs}ms.`))
      }, timeoutMs)

      pendingRequests.set(requestId, {
        id,
        resolve: result => resolve(result as TResponse),
        reject,
        timeout,
      })
    })

    options.emitRequest({
      id,
      requestId,
      payload: payload as WidgetsIframeRequestPayload['payload'],
      timeoutMs,
    })

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

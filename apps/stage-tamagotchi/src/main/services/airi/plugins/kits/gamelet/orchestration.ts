import type { GameletKitRuntime } from '@proj-airi/plugin-sdk-tamagotchi/gamelet'
import type { HostDataRecord } from '@proj-airi/plugin-sdk/plugin-host'

import type { ExtensionHostGameletWidgetsManager } from '../../types'

import { randomUUID } from 'node:crypto'

import { errorMessageFrom } from '@moeru/std'

const DEFAULT_REQUEST_TIMEOUT_MS = 30000
const GAMELET_ROUTE_NAMESPACE = 'airi.plugin.gamelet'

export interface GameletOrchestrationRuntime extends NonNullable<GameletKitRuntime['gamelets']> {
  dispose: () => void
}

interface PendingRequest {
  bindingId: string
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

/**
 * Creates the Electron host implementation for gamelet lifecycle and request calls.
 *
 * Use when:
 * - Built-in `kit.gamelet` clients need to open iframe-backed extension UI widgets
 * - Extension-side gamelet handles need request/response orchestration through widget events
 *
 * Expects:
 * - Widget ids are the same values as gamelet binding ids
 * - Widget-side response events echo the original `requestId` at the top level or under `payload`
 *
 * Returns:
 * - A gamelet orchestration runtime backed by the stage widget manager
 */
export function createGameletOrchestrationRuntime(
  widgetsManager: ExtensionHostGameletWidgetsManager,
): GameletOrchestrationRuntime {
  const pendingRequests = new Map<string, PendingRequest>()

  const rejectPendingForBinding = (bindingId: string, message: string) => {
    for (const [requestId, pending] of pendingRequests.entries()) {
      if (pending.bindingId !== bindingId) {
        continue
      }

      pendingRequests.delete(requestId)
      clearTimeout(pending.timeout)
      pending.reject(new Error(message))
    }
  }

  const rejectAllPending = (message: string) => {
    for (const [requestId, pending] of pendingRequests.entries()) {
      pendingRequests.delete(requestId)
      clearTimeout(pending.timeout)
      pending.reject(new Error(message))
    }
  }

  const unsubscribe = widgetsManager.onWidgetEvent(({ id, event }) => {
    const response = readRequestResponse(event)
    if (!response) {
      return
    }

    const pending = pendingRequests.get(response.requestId)
    if (!pending || pending.bindingId !== id) {
      return
    }

    pendingRequests.delete(response.requestId)
    clearTimeout(pending.timeout)

    if (response.ok === false) {
      pending.reject(new Error(readResponseErrorMessage(response.value)))
      return
    }

    pending.resolve(response.value)
  })

  return {
    async open(bindingId, payload) {
      const componentProps = createComponentProps(bindingId, payload ?? {})

      if (widgetsManager.getWidgetSnapshot(bindingId)) {
        await widgetsManager.updateWidget({
          id: bindingId,
          componentProps,
          size: 'l',
        })
      }
      else {
        await widgetsManager.pushWidget({
          id: bindingId,
          componentName: 'extension-ui',
          componentProps,
          size: 'l',
        })
      }

      await widgetsManager.openWindow({ id: bindingId })
    },
    async configure(bindingId, payload) {
      await widgetsManager.updateWidget({
        id: bindingId,
        componentProps: createComponentProps(bindingId, payload),
      })
    },
    async request<TResponse = HostDataRecord>(bindingId: string, payload: HostDataRecord, options?: { timeoutMs?: number }): Promise<TResponse> {
      if (!widgetsManager.getWidgetSnapshot(bindingId)) {
        throw new Error(`Gamelet \`${bindingId}\` is not open.`)
      }

      const requestId = randomUUID()
      const timeoutMs = options?.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS

      const response = new Promise<TResponse>((resolve, reject) => {
        const timeout = setTimeout(() => {
          pendingRequests.delete(requestId)
          reject(new Error(`Gamelet request timed out after ${timeoutMs}ms.`))
        }, timeoutMs)

        pendingRequests.set(requestId, {
          bindingId,
          resolve: value => resolve(value as TResponse),
          reject,
          timeout,
        })
      })

      try {
        await widgetsManager.updateWidget({
          id: bindingId,
          componentProps: createComponentProps(bindingId, {
            request: {
              route: {
                namespace: GAMELET_ROUTE_NAMESPACE,
                name: 'request',
              },
              responseRoute: {
                namespace: GAMELET_ROUTE_NAMESPACE,
                name: 'response',
              },
              requestId,
              payload,
            },
          }),
        })
      }
      catch (error) {
        const pending = pendingRequests.get(requestId)
        if (pending) {
          pendingRequests.delete(requestId)
          clearTimeout(pending.timeout)
          pending.reject(new Error(errorMessageFrom(error) ?? 'Failed to publish gamelet request.'))
        }
      }

      return await response
    },
    async close(bindingId) {
      rejectPendingForBinding(bindingId, 'Gamelet was closed before the request completed.')
      await widgetsManager.removeWidget(bindingId)
    },
    async isOpen(bindingId) {
      return Boolean(widgetsManager.getWidgetSnapshot(bindingId))
    },
    dispose() {
      unsubscribe()
      rejectAllPending('Gamelet orchestration runtime was disposed before the request completed.')
    },
  }
}

function createComponentProps(bindingId: string, payload: HostDataRecord): HostDataRecord {
  return {
    moduleId: bindingId,
    payload,
  }
}

function readRequestResponse(event: Record<string, unknown>): { requestId: string, ok?: boolean, value: unknown } | undefined {
  const route = event.route
  if (!route || typeof route !== 'object' || Array.isArray(route)) {
    return undefined
  }

  const routeRecord = route as Record<string, unknown>
  if (routeRecord.namespace !== GAMELET_ROUTE_NAMESPACE || routeRecord.name !== 'response') {
    return undefined
  }

  const payload = event.payload
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined
  }

  const payloadRecord = payload as Record<string, unknown>
  if (typeof payloadRecord.requestId !== 'string') {
    return undefined
  }

  return {
    requestId: payloadRecord.requestId,
    ok: typeof payloadRecord.ok === 'boolean' ? payloadRecord.ok : undefined,
    value: readResponseValue(payloadRecord),
  }
}

function readResponseValue(response: Record<string, unknown>): unknown {
  if ('result' in response) {
    return response.result
  }

  const { type: _type, requestId: _requestId, ...value } = response
  return value
}

function readResponseErrorMessage(response: unknown): string {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    return 'Gamelet request failed.'
  }

  const responseRecord = response as Record<string, unknown>
  if (typeof responseRecord.error === 'string') {
    return responseRecord.error
  }
  if (typeof responseRecord.message === 'string') {
    return responseRecord.message
  }

  return 'Gamelet request failed.'
}

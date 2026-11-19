import type { EventContext } from '@moeru/eventa'
import type { GameletIframeResponsePayload } from '@proj-airi/plugin-sdk-tamagotchi/gamelet'

import type {
  WidgetsIframeRequestPayload,
  WidgetsIframeRequestResultPayload,
} from '../../../../shared/eventa'

import { defineInvoke } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { gameletIframeRequest } from '@proj-airi/plugin-sdk-tamagotchi/gamelet'

export interface ExtensionUiIframeRequestHandlerInput {
  getContext: () => EventContext<any, any> | undefined
}

export interface ExtensionUiIframeRequestQueueProcessorInput {
  /** Returns whether this mounted iframe owns the request. */
  shouldHandle: (request: WidgetsIframeRequestPayload) => boolean
  /** Returns whether the iframe has announced its invoke handlers are ready. */
  isReady?: () => boolean
  /** Invokes the mounted iframe and returns its response record. */
  requestWidgetIframe: (request: WidgetsIframeRequestPayload) => Promise<GameletIframeResponsePayload>
  /** Emits one correlated request result back to the widget host. */
  emitResult: (result: WidgetsIframeRequestResultPayload) => void
}

function createTimeoutSignal(timeoutMs: number): { signal: AbortSignal, cleanup: () => void } {
  const timeout = (AbortSignal as typeof AbortSignal & {
    timeout?: (milliseconds: number) => AbortSignal
  }).timeout

  if (timeout) {
    return {
      signal: timeout(timeoutMs),
      cleanup: () => {},
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort(new DOMException('The operation timed out.', 'TimeoutError'))
  }, timeoutMs)

  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
  }
}

/**
 * Creates the renderer-side relay that invokes one mounted extension iframe.
 *
 * The widgets renderer receives host requests from Electron main, then this
 * helper forwards the request into the iframe Eventa context with the shared
 * gamelet invoke contract and caller-provided timeout budget.
 */
export function createExtensionUiIframeRequestHandler(input: ExtensionUiIframeRequestHandlerInput) {
  return async function requestWidgetIframe(request: WidgetsIframeRequestPayload) {
    const context = input.getContext()
    if (!context) {
      throw new Error(`Gamelet \`${request.id}\` iframe context is not ready.`)
    }

    const invokeGameletIframeRequest = defineInvoke(context, gameletIframeRequest)
    const timeoutSignal = createTimeoutSignal(request.timeoutMs)

    try {
      return await invokeGameletIframeRequest({
        requestId: request.requestId,
        payload: request.payload,
      }, {
        signal: timeoutSignal.signal,
      })
    }
    finally {
      timeoutSignal.cleanup()
    }
  }
}

/**
 * Creates a queue processor for iframe requests delivered through Vue props.
 *
 * Vue batches parent-to-child prop updates, so iframe requests must be modeled as
 * a queue instead of a single latest value. This processor deduplicates by
 * `requestId` and emits one correlated result for every unhandled request.
 */
export function createExtensionUiIframeRequestQueueProcessor(input: ExtensionUiIframeRequestQueueProcessorInput) {
  const handledRequestIds = new Set<string>()

  return function processIframeRequests(requests: readonly WidgetsIframeRequestPayload[] | undefined) {
    if (input.isReady && !input.isReady()) {
      return
    }

    for (const request of requests ?? []) {
      if (!input.shouldHandle(request) || handledRequestIds.has(request.requestId)) {
        continue
      }

      handledRequestIds.add(request.requestId)
      void input.requestWidgetIframe(request)
        .then((result) => {
          input.emitResult({
            id: request.id,
            requestId: request.requestId,
            ok: true,
            result,
          })
        })
        .catch((error: unknown) => {
          input.emitResult({
            id: request.id,
            requestId: request.requestId,
            ok: false,
            error: errorMessageFrom(error) ?? 'Gamelet request failed.',
          })
        })
    }
  }
}

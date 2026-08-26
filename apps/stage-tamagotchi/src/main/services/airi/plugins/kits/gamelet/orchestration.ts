import type { GameletKitRuntime } from '@proj-airi/plugin-sdk-tamagotchi/gamelet'
import type { HostDataRecord } from '@proj-airi/plugin-sdk/plugin-host'

import type { ExtensionHostGameletWidgetsManager } from '../../types'

const DEFAULT_REQUEST_TIMEOUT_MS = 30000

export interface GameletOrchestrationRuntime extends NonNullable<GameletKitRuntime['gamelets']> {
  dispose: () => void
}

/**
 * Creates the Electron host implementation for gamelet lifecycle and request calls.
 *
 * Use when:
 * - Built-in `kit.gamelet` clients need to open iframe-backed extension UI widgets
 * - Extension-side gamelet handles need request/response orchestration through widget iframe requests
 *
 * Expects:
 * - Widget ids are the same values as gamelet binding ids
 * - The widget manager owns iframe request correlation, timeout, and cleanup
 *
 * Returns:
 * - A gamelet orchestration runtime backed by the stage widget manager
 */
export function createGameletOrchestrationRuntime(
  widgetsManager: ExtensionHostGameletWidgetsManager,
): GameletOrchestrationRuntime {
  return {
    async close(bindingId) {
      await widgetsManager.removeWidget(bindingId)
    },
    async configure(bindingId, payload) {
      await widgetsManager.updateWidget({
        componentProps: createComponentProps(bindingId, payload),
        id: bindingId,
      })
    },
    dispose() {},
    async isOpen(bindingId) {
      return Boolean(widgetsManager.getWidgetSnapshot(bindingId))
    },
    async open(bindingId, payload) {
      const componentProps = createComponentProps(bindingId, payload ?? {})

      if (widgetsManager.getWidgetSnapshot(bindingId)) {
        await widgetsManager.updateWidget({
          componentProps,
          id: bindingId,
          size: 'l',
        })
      }
      else {
        await widgetsManager.pushWidget({
          componentName: 'extension-ui',
          componentProps,
          id: bindingId,
          size: 'l',
        })
      }

      await widgetsManager.openWindow({ id: bindingId })
    },
    async request<TResponse = HostDataRecord>(bindingId: string, payload: HostDataRecord, options?: { timeoutMs?: number }): Promise<TResponse> {
      if (!widgetsManager.getWidgetSnapshot(bindingId)) {
        throw new Error(`Gamelet \`${bindingId}\` is not open.`)
      }

      return await widgetsManager.requestWidgetIframe<Record<string, unknown> & TResponse>(
        bindingId,
        payload,
        {
          timeoutMs: options?.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
        },
      ) as TResponse
    },
  }
}

function createComponentProps(bindingId: string, payload: HostDataRecord): HostDataRecord {
  return {
    moduleId: bindingId,
    payload,
  }
}

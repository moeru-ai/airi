import type { CdpBridgeStatus } from '../browser-dom/cdp-bridge'
import type { ComputerUseConfig } from '../types'

import { CdpBridge } from '../browser-dom/cdp-bridge'

const DEFAULT_CDP_URL = 'http://localhost:9222'

export interface CdpAvailabilityStatus {
  endpoint: string
  connected: boolean
  connectable: boolean
  lastError?: string
}

export interface CdpBridgeManager {
  ensureBridge: (cdpUrl?: string) => Promise<CdpBridge>
  getStatus: () => CdpBridgeStatus
  probeAvailability: (cdpUrl?: string) => Promise<CdpAvailabilityStatus>
  close: () => Promise<void>
}

export function createCdpBridgeManager(config: ComputerUseConfig): CdpBridgeManager {
  let cdpBridge: CdpBridge | undefined
  let lastRequestedUrl = DEFAULT_CDP_URL

  return {
    async ensureBridge(cdpUrl?: string) {
      const url = cdpUrl || DEFAULT_CDP_URL
      lastRequestedUrl = url

      if (cdpBridge && cdpBridge.getStatus().connected && cdpBridge.getStatus().cdpUrl === url) {
        return cdpBridge
      }

      if (cdpBridge) {
        await cdpBridge.close()
      }

      cdpBridge = new CdpBridge({
        cdpUrl: url,
        requestTimeoutMs: config.browserDomBridge.requestTimeoutMs,
      })

      await cdpBridge.connect()
      return cdpBridge
    },

    getStatus() {
      return cdpBridge?.getStatus() ?? {
        cdpUrl: lastRequestedUrl,
        connected: false,
      }
    },

    async probeAvailability(cdpUrl?: string) {
      const endpoint = cdpUrl || lastRequestedUrl || DEFAULT_CDP_URL
      const connected = Boolean(cdpBridge?.getStatus().connected && cdpBridge.getStatus().cdpUrl === endpoint)

      try {
        const response = await fetch(`${endpoint}/json/list`)

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`)
        }

        const targets = await response.json() as Array<{ type?: string, webSocketDebuggerUrl?: string }>
        const connectable = targets.some(target => target.type === 'page' && typeof target.webSocketDebuggerUrl === 'string' && target.webSocketDebuggerUrl.length > 0)

        return {
          endpoint,
          connected,
          connectable,
          lastError: connectable ? undefined : 'No page target with WebSocket debugger URL was found.',
        }
      }
      catch (error) {
        return {
          endpoint,
          connected,
          connectable: false,
          lastError: error instanceof Error ? error.message : String(error),
        }
      }
    },

    async close() {
      if (!cdpBridge) {
        return
      }

      await cdpBridge.close()
      cdpBridge = undefined
    },
  }
}

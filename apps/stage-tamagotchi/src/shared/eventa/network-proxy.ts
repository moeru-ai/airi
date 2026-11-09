import type { InferOutput } from 'valibot'

import { defineEventa, defineInvokeEventa } from '@moeru/eventa'
import { check, object, picklist, pipe, string } from 'valibot'

/** Device settings for Chromium connections. Existing connections retain their current route. */
export const networkProxyConfigSchema = pipe(object({
  mode: picklist(['system', 'direct', 'custom']),
  address: string(),
  bypassRules: string(),
}), check((config) => {
  if (config.mode !== 'custom')
    return true
  try {
    const url = new URL(config.address)
    return ['http:', 'socks5:'].includes(url.protocol) && Boolean(url.hostname)
      && !url.username && !url.password && !url.search && !url.hash
      && (url.pathname === '/' || url.pathname === '')
      && (url.port !== '' || url.protocol === 'http:')
  }
  catch {
    return false
  }
}, 'Enter an HTTP or SOCKS5 proxy URL without credentials or a path.'))

export type NetworkProxyConfig = InferOutput<typeof networkProxyConfigSchema>

/** Availability is false if a failed update also failed to restore a Session. */
export interface NetworkProxyState {
  config: NetworkProxyConfig
  available: boolean
}

export const networkProxyGet = defineInvokeEventa<NetworkProxyState>('network-proxy:get')
export const networkProxySet = defineInvokeEventa<NetworkProxyState, NetworkProxyConfig>('network-proxy:set')
export const networkProxyChanged = defineEventa<NetworkProxyState>('network-proxy:changed')

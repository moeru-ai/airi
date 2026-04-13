import type { ServerChannelQrPayload } from '@proj-airi/stage-shared/server-channel-qr'

import { errorMessageFrom } from '@moeru/std'
import { Client, WebSocketEventSource } from '@proj-airi/server-sdk'

import { getHostWebSocketConstructor } from './websocket-bridge'

export async function probeServerChannelQrPayload(payload: ServerChannelQrPayload) {
  const websocketConstructor = getHostWebSocketConstructor()
  if (!websocketConstructor) {
    throw new Error('AIRI host websocket bridge is unavailable')
  }

  const errors: string[] = []

  for (const url of payload.urls) {
    const client = new Client({
      autoConnect: false,
      autoReconnect: false,
      connectTimeoutMs: 2_000,
      name: WebSocketEventSource.StageWeb,
      token: payload.authToken,
      url,
      websocketConstructor,
    })

    try {
      await client.connect({ timeout: 2_500 })
      client.close()
      return url
    }
    catch (error) {
      client.close()
      errors.push(`${url}: ${errorMessageFrom(error) ?? 'Unknown websocket probe error'}`)
    }
  }

  throw new Error(`No candidate server channel URL was reachable. ${errors.join('; ')}`)
}

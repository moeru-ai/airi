import type { WebSocketEvent } from '@proj-airi/server-shared/types'
import type { Peer } from 'crossws'
import { Format, LogLevel, setGlobalFormat, setGlobalLogLevel, useLogg } from '@guiiai/logg'
import { createApp, createRouter, defineWebSocketHandler } from 'h3'

setGlobalFormat(Format.Pretty)
setGlobalLogLevel(LogLevel.Log)

const appLogger = useLogg('App').useGlobalConfig()
const websocketLogger = useLogg('WebSocket').useGlobalConfig()

export const app = createApp({
  onError: error => appLogger.withError(error).error('an error occurred'),
})

const router = createRouter()
app.use(router)

const peers = new Set<Peer>()

router.get('/ws', defineWebSocketHandler({
  open: (peer) => {
    peers.add(peer)
    websocketLogger.withFields({ peer: peer.id, activePeers: peers.size }).log('connected')
  },
  message: (peer, message) => {
    const event = message.json() as WebSocketEvent

    switch (event.type) {
      case 'input:text':
        break
      case 'input:text:voice':
        break
    }

    for (const p of peers) {
      if (p.id !== peer.id) {
        p.send(JSON.stringify(event))
      }
    }
  },
  error: (peer, error) => {
    websocketLogger.withFields({ peer: peer.id }).withError(error).error('an error occurred')
  },
  close: (peer, details) => {
    websocketLogger.withFields({ peer: peer.id, details, activePeers: peers.size }).log('closed')
    peers.delete(peer)
  },
}))

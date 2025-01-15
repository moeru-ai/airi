import type { WebSocketEvent } from '@proj-airi/server-shared/types'
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

router.get('/ws', defineWebSocketHandler({
  open: (peer) => {
    websocketLogger.withFields({ peer: peer.id }).log('connected')
  },
  message: (peer, message) => {
    const event = message.json() as WebSocketEvent

    websocketLogger.withFields({ peer: peer.id, message: event }).log('received message')
    switch (event.type) {
      case 'input:text:voice':
        websocketLogger.withFields({ message: event }).log('transcribed')
        break
    }
  },
  error: (peer, error) => {
    websocketLogger.withFields({ peer: peer.id }).withError(error).error('an error occurred')
  },
  close: (peer, details) => {
    websocketLogger.withFields({ peer: peer.id, details }).log('closed')
  },
}))

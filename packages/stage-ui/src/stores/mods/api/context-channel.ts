import type { ChatStreamEvent, ContextMessage } from '../../../types/chat'

import { createContext, defineEventa, linkChannel } from '@moeru/eventa'
import { createContext as createBroadcastChannelContext } from '@moeru/eventa/adapters/broadcast-channel'

import { CHAT_STREAM_CHANNEL_NAME, CONTEXT_CHANNEL_NAME } from '../../chat/constants'

export const contextUpdateEvent = defineEventa<ContextMessage>('stage:context:update')
export const chatStreamEvent = defineEventa<ChatStreamEvent>('stage:chat:stream')

function createBroadcastLink(name: string) {
  const localContext = createContext()
  const broadcastChannel = new BroadcastChannel(name)
  const broadcast = createBroadcastChannelContext(broadcastChannel, { closeOnDispose: true })
  const link = linkChannel(localContext, broadcast.context)

  return {
    broadcastContext: broadcast.context,
    localContext,
    dispose(reason?: unknown) {
      link.dispose()
      broadcast.dispose(reason)
      localContext.abort(reason)
    },
  }
}

/**
 * Connects context updates and chat stream events across same-origin Stage contexts.
 *
 * Eventa owns delivery identity and loop suppression. The bridge owns both
 * BroadcastChannel instances and closes them during disposal.
 */
export function createContextChannel() {
  const contexts = createBroadcastLink(CONTEXT_CHANNEL_NAME)
  const stream = createBroadcastLink(CHAT_STREAM_CHANNEL_NAME)

  return {
    emitContext(message: ContextMessage) {
      return contexts.localContext.emit(contextUpdateEvent, message)
    },
    emitStream(event: ChatStreamEvent) {
      return stream.localContext.emit(chatStreamEvent, event)
    },
    onContext(listener: (message: ContextMessage) => void | Promise<void>) {
      return contexts.broadcastContext.on(contextUpdateEvent, (event, options) => {
        const message = event.body
        if (options?.raw.message && message)
          return listener(message)
      })
    },
    onStream(listener: (event: ChatStreamEvent) => void | Promise<void>) {
      return stream.broadcastContext.on(chatStreamEvent, (event, options) => {
        const message = event.body
        if (options?.raw.message && message)
          return listener(message)
      })
    },
    dispose(reason?: unknown) {
      contexts.dispose(reason)
      stream.dispose(reason)
    },
  }
}

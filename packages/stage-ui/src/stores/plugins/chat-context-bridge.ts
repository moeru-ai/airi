import type { ContextMessage } from '@proj-airi/server-sdk'

import type { ContextPayload } from '../chat'

import { useBroadcastChannel } from '@vueuse/core'
import { watch } from 'vue'

import { CONTEXT_CHANNEL_NAME, useChatStore } from '../chat'
import { useModsChannelServerStore } from '../mods/api/channel-server'

let installed = false

export function installChatContextBridge() {
  if (installed) {
    return {
      dispose: () => {},
    }
  }

  const chatStore = useChatStore()
  const modsChannelServer = useModsChannelServerStore()
  const { post: broadcastContext, data: incomingContext } = useBroadcastChannel<ContextMessage<ContextPayload>, ContextMessage<ContextPayload>>({
    name: CONTEXT_CHANNEL_NAME,
  })

  const stopIncomingWatch = watch(incomingContext, (event) => {
    if (event)
      chatStore.ingestContextMessage(event)
  })

  const offPublish = chatStore.onContextPublish((envelope, origin) => {
    if (origin !== 'broadcast')
      broadcastContext(envelope)

    if (origin === 'local')
      modsChannelServer.sendContextUpdate(envelope)
  })

  modsChannelServer.initialize({ possibleEvents: ['context:update'] }).catch(error => console.error('Context bridge init error:', error))
  const offWs = modsChannelServer.onContextUpdate((event) => {
    const envelope = event.data as ContextMessage<ContextPayload, Record<string, unknown>>
    chatStore.ingestContextMessage(envelope)
    broadcastContext(envelope)
  })

  installed = true

  return {
    dispose: () => {
      stopIncomingWatch()
      offPublish()
      offWs?.()
      installed = false
    },
  }
}

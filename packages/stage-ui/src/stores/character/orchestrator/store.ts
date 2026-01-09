import type { WebSocketBaseEvent, WebSocketEvents } from '@proj-airi/server-sdk'

import { defineStore, storeToRefs } from 'pinia'
import { ref } from 'vue'

import { useCharacterStore } from '../'
import { useLLM } from '../../llm'
import { useModsServerChannelStore } from '../../mods/api/channel-server'
import { useConsciousnessStore } from '../../modules/consciousness'
import { useProvidersStore } from '../../providers'
import { setupAgentSparkNotifyHandler } from './agents/event-handler-spark-notify'

export { sparkCommandSchema } from './agents/event-handler-spark-notify'

export const useCharacterOrchestratorStore = defineStore('character-orchestrator', () => {
  const { stream } = useLLM()
  const { activeProvider, activeModel } = storeToRefs(useConsciousnessStore())
  const providersStore = useProvidersStore()
  const characterStore = useCharacterStore()
  const { systemPrompt } = storeToRefs(characterStore)
  const modsServerChannelStore = useModsServerChannelStore()

  const processing = ref(false)
  const pendingNotifies = ref<Array<WebSocketBaseEvent<'spark:notify', WebSocketEvents['spark:notify']>>>([])
  const sparkNotifyAgent = setupAgentSparkNotifyHandler({
    stream,
    getActiveProvider: () => activeProvider.value,
    getActiveModel: () => activeModel.value,
    getProviderInstance: name => providersStore.getProviderInstance(name),
    onReactionDelta: (eventId, text) => characterStore.onSparkNotifyReactionStreamEvent(eventId, text),
    onReactionEnd: (eventId, text) => characterStore.onSparkNotifyReactionStreamEnd(eventId, text),
    getSystemPrompt: () => systemPrompt.value,
    getProcessing: () => processing.value,
    setProcessing: next => processing.value = next,
    getPending: () => pendingNotifies.value,
    setPending: next => pendingNotifies.value = next,
  })

  async function handleSparkEmit(_: WebSocketBaseEvent<'spark:emit', WebSocketEvents['spark:emit']>) {
    // Currently no-op
    return undefined
  }

  function initialize() {
    modsServerChannelStore.onEvent('spark:notify', async (event) => {
      try {
        const result = await sparkNotifyAgent.handle(event)
        if (!result?.commands?.length)
          return

        for (const command of result.commands) {
          modsServerChannelStore.send({
            type: 'spark:command',
            data: command,
          })
        }
      }
      catch (error) {
        console.warn('Failed to handle spark:notify event:', error)
      }
    })

    modsServerChannelStore.onEvent('spark:emit', async (event) => {
      try {
        await handleSparkEmit(event)
      }
      catch (error) {
        console.warn('Failed to handle spark:emit event:', error)
      }
    })
  }

  return {
    processing,
    pendingNotifies,

    initialize,

    handleSparkNotify: sparkNotifyAgent.handle,
    handleSparkEmit,
  }
})

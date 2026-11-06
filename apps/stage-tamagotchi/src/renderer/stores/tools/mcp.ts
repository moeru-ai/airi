import type { ExecutableTool } from '@proj-airi/stage-ui/stores/ai/chat-llm/tools'

import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { getSpeechBusContext, voiceGenerationEnded } from '@proj-airi/stage-ui/services/speech/bus'
import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/ai/chat-llm/tools'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { TOOL_ICONS } from '@proj-airi/stage-ui/tools/icons'
import { createMcpTools } from '@proj-airi/stage-ui/tools/mcp'
import { defineStore } from 'pinia'
import { onScopeDispose } from 'vue'

import { electronMcpCallTool, electronMcpListTools } from '../../../shared/eventa'
import { chatRequestCancel, chatRequestFinish, chatRequestRegister } from '../../../shared/eventa/terminal-approval'

export const useTamagotchiMcpToolsStore = defineStore('tamagotchi-mcp-tools', () => {
  const llmToolsStore = useLlmToolsStore()
  const listMcpTools = useElectronEventaInvoke(electronMcpListTools)
  const callMcpTool = useElectronEventaInvoke(electronMcpCallTool)
  const registerRequest = useElectronEventaInvoke(chatRequestRegister)
  const finishRequest = useElectronEventaInvoke(chatRequestFinish)
  const cancelRequest = useElectronEventaInvoke(chatRequestCancel)
  const toolIdPrefix = 'mcp:'
  // Correlation cache only. Main owns the original input, permitted Runtime source and all approval state.
  const requests = new Map<string, string>()
  const cancellations = new WeakMap<AbortSignal, Set<string>>()
  const keyOf = (sessionId: string, turnId?: string) => JSON.stringify([sessionId, turnId])
  const stopBeforeSend = useChatStore().onBeforeSend(async (text, { sessionId, turnId }) => {
    const registered = await registerRequest({ sessionId, turnId, text })
    if (registered.requestId)
      requests.set(keyOf(sessionId, turnId), registered.requestId)
  })
  // Completion can only remove admission. A broadcast never creates or approves an operation.
  const stopEnded = getSpeechBusContext().on(voiceGenerationEnded, ({ body }) => {
    if (!body)
      return
    const key = keyOf(body.sessionId, body.turnId)
    const requestId = requests.get(key)
    if (!requestId)
      return
    requests.delete(key)
    const end = body.status === 'finished' ? finishRequest : cancelRequest
    void end({ requestId }).catch(error => console.warn('[MCP] Failed to close a Host request:', error))
  })
  onScopeDispose(() => {
    stopBeforeSend()
    stopEnded()
    for (const requestId of requests.values())
      void cancelRequest({ requestId }).catch(() => {})
    requests.clear()
  })

  function registeredToolIds() {
    return llmToolsStore.tools
      .filter(tool => tool.id.startsWith(toolIdPrefix))
      .map(tool => tool.id)
  }

  async function refresh() {
    const tools = await Promise.all(createMcpTools({
      listTools: () => listMcpTools(),
      callTool: async (payload, options) => {
        const attribution = options?.attribution
        const requestId = attribution ? requests.get(keyOf(attribution.sessionId, attribution.turnId)) : undefined
        const signal = options?.abortSignal
        if (requestId && signal) {
          if (signal.aborted) {
            await cancelRequest({ requestId })
            signal.throwIfAborted()
          }
          let bound = cancellations.get(signal)
          if (!bound) {
            bound = new Set()
            cancellations.set(signal, bound)
          }
          if (!bound.has(requestId)) {
            bound.add(requestId)
            signal.addEventListener('abort', () => {
              void cancelRequest({ requestId }).catch(() => {})
            }, { once: true })
          }
        }
        return callMcpTool({ ...payload, requestId, attribution }, { signal })
      },
    }))

    llmToolsStore.removeToolsByIds(...registeredToolIds())
    llmToolsStore.addTools(...tools.map(tool => ({
      ...tool,
      icon: TOOL_ICONS.mcp,
      id: `${toolIdPrefix}${tool.function.name}`,
    } satisfies ExecutableTool)))
  }

  function dispose() {
    llmToolsStore.removeToolsByIds(...registeredToolIds())
  }

  return {
    dispose,
    refresh,
  }
}, {
  synced: {
    actions: ['dispose', 'refresh'],
    state: false,
  },
})

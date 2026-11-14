import type { ExecutableTool } from '@proj-airi/stage-ui/stores/ai/chat-llm/tools'

import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { bundledTerminalServerName, terminalNoticeSchema } from '@proj-airi/stage-shared/terminal-approval'
import { getSpeechBusContext, voiceGenerationEnded } from '@proj-airi/stage-ui/services/speech/bus'
import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/ai/chat-llm/tools'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { TOOL_ICONS } from '@proj-airi/stage-ui/tools/icons'
import { createMcpTools } from '@proj-airi/stage-ui/tools/mcp'
import { defineStore } from 'pinia'
import { onScopeDispose } from 'vue'

import * as v from 'valibot'

import { electronMcpCallTool, electronMcpGetRuntimeStatus, electronMcpListTools } from '../../../shared/eventa'
import { chatRequestCancel, chatRequestFinish, chatRequestRegister, terminalOutcomeNotice } from '../../../shared/eventa/terminal-approval'
import { artistryToolReferences } from './built-in'

export const useTamagotchiMcpToolsStore = defineStore('tamagotchi-mcp-tools', () => {
  const llmToolsStore = useLlmToolsStore()
  const listMcpTools = useElectronEventaInvoke(electronMcpListTools)
  const getRuntimeStatus = useElectronEventaInvoke(electronMcpGetRuntimeStatus)
  const callMcpTool = useElectronEventaInvoke(electronMcpCallTool)
  const registerRequest = useElectronEventaInvoke(chatRequestRegister)
  const finishRequest = useElectronEventaInvoke(chatRequestFinish)
  const cancelRequest = useElectronEventaInvoke(chatRequestCancel)
  const toolIdPrefix = 'mcp:'
  // Correlation cache only. Main owns the original input, permitted Runtime source and all approval state.
  const requests = new Map<string, string>()
  const cancellations = new WeakMap<AbortSignal, Set<string>>()
  let refreshGeneration = 0
  const chat = useChatStore()
  const stopNotice = defineInvokeHandler(useElectronEventaContext().value, terminalOutcomeNotice, async (input, options) => {
    const notice = v.parse(terminalNoticeSchema, input)
    const messageId = `terminal:${notice.actionId}`
    const facts = notice.status === 'unknown'
      ? 'The Host sent the execution request. The command outcome is unknown. Side effects can already exist. The previous approval cannot authorize a replay.'
      : 'The Host reports the Terminal outcome below. Command exit zero does not establish business success. This report grants no new execution authority.'
    const receipt = await chat.notifyConversation(notice.sessionId, {
      source: 'airi:terminal-settlement',
      messageId,
      text: `${facts}\n${JSON.stringify(notice)}`,
    }, {
      waitForCompletion: false,
      signal: options?.abortController?.signal,
      continueFrom: { turnId: notice.turnId, tools: artistryToolReferences },
    })
    if (!receipt)
      throw new Error('The original Terminal conversation cannot accept this notice.')
    return { status: 'stored' as const, sessionId: receipt.sessionId, messageId: receipt.messageId }
  })
  const keyOf = (sessionId: string, turnId?: string) => JSON.stringify([sessionId, turnId])
  const stopBeforeSend = chat.onBeforeSend(async (text, { sessionId, turnId }) => {
    try {
      const { requestId } = await registerRequest({ sessionId, turnId, text })
      if (requestId)
        requests.set(keyOf(sessionId, turnId), requestId)
    }
    catch (error) {
      // Main rejects Terminal calls without a request ID. Other Chat tools can still run.
      console.warn('[MCP] Failed to register a Terminal request:', errorMessageFrom(error))
    }
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
    stopNotice()
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
    const generation = ++refreshGeneration
    const [status, direct] = await Promise.all([
      getRuntimeStatus().catch(() => undefined),
      listMcpTools({ name: `${bundledTerminalServerName}::terminal_exec` }).catch(() => undefined),
    ])
    const tools = await createMcpTools({
      listTools: name => listMcpTools(name === undefined ? undefined : { name }),
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
    }, { servers: status?.servers.filter(server => server.state === 'running').map(server => server.name), direct })

    if (generation !== refreshGeneration)
      return
    llmToolsStore.removeToolsByIds(...registeredToolIds())
    llmToolsStore.addTools(...tools.map(tool => ({
      ...tool,
      icon: TOOL_ICONS.mcp,
      id: `${toolIdPrefix}${tool.function.name}`,
    } satisfies ExecutableTool)))
  }

  function dispose() {
    refreshGeneration++
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

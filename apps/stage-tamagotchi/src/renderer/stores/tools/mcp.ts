import type { ExecutableTool } from '@proj-airi/stage-ui/stores/ai/chat-llm/tools'

import { defineInvokeHandler } from '@moeru/eventa'
import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { bundledTerminalServerName, terminalNoticeSchema, terminalNoticeText } from '@proj-airi/stage-shared/terminal-approval'
import { getSpeechBusContext, voiceGenerationEnded } from '@proj-airi/stage-ui/services/speech/bus'
import { useLlmToolsStore } from '@proj-airi/stage-ui/stores/ai/chat-llm/tools'
import { useLlmToolsetPromptsStore } from '@proj-airi/stage-ui/stores/ai/chat-llm/toolset-prompts'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { TOOL_ICONS } from '@proj-airi/stage-ui/tools/icons'
import { createMcpTools, MCP_AGENT_EXECUTION_PROMPT } from '@proj-airi/stage-ui/tools/mcp'
import { defineStore } from 'pinia'
import { onScopeDispose } from 'vue'

import * as v from 'valibot'

import { electronMcpCallTool, electronMcpGetRuntimeStatus, electronMcpListTools } from '../../../shared/eventa'
import { chatRequestCancel, chatRequestFinish, chatRequestRegister, terminalOutcomeNotice } from '../../../shared/eventa/terminal-approval'
import { artistryToolReferences } from './built-in'

export const useTamagotchiMcpToolsStore = defineStore('tamagotchi-mcp-tools', () => {
  const llmToolsStore = useLlmToolsStore()
  const llmToolsetPromptsStore = useLlmToolsetPromptsStore()
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
    const receipt = await chat.notifyConversation(notice.sessionId, {
      source: 'airi:terminal-settlement',
      messageId,
      text: terminalNoticeText(notice),
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
  // A rerun executes tools without a submission of its own. The chat store announces the rerun with its own turn
  // label, so the controlled tools of that execution get an admission that matches their attribution.
  const stopToolCallRerun = chat.onToolCallRerun(async ({ sessionId, turnId, toolName }) => {
    // Only an MCP tool can be Host-controlled. Every other rerun stays local, and the Host needs no record of it.
    if (!llmToolsStore.tools.some(tool => tool.id === `${toolIdPrefix}${toolName}`))
      return
    try {
      const { requestId } = await registerRequest({ sessionId, turnId, text: '' })
      if (requestId)
        requests.set(keyOf(sessionId, turnId), requestId)
    }
    catch (error) {
      console.warn('[MCP] Failed to register a rerun request:', errorMessageFrom(error))
    }
  })
  // Admission ends with the rerun, even when the tool threw or the history write failed.
  const stopToolCallRerunEnd = chat.onToolCallRerunEnd(async ({ sessionId, turnId }) => {
    const key = keyOf(sessionId, turnId)
    const requestId = requests.get(key)
    if (!requestId)
      return
    requests.delete(key)
    await finishRequest({ requestId }).catch(error => console.warn('[MCP] Failed to close a rerun request:', error))
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
    stopToolCallRerun()
    stopToolCallRerunEnd()
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
    const [status, catalog] = await Promise.all([
      getRuntimeStatus().catch(() => undefined),
      listMcpTools({}).catch(() => undefined),
    ])
    const proxyServers = [...new Set([
      ...(status?.servers.filter(server => server.state === 'running').map(server => server.name) ?? []),
      ...(catalog?.map(tool => tool.serverName) ?? []),
    ])].filter(serverName => serverName !== bundledTerminalServerName)
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
    }, {
      servers: status?.servers.filter(server => server.state === 'running').map(server => server.name),
      direct: catalog,
      proxyServers,
      proxy: proxyServers.length ? 'explicit' : 'none',
    })

    if (generation !== refreshGeneration)
      return

    const hasRunningMcp = Boolean(status?.servers.some(server => server.state === 'running') || catalog?.length)
    if (hasRunningMcp) {
      llmToolsetPromptsStore.registerToolsetPrompts('mcp-tools', [{
        id: 'agent-execution',
        title: 'Agent execution',
        content: MCP_AGENT_EXECUTION_PROMPT,
      }])
    }
    else {
      llmToolsetPromptsStore.clearToolsetPrompts('mcp-tools')
    }

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
    llmToolsetPromptsStore.clearToolsetPrompts('mcp-tools')
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

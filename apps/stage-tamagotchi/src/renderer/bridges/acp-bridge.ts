import type { AcpBridgeCapabilities, AcpBridgeStreamEvent, AcpBridgeTranscriptMessage } from '@proj-airi/acp-server/bridge'
import type { ChatHistoryItem } from '@proj-airi/stage-ui/types/chat'
import type { AcpClientLink } from '@proj-airi/stage-ui/types/chat-session'

import { defineInvokeHandler } from '@moeru/eventa'
import { getElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { usePiniaSynced } from '@proj-airi/stage-ui/libs/pinia'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { storeToRefs } from 'pinia'

import {
  electronAcpCallTool,
  electronAcpCancel,
  electronAcpCloseSession,
  electronAcpDisconnected,
  electronAcpLeaderChannel,
  electronAcpListSessions,
  electronAcpLoadSession,
  electronAcpOpenSession,
  electronAcpPrompt,
  electronAcpPublish,
} from '../../shared/eventa'
import { createAcpClientTools } from './acp-client-tools'

/** Registers the ACP bridge on the Pinia leader, where chat send runs. */
export function registerAcpBridge() {
  const syncedPinia = usePiniaSynced()
  const chatStore = useChatStore()
  const sessionStore = useChatSessionStore()
  const cardStore = useAiriCardStore()
  const { sessionMetas } = storeToRefs(sessionStore)
  const publish = useElectronEventaInvoke(electronAcpPublish)
  const callTool = useElectronEventaInvoke(electronAcpCallTool)
  const listSessions = useElectronEventaInvoke(electronAcpListSessions)
  const cancelling = new Set<string>()
  const prompting = new Set<string>()
  let disposeHandlers: (() => void) | undefined

  function toolsFor(sessionId: string, capabilities: AcpBridgeCapabilities, hasMcp: boolean) {
    return Promise.all(createAcpClientTools({
      capabilities,
      hasMcp,
      call: async (call) => {
        const result = await callTool({ chatSessionId: sessionId, call })
        return result.text
      },
    }))
  }

  function connectLink(sessionId: string, capabilities: AcpBridgeCapabilities, hasMcp: boolean) {
    chatStore.setSessionToolProvider(sessionId, () => toolsFor(sessionId, capabilities, hasMcp))
    chatStore.setSessionStreamListener(sessionId, async (event) => {
      const bridgeEvent = bridgeStreamEvent(event)
      if (!bridgeEvent)
        return
      await publish({ chatSessionId: sessionId, event: bridgeEvent })
    })
  }

  function disconnectLink(sessionId: string) {
    chatStore.setSessionToolProvider(sessionId, undefined)
    chatStore.setSessionStreamListener(sessionId, undefined)
  }

  async function reconcileSessions() {
    const live = new Set((await listSessions()).chatSessionIds)
    for (const meta of Object.values(sessionMetas.value)) {
      if (meta.acpClient?.status !== 'connected')
        continue
      if (live.has(meta.sessionId)) {
        connectLink(meta.sessionId, meta.acpClient, meta.acpClient.hasMcp)
        continue
      }
      disconnectLink(meta.sessionId)
      await sessionStore.setAcpClientLink(meta.sessionId, disconnectedLink(meta.acpClient))
    }
  }

  function installHandlers() {
    const context = getElectronEventaContext()

    async function markDisconnected(chatSessionId: string) {
      disconnectLink(chatSessionId)
      await sessionStore.setAcpClientLink(chatSessionId, disconnectedLink(sessionMetas.value[chatSessionId]?.acpClient))
      return { ok: true as const }
    }

    const stops = [
      defineInvokeHandler(context, electronAcpOpenSession, async (body) => {
        const chatSessionId = await sessionStore.createSession(cardStore.activeCardId, { setActive: false })
        await sessionStore.setAcpClientLink(chatSessionId, { status: 'connected', ...body.capabilities, hasMcp: body.hasMcp })
        connectLink(chatSessionId, body.capabilities, body.hasMcp)
        return { chatSessionId }
      }),
      defineInvokeHandler(context, electronAcpLoadSession, async (body) => {
        if (!await sessionStore.loadSession(body.chatSessionId) || !sessionMetas.value[body.chatSessionId])
          throw new Error('Unknown session')
        await sessionStore.setAcpClientLink(body.chatSessionId, {
          status: 'connected',
          ...body.capabilities,
          hasMcp: body.hasMcp,
        })
        connectLink(body.chatSessionId, body.capabilities, body.hasMcp)
        return { messages: transcriptMessages(sessionStore.getSessionMessages(body.chatSessionId)) }
      }),
      defineInvokeHandler(context, electronAcpPrompt, async (body) => {
        await sessionStore.setAcpClientLink(body.chatSessionId, {
          status: 'connected',
          ...body.capabilities,
          hasMcp: body.hasMcp,
        })
        connectLink(body.chatSessionId, body.capabilities, body.hasMcp)
        prompting.add(body.chatSessionId)
        try {
          await chatStore.send({
            sessionId: body.chatSessionId,
            text: body.text,
            attachments: body.attachments,
          })
          if (cancelling.has(body.chatSessionId))
            return { stopReason: 'cancelled' as const }
          return { stopReason: 'end_turn' as const }
        }
        catch (error) {
          if (cancelling.has(body.chatSessionId))
            return { stopReason: 'cancelled' as const }
          throw error
        }
        finally {
          prompting.delete(body.chatSessionId)
          cancelling.delete(body.chatSessionId)
        }
      }),
      defineInvokeHandler(context, electronAcpCancel, ({ chatSessionId }) => {
        cancelling.add(chatSessionId)
        chatStore.cancelPendingSends(chatSessionId)
        return { ok: true as const }
      }),
      defineInvokeHandler(context, electronAcpCloseSession, ({ chatSessionId }) => markDisconnected(chatSessionId)),
      defineInvokeHandler(context, electronAcpDisconnected, ({ chatSessionId }) => markDisconnected(chatSessionId)),
      chatStore.onBeforeSend(async (message, context) => {
        if (!message.trim() || prompting.has(context.sessionId))
          return
        if (sessionMetas.value[context.sessionId]?.acpClient?.status !== 'connected')
          return
        await publish({ chatSessionId: context.sessionId, event: { type: 'user-message', text: message } })
      }),
      chatStore.onTokenLiteral(async (literal, context) => {
        if (!literal || sessionMetas.value[context.sessionId]?.acpClient?.status !== 'connected')
          return
        await publish({ chatSessionId: context.sessionId, event: { type: 'text-delta', text: literal } })
      }),
    ]
    return () => {
      for (const stop of stops)
        stop()
    }
  }

  function syncLeadership() {
    disposeHandlers?.()
    disposeHandlers = undefined
    if (!syncedPinia.isLeader())
      return
    disposeHandlers = installHandlers()
    void window.electron.ipcRenderer.invoke(electronAcpLeaderChannel).then(() => reconcileSessions())
  }

  const stopLeadership = syncedPinia.onLeadershipChange(() => {
    syncLeadership()
  })
  syncLeadership()

  return () => {
    stopLeadership()
    disposeHandlers?.()
  }
}

function disconnectedLink(current: AcpClientLink | undefined) {
  return {
    status: 'disconnected' as const,
    readTextFile: current?.readTextFile ?? false,
    writeTextFile: current?.writeTextFile ?? false,
    terminal: current?.terminal ?? false,
    elicitForm: current?.elicitForm ?? false,
    hasMcp: current?.hasMcp ?? false,
  }
}

function bridgeStreamEvent(event: {
  type: string
  text?: string
  toolCallId?: string
  toolName?: string
  args?: unknown
  result?: unknown
}): AcpBridgeStreamEvent | undefined {
  if (event.type === 'reasoning-delta' && typeof event.text === 'string')
    return { type: event.type, text: event.text }
  if (event.type === 'tool-call' && event.toolCallId && event.toolName) {
    return {
      type: 'tool-call',
      toolCallId: event.toolCallId,
      toolName: event.toolName,
      args: typeof event.args === 'string' ? event.args : JSON.stringify(event.args ?? {}),
    }
  }
  if ((event.type === 'tool-result' || event.type === 'tool-error') && event.toolCallId) {
    return {
      type: event.type,
      toolCallId: event.toolCallId,
      result: typeof event.result === 'string' ? event.result : JSON.stringify(event.result ?? ''),
    }
  }
  return undefined
}

function transcriptMessages(messages: ChatHistoryItem[]): AcpBridgeTranscriptMessage[] {
  return messages.flatMap((message) => {
    const line = transcriptLine(message)
    return line ? [line] : []
  })
}

function transcriptLine(message: ChatHistoryItem): AcpBridgeTranscriptMessage | undefined {
  if (message.role === 'user') {
    const text = textFromContent(message.content).trim()
    return text ? { role: 'user', text } : undefined
  }
  if (message.role !== 'assistant')
    return undefined
  const speech = message.categorization?.speech.trim()
  if (speech)
    return { role: 'assistant', text: speech }
  const text = message.slices.flatMap(slice => slice.type === 'text' ? [slice.text] : []).join('').trim()
  return text ? { role: 'assistant', text } : undefined
}

function textFromContent(content: ChatHistoryItem['content']): string {
  if (typeof content === 'string')
    return content
  if (!Array.isArray(content))
    return ''
  return content.flatMap((part) => {
    if (typeof part === 'object' && part !== null && 'type' in part && part.type === 'text' && 'text' in part && typeof part.text === 'string')
      return [part.text]
    return []
  }).join('')
}

import type { ChatHistoryItem } from '@proj-airi/stage-ui/types/chat'

import { useChatOrchestratorStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useChatStreamStore } from '@proj-airi/stage-ui/stores/chat/stream-store'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { storeToRefs } from 'pinia'

interface AiriDebugEvent {
  at: string
  type: string
  detail?: Record<string, unknown>
}

interface AiriDebugSnapshot {
  at: string
  route: string
  documentTitle: string
  provider: {
    activeProvider: string
    activeModel: string
    configured: boolean
    providerAvailable: boolean
  }
  chat: {
    activeSessionId: string
    messageCount: number
    sending: boolean
    streamingText: string
    streamingSliceCount: number
    streamingToolResultCount: number
    lastMessage?: {
      role?: string
      text: string
      createdAt?: number
    }
    recentEvents: AiriDebugEvent[]
    lastTurnComplete?: {
      at: string
      outputText: string
      toolCallCount: number
    }
  }
  dom: {
    hasTextarea: boolean
    textareaValueLength: number
    textareaPlaceholder?: string | null
    focusedTagName?: string
  }
}

const CHAT_OPEN_CHANNEL = 'eventa:invoke:electron:windows:chat:open'
const MAX_EVENT_HISTORY = 80

function toMessageText(message?: ChatHistoryItem) {
  if (!message)
    return ''

  if (typeof message.content === 'string') {
    return message.content
  }

  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => {
        if (typeof part === 'string') {
          return part
        }

        if (part && typeof part === 'object' && 'text' in part) {
          return String(part.text ?? '')
        }

        return ''
      })
      .join('')
  }

  return ''
}

function trimPreview(text: string, max = 240) {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (normalized.length <= max) {
    return normalized
  }

  return `${normalized.slice(0, max - 3)}...`
}

function toStreamingText(value: unknown) {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (!part || typeof part !== 'object') {
          return ''
        }

        if ('text' in part) {
          return String(part.text ?? '')
        }

        if ('refusal' in part) {
          return String(part.refusal ?? '')
        }

        return ''
      })
      .join('')
  }

  return ''
}

export function installAiriDebugBridge(params?: {
  navigateTo?: (path: string) => Promise<unknown> | unknown
}) {
  if (!import.meta.env.DEV) {
    return () => {}
  }

  const chatOrchestrator = useChatOrchestratorStore()
  const chatSession = useChatSessionStore()
  const chatStream = useChatStreamStore()
  const consciousnessStore = useConsciousnessStore()
  const providersStore = useProvidersStore()

  const { sending } = storeToRefs(chatOrchestrator)
  const { activeSessionId } = storeToRefs(chatSession)
  const { streamingMessage } = storeToRefs(chatStream)
  const { activeProvider, activeModel, configured } = storeToRefs(consciousnessStore)
  const { availableProviders } = storeToRefs(providersStore)

  const recentEvents: AiriDebugEvent[] = []
  let lastTurnComplete: AiriDebugSnapshot['chat']['lastTurnComplete']

  const pushEvent = (type: string, detail?: Record<string, unknown>) => {
    recentEvents.push({
      at: new Date().toISOString(),
      type,
      detail,
    })

    if (recentEvents.length > MAX_EVENT_HISTORY) {
      recentEvents.splice(0, recentEvents.length - MAX_EVENT_HISTORY)
    }
  }

  const stopBeforeSend = chatOrchestrator.onBeforeSend(async (message) => {
    pushEvent('before-send', {
      messagePreview: trimPreview(message),
      sessionId: activeSessionId.value,
    })
  })

  const stopTokenLiteral = chatOrchestrator.onTokenLiteral(async (literal) => {
    const currentStreamingText = toStreamingText(streamingMessage.value.content)
    pushEvent('token-literal', {
      literalPreview: trimPreview(literal, 120),
      literalLength: literal.length,
      accumulatedLength: currentStreamingText.length + literal.length,
    })
  })

  const stopStreamEnd = chatOrchestrator.onStreamEnd(async () => {
    const currentStreamingText = toStreamingText(streamingMessage.value.content)
    pushEvent('stream-end', {
      sessionId: activeSessionId.value,
      currentStreamingLength: currentStreamingText.length,
    })
  })

  const stopAssistantResponseEnd = chatOrchestrator.onAssistantResponseEnd(async (message) => {
    pushEvent('assistant-response-end', {
      outputPreview: trimPreview(message),
      outputLength: message.length,
    })
  })

  const stopChatTurnComplete = chatOrchestrator.onChatTurnComplete(async (chat) => {
    lastTurnComplete = {
      at: new Date().toISOString(),
      outputText: trimPreview(chat.outputText, 400),
      toolCallCount: chat.toolCalls.length,
    }

    pushEvent('chat-turn-complete', {
      outputPreview: trimPreview(chat.outputText),
      outputLength: chat.outputText.length,
      toolCallCount: chat.toolCalls.length,
    })
  })

  const bridge = {
    async openChat() {
      return await window.electron.ipcRenderer.invoke(CHAT_OPEN_CHANNEL)
    },

    async navigateTo(path: string) {
      if (params?.navigateTo) {
        return await params.navigateTo(path)
      }

      window.location.hash = `#${path}`
      return window.location.hash
    },

    clearEvents() {
      recentEvents.splice(0, recentEvents.length)
      lastTurnComplete = undefined
    },

    getSnapshot(): AiriDebugSnapshot {
      const sessionId = activeSessionId.value
      const messages = sessionId ? chatSession.getSessionMessages(sessionId) : []
      const lastMessage = messages.at(-1)
      const textarea = document.querySelector('textarea.ph-no-capture') as HTMLTextAreaElement | null
      const activeElement = document.activeElement as HTMLElement | null
      const streamingText = toStreamingText(streamingMessage.value.content)

      return {
        at: new Date().toISOString(),
        route: window.location.hash,
        documentTitle: document.title,
        provider: {
          activeProvider: activeProvider.value,
          activeModel: activeModel.value,
          configured: configured.value,
          providerAvailable: availableProviders.value.includes(activeProvider.value),
        },
        chat: {
          activeSessionId: sessionId,
          messageCount: messages.length,
          sending: sending.value,
          streamingText,
          streamingSliceCount: streamingMessage.value.slices.length,
          streamingToolResultCount: streamingMessage.value.tool_results.length,
          lastMessage: lastMessage
            ? {
                role: lastMessage.role,
                text: trimPreview(toMessageText(lastMessage), 280),
                createdAt: lastMessage.createdAt,
              }
            : undefined,
          recentEvents: recentEvents.slice(-20),
          lastTurnComplete,
        },
        dom: {
          hasTextarea: Boolean(textarea),
          textareaValueLength: textarea?.value.length || 0,
          textareaPlaceholder: textarea?.getAttribute('placeholder'),
          focusedTagName: activeElement?.tagName,
        },
      }
    },
  }

  ;(globalThis as typeof globalThis & { __AIRI_DEBUG__?: typeof bridge }).__AIRI_DEBUG__ = bridge

  return () => {
    stopBeforeSend()
    stopTokenLiteral()
    stopStreamEnd()
    stopAssistantResponseEnd()
    stopChatTurnComplete()

    delete (globalThis as typeof globalThis & { __AIRI_DEBUG__?: typeof bridge }).__AIRI_DEBUG__
  }
}

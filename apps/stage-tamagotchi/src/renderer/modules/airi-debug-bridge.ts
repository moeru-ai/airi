import type { McpCallToolPayload } from '@proj-airi/stage-ui/stores/mcp-tool-bridge'
import type { ChatHistoryItem } from '@proj-airi/stage-ui/types/chat'
import type { ChatProvider } from '@xsai-ext/providers/utils'

import { useChatOrchestratorStore } from '@proj-airi/stage-ui/stores/chat'
import { useChatMaintenanceStore } from '@proj-airi/stage-ui/stores/chat/maintenance'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useChatStreamStore } from '@proj-airi/stage-ui/stores/chat/stream-store'
import { getMcpToolBridge } from '@proj-airi/stage-ui/stores/mcp-tool-bridge'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useDiscordStore } from '@proj-airi/stage-ui/stores/modules/discord'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { storeToRefs } from 'pinia'

import { widgetsTools } from '../stores/tools/builtin/widgets'
import { countChatTurnToolMetrics } from './airi-debug-bridge-metrics'

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
      toolResultCount: number
    }
  }
  dom: {
    hasTextarea: boolean
    textareaValueLength: number
    textareaPlaceholder?: string | null
    focusedTagName?: string
  }
  discord: {
    enabled: boolean
    configured: boolean
    tokenLength: number
    hasCheckbox: boolean
    hasTokenInput: boolean
    hasSaveButton: boolean
  }
}

interface EnsureConsciousnessSelectionParams {
  provider: string
  preferredModels: string[]
  providerConfig?: Record<string, unknown>
}

const MAX_EVENT_HISTORY = 80

function resolvePreferredModelId(preferredModels: string[], availableModelIds: string[]) {
  const normalizedAvailable = availableModelIds.map(id => ({
    id,
    lower: id.toLowerCase(),
  }))

  for (const preferredModel of preferredModels) {
    const normalizedPreferredModel = preferredModel.trim().toLowerCase()
    if (!normalizedPreferredModel) {
      continue
    }

    const exactMatch = normalizedAvailable.find(model => model.lower === normalizedPreferredModel)
    if (exactMatch) {
      return exactMatch.id
    }

    const suffixMatch = normalizedAvailable.find((model) => {
      return model.lower.endsWith(`/${normalizedPreferredModel}`)
        || normalizedPreferredModel.endsWith(`/${model.lower}`)
    })
    if (suffixMatch) {
      return suffixMatch.id
    }
  }

  return undefined
}

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
  openChat?: () => Promise<unknown> | unknown
  navigateTo?: (path: string) => Promise<unknown> | unknown
}) {
  if (!import.meta.env.DEV) {
    return () => {}
  }

  const chatOrchestrator = useChatOrchestratorStore()
  const chatMaintenance = useChatMaintenanceStore()
  const chatSession = useChatSessionStore()
  const chatStream = useChatStreamStore()
  const consciousnessStore = useConsciousnessStore()
  const discordStore = useDiscordStore()
  const providersStore = useProvidersStore()

  const { sending } = storeToRefs(chatOrchestrator)
  const { activeSessionId } = storeToRefs(chatSession)
  const { streamingMessage } = storeToRefs(chatStream)
  const { activeProvider, activeModel, configured } = storeToRefs(consciousnessStore)
  const { enabled: discordEnabled, token: discordToken, configured: discordConfigured } = storeToRefs(discordStore)
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
    const toolMetrics = countChatTurnToolMetrics({
      output: chat.output,
      toolMessages: chat.toolCalls,
    })

    lastTurnComplete = {
      at: new Date().toISOString(),
      outputText: trimPreview(chat.outputText, 400),
      toolCallCount: toolMetrics.toolCallCount,
      toolResultCount: toolMetrics.toolResultCount,
    }

    pushEvent('chat-turn-complete', {
      outputPreview: trimPreview(chat.outputText),
      outputLength: chat.outputText.length,
      toolCallCount: toolMetrics.toolCallCount,
      toolResultCount: toolMetrics.toolResultCount,
    })
  })

  const bridge = {
    async openChat() {
      if (params?.openChat) {
        return await params.openChat()
      }

      throw new Error('AIRI debug bridge is missing openChat handler')
    },

    async navigateTo(path: string) {
      if (params?.navigateTo) {
        return await params.navigateTo(path)
      }

      window.location.hash = `#${path}`
      return window.location.hash
    },

    async ensureConsciousnessSelection(params: EnsureConsciousnessSelectionParams) {
      const provider = params.provider.trim()
      const preferredModels = params.preferredModels
        .map(model => model.trim())
        .filter(Boolean)
      const providerConfig = params.providerConfig && typeof params.providerConfig === 'object'
        ? params.providerConfig
        : undefined

      if (!provider) {
        throw new Error('AIRI debug bridge requires a provider id to select a model')
      }

      if (providerConfig) {
        providersStore.providers[provider] = {
          ...providersStore.getProviderConfig(provider),
          ...providerConfig,
        }
        providersStore.markProviderAdded(provider)
        await providersStore.disposeProviderInstance(provider).catch(() => undefined)

        const providerValidated = await providersStore.validateProvider(provider, { force: true })
        pushEvent('provider-config-updated', {
          provider,
          providerValidated,
          providerAvailable: availableProviders.value.includes(provider),
          configKeys: Object.keys(providerConfig),
        })
      }

      if (activeProvider.value !== provider) {
        activeProvider.value = provider
        activeModel.value = ''
      }

      await consciousnessStore.loadModelsForProvider(provider)
      const availableModels = await consciousnessStore.getModelsForProvider(provider)
      const availableModelIds = availableModels
        .map(model => String(model.id || '').trim())
        .filter(Boolean)

      const resolvedModel = resolvePreferredModelId(preferredModels, availableModelIds)
      const fallbackModel = preferredModels[0]
      if (!resolvedModel && !fallbackModel) {
        const requestedModels = preferredModels.join(', ') || '(none)'
        const availablePreview = availableModelIds.slice(0, 20).join(', ') || '(none)'
        throw new Error(`AIRI debug bridge could not resolve model for provider ${provider}. Requested: ${requestedModels}. Available: ${availablePreview}`)
      }

      activeProvider.value = provider
      activeModel.value = resolvedModel || fallbackModel

      pushEvent('consciousness-selection-changed', {
        provider,
        requestedModels: preferredModels,
        resolvedModel: activeModel.value,
        availableModelCount: availableModelIds.length,
        usedManualModelSelection: !resolvedModel,
      })

      return this.getSnapshot()
    },

    clearEvents() {
      recentEvents.splice(0, recentEvents.length)
      lastTurnComplete = undefined
    },

    resetChatSession() {
      if (!activeSessionId.value) {
        throw new Error('AIRI debug bridge cannot reset chat without an active session')
      }

      const messageCountBeforeReset = chatSession.getSessionMessages(activeSessionId.value).length
      chatMaintenance.cleanupMessages(activeSessionId.value)
      lastTurnComplete = undefined
      pushEvent('chat-reset', {
        sessionId: activeSessionId.value,
        messageCountBeforeReset,
      })

      return this.getSnapshot()
    },

    abortActiveSend() {
      if (!activeSessionId.value) {
        throw new Error('AIRI debug bridge cannot abort chat without an active session')
      }

      const aborted = chatOrchestrator.abortActiveSend(activeSessionId.value)
      pushEvent('chat-abort-requested', {
        sessionId: activeSessionId.value,
        aborted,
      })

      return this.getSnapshot()
    },

    async sendChatPrompt(text: string) {
      const prompt = text.trim()
      if (!activeSessionId.value) {
        throw new Error('AIRI debug bridge cannot send chat without an active session')
      }
      if (!prompt) {
        throw new Error('AIRI debug bridge requires a non-empty prompt')
      }
      if (!activeProvider.value.trim() || !activeModel.value.trim()) {
        throw new Error('AIRI debug bridge requires an active provider and model before sending chat')
      }

      const sessionId = activeSessionId.value
      const providerId = activeProvider.value
      const modelId = activeModel.value
      pushEvent('chat-send-requested', {
        sessionId,
        providerId,
        modelId,
        promptPreview: trimPreview(prompt),
      })

      void (async () => {
        const providerConfig = providersStore.getProviderConfig(providerId)
        const chatProvider = await providersStore.getProviderInstance<ChatProvider>(providerId)
        await chatOrchestrator.ingest(prompt, {
          model: modelId,
          chatProvider,
          providerConfig,
          tools: widgetsTools,
        })
      })()
        .then(() => {
          pushEvent('chat-send-finished', {
            sessionId,
            providerId,
            modelId,
          })
        })
        .catch((error) => {
          pushEvent('chat-send-failed', {
            sessionId,
            providerId,
            modelId,
            error: error instanceof Error ? error.message : String(error),
          })
        })

      return this.getSnapshot()
    },

    async listMcpTools() {
      const tools = await getMcpToolBridge().listTools()
      pushEvent('mcp-tools-listed', {
        toolCount: tools.length,
      })
      return tools
    },

    async callMcpTool(payload: McpCallToolPayload) {
      if (!payload?.name?.trim()) {
        throw new Error('AIRI debug bridge requires a qualified MCP tool name')
      }

      const result = await getMcpToolBridge().callTool(payload)
      pushEvent('mcp-tool-called', {
        name: payload.name,
        hasStructuredContent: Boolean(result?.structuredContent),
        isError: Boolean(result?.isError),
      })
      return result
    },

    getChatMessages(limit = 20) {
      if (!activeSessionId.value) {
        return []
      }

      const normalizedLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 20
      return chatSession.getSessionMessages(activeSessionId.value)
        .slice(-normalizedLimit)
        .map(message => ({
          role: message.role,
          text: toMessageText(message),
          createdAt: message.createdAt,
        }))
    },

    getSnapshot(): AiriDebugSnapshot {
      const sessionId = activeSessionId.value
      const messages = sessionId ? chatSession.getSessionMessages(sessionId) : []
      const lastMessage = messages.at(-1)
      const textarea = document.querySelector('textarea.ph-no-capture') as HTMLTextAreaElement | null
      const discordCheckbox = document.querySelector('input[type="checkbox"], [role="switch"], button[aria-checked], button[data-state]') as HTMLElement | null
      const discordTokenInput = document.querySelector('input[type="password"]') as HTMLInputElement | null
      const discordSaveButton = Array.from(document.querySelectorAll('button')).find((button) => {
        const text = button.textContent?.trim().toLowerCase() || ''
        if (text === 'save' || text.includes('保存')) {
          return true
        }

        if (!discordTokenInput) {
          return false
        }

        return Boolean(discordTokenInput.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING)
      }) as HTMLButtonElement | undefined
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
        discord: {
          enabled: Boolean(discordEnabled.value),
          configured: Boolean(discordConfigured.value),
          tokenLength: discordToken.value.length,
          hasCheckbox: Boolean(discordCheckbox),
          hasTokenInput: Boolean(discordTokenInput),
          hasSaveButton: Boolean(discordSaveButton),
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

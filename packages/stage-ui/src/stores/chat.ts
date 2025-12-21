import type { ContextMessage, ContextSource } from '@proj-airi/server-sdk'
import type { ChatProvider } from '@xsai-ext/shared-providers'
import type { CommonContentPart, Message, SystemMessage, UserMessage } from '@xsai/shared-chat'

import type { StreamEvent, StreamOptions } from '../stores/llm'
import type { ChatAssistantMessage, ChatMessage, ChatSlices } from '../types/chat'

import { useLocalStorage } from '@vueuse/core'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, toRaw, watch } from 'vue'

import { useLlmmarkerParser } from '../composables/llmmarkerParser'
import { useConversationHistory } from '../composables/useConversationHistory'
import { useMemoryService } from '../composables/useMemoryService'
import { useLLM } from '../stores/llm'
import { createQueue } from '../utils/queue'
import { TTS_FLUSH_INSTRUCTION } from '../utils/tts'
import { useAiriCardStore } from './modules'

export interface ErrorMessage {
  role: 'error'
  content: string
}

interface MessageContext {
  sessionId: string
  source: ContextSource
  ts: number
  meta?: Record<string, unknown>
}

type ChatEntry = (ChatMessage | ErrorMessage) & { context?: MessageContext }
export type { ChatEntry }

export interface ContextPayload {
  content?: unknown
  slices?: ChatSlices[]
  tool_results?: ChatAssistantMessage['tool_results']
  text?: string
}

export type ChatStreamEvent
  = | { type: 'before-compose', message: string, sessionId: string }
    | { type: 'after-compose', message: string, sessionId: string }
    | { type: 'before-send', message: string, sessionId: string }
    | { type: 'after-send', message: string, sessionId: string }
    | { type: 'token-literal', literal: string, sessionId: string }
    | { type: 'token-special', special: string, sessionId: string }
    | { type: 'stream-end', sessionId: string }
    | { type: 'assistant-end', message: string, sessionId: string }

const CHAT_STORAGE_KEY = 'chat/messages/v2'
const ACTIVE_SESSION_STORAGE_KEY = 'chat/active-session'
export const CONTEXT_CHANNEL_NAME = 'airi-context-update'
export const CHAT_STREAM_CHANNEL_NAME = 'airi-chat-stream'

export const useChatStore = defineStore('chat', () => {
  const { stream, discoverToolsCompatibility } = useLLM()
  const { systemPrompt } = storeToRefs(useAiriCardStore())
  const { storeAIResponse } = useMemoryService()
  const { loadHistory, isLoading: isLoadingHistory, hasMore: hasMoreHistory, error: historyError } = useConversationHistory()

  const activeSessionId = useLocalStorage<string>(ACTIVE_SESSION_STORAGE_KEY, 'default')
  const sessionMessages = useLocalStorage<Record<string, ChatEntry[]>>(CHAT_STORAGE_KEY, {})

  const sending = ref(false)
  const loadingInitialHistory = ref(false)
  const hasLoadedInitialHistory = ref(false)

  // ----- Hooks (UI callbacks) -----
  const onBeforeMessageComposedHooks = ref<Array<(message: string) => Promise<void>>>([])
  const onAfterMessageComposedHooks = ref<Array<(message: string) => Promise<void>>>([])
  const onBeforeSendHooks = ref<Array<(message: string) => Promise<void>>>([])
  const onAfterSendHooks = ref<Array<(message: string) => Promise<void>>>([])
  const onTokenLiteralHooks = ref<Array<(literal: string) => Promise<void>>>([])
  const onTokenSpecialHooks = ref<Array<(special: string) => Promise<void>>>([])
  const onStreamEndHooks = ref<Array<() => Promise<void>>>([])
  const onAssistantResponseEndHooks = ref<Array<(message: string) => Promise<void>>>([])
  const onContextPublishHooks = ref<Array<(envelope: ContextMessage<ContextPayload>, origin: 'local' | 'ws' | 'broadcast') => Promise<void> | void>>([])

  function onBeforeMessageComposed(cb: (message: string) => Promise<void>) {
    onBeforeMessageComposedHooks.value.push(cb)
    return () => onBeforeMessageComposedHooks.value = onBeforeMessageComposedHooks.value.filter(hook => hook !== cb) // return remove listener callback
  }

  function onAfterMessageComposed(cb: (message: string) => Promise<void>) {
    onAfterMessageComposedHooks.value.push(cb)
    return () => onAfterMessageComposedHooks.value = onAfterMessageComposedHooks.value.filter(hook => hook !== cb) // return remove listener callback
  }

  function onBeforeSend(cb: (message: string) => Promise<void>) {
    onBeforeSendHooks.value.push(cb)
    return () => onBeforeSendHooks.value = onBeforeSendHooks.value.filter(hook => hook !== cb) // return remove listener callback
  }

  function onAfterSend(cb: (message: string) => Promise<void>) {
    onAfterSendHooks.value.push(cb)
    return () => onAfterSendHooks.value = onAfterSendHooks.value.filter(hook => hook !== cb) // return remove listener callback
  }

  function onTokenLiteral(cb: (literal: string) => Promise<void>) {
    onTokenLiteralHooks.value.push(cb)
    return () => onTokenLiteralHooks.value = onTokenLiteralHooks.value.filter(hook => hook !== cb) // return remove listener callback
  }

  function onTokenSpecial(cb: (special: string) => Promise<void>) {
    onTokenSpecialHooks.value.push(cb)
    return () => onTokenSpecialHooks.value = onTokenSpecialHooks.value.filter(hook => hook !== cb) // return remove listener callback
  }

  function onStreamEnd(cb: () => Promise<void>) {
    onStreamEndHooks.value.push(cb)
    return () => onStreamEndHooks.value = onStreamEndHooks.value.filter(hook => hook !== cb) // return remove listener callback
  }

  function onAssistantResponseEnd(cb: (message: string) => Promise<void>) {
    onAssistantResponseEndHooks.value.push(cb)
    return () => onAssistantResponseEndHooks.value = onAssistantResponseEndHooks.value.filter(hook => hook !== cb) // return remove listener callback
  }

  function onContextPublish(cb: (envelope: ContextMessage<ContextPayload>, origin: 'local' | 'ws' | 'broadcast') => Promise<void> | void) {
    onContextPublishHooks.value.push(cb)

    return () => {
      onContextPublishHooks.value = onContextPublishHooks.value.filter(hook => hook !== cb)
    }
  }

  function clearHooks() {
    onBeforeMessageComposedHooks.value = []
    onAfterMessageComposedHooks.value = []
    onBeforeSendHooks.value = []
    onAfterSendHooks.value = []
    onTokenLiteralHooks.value = []
    onTokenSpecialHooks.value = []
    onStreamEndHooks.value = []
    onAssistantResponseEndHooks.value = []
    onContextPublishHooks.value = []
  }

  async function emitBeforeMessageComposedHooks(message: string) {
    for (const hook of onBeforeMessageComposedHooks.value)
      await hook(message)
  }

  async function emitAfterMessageComposedHooks(message: string) {
    for (const hook of onAfterMessageComposedHooks.value)
      await hook(message)
  }

  async function emitBeforeSendHooks(message: string) {
    for (const hook of onBeforeSendHooks.value)
      await hook(message)
  }

  async function emitAfterSendHooks(message: string) {
    for (const hook of onAfterSendHooks.value)
      await hook(message)
  }

  async function emitTokenLiteralHooks(literal: string) {
    for (const hook of onTokenLiteralHooks.value)
      await hook(literal)
  }

  async function emitTokenSpecialHooks(special: string) {
    for (const hook of onTokenSpecialHooks.value)
      await hook(special)
  }

  async function emitStreamEndHooks() {
    for (const hook of onStreamEndHooks.value)
      await hook()
  }

  async function emitAssistantResponseEndHooks(message: string) {
    for (const hook of onAssistantResponseEndHooks.value)
      await hook(message)
  }

  // ----- Session state helpers -----
  // I know this nu uh, better than loading all language on rehypeShiki
  const codeBlockSystemPrompt = '- For any programming code block, always specify the programming language that supported on @shikijs/rehype on the rendered markdown, eg. ```python ... ```\n'
  const mathSyntaxSystemPrompt = '- For any math equation, use LaTeX format, eg: $ x^3 $, always escape dollar sign outside math equation\n'

  function generateInitialMessage() {
    // TODO: compose, replace {{ user }} tag, etc
    return {
      role: 'system',
      content: codeBlockSystemPrompt + mathSyntaxSystemPrompt + systemPrompt.value,
    } satisfies SystemMessage
  }

  function ensureSession(sessionId: string) {
    if (!sessionMessages.value[sessionId] || sessionMessages.value[sessionId].length === 0) {
      sessionMessages.value[sessionId] = [{
        ...generateInitialMessage(),
        context: {
          sessionId,
          source: 'system',
          ts: Date.now(),
        },
      }]
    }
  }

  ensureSession(activeSessionId.value)

  const messages = computed<ChatEntry[]>({
    get: () => {
      ensureSession(activeSessionId.value)
      return sessionMessages.value[activeSessionId.value]
    },
    set: (value) => {
      sessionMessages.value[activeSessionId.value] = value
    },
  })

  function setActiveSession(sessionId: string) {
    activeSessionId.value = sessionId
    ensureSession(sessionId)
  }

  function cleanupMessages(sessionId = activeSessionId.value) {
    sessionMessages.value[sessionId] = [{
      ...generateInitialMessage(),
      context: {
        sessionId,
        source: 'system',
        ts: Date.now(),
      },
    }]
  }

  function getAllSessions() {
    return JSON.parse(JSON.stringify(toRaw(sessionMessages.value))) as Record<string, ChatEntry[]>
  }

  function replaceSessions(sessions: Record<string, ChatEntry[]>) {
    sessionMessages.value = sessions
    const [firstSessionId] = Object.keys(sessions)
    if (!sessionMessages.value[activeSessionId.value] && firstSessionId)
      activeSessionId.value = firstSessionId

    ensureSession(activeSessionId.value)
  }

  function resetAllSessions() {
    sessionMessages.value = {}
    activeSessionId.value = 'default'
    ensureSession(activeSessionId.value)
  }

  watch(systemPrompt, () => {
    for (const [sessionId, history] of Object.entries(sessionMessages.value)) {
      if (history.length > 0 && history[0].role === 'system') {
        sessionMessages.value[sessionId][0] = {
          ...generateInitialMessage(),
          context: {
            sessionId,
            source: 'system',
            ts: Date.now(),
          },
        }
      }
    }
  }, { immediate: true })

  // ----- Context bridge (WS + BroadcastChannel) -----
  function normalizePayload(payload?: ContextPayload) {
    const baseContent = payload?.content ?? payload?.text ?? ''
    const normalizedContent = typeof baseContent === 'string' || Array.isArray(baseContent)
      ? baseContent
      : JSON.stringify(baseContent)

    return {
      content: normalizedContent,
      slices: payload?.slices ?? [],
      tool_results: payload?.tool_results ?? [],
    }
  }

  function ingestContextMessage(envelope: ContextMessage<ContextPayload>) {
    ensureSession(envelope.sessionId)

    const { content, slices, tool_results } = normalizePayload(envelope.payload)

    const context: MessageContext = {
      sessionId: envelope.sessionId,
      source: envelope.source,
      ts: envelope.ts,
      meta: envelope.meta,
    }

    const nextHistory = sessionMessages.value[envelope.sessionId]

    if (envelope.role === 'assistant') {
      nextHistory.push({
        role: 'assistant',
        content,
        slices,
        tool_results,
        context,
      })
    }
    else if (envelope.role === 'error') {
      nextHistory.push({
        role: 'error',
        content: typeof content === 'string' ? content : JSON.stringify(content),
        context,
      })
    }
    else {
      nextHistory.push({
        role: envelope.role,
        content,
        context,
      } as ChatEntry)
    }
  }

  function publishContextMessage(envelope: ContextMessage<ContextPayload>, origin: 'local' | 'ws' | 'broadcast' = 'local') {
    for (const hook of onContextPublishHooks.value)
      void hook(envelope, origin)
  }

  // ----- Send flow (user -> LLM -> assistant) -----
  const streamingMessage = ref<ChatAssistantMessage>({ role: 'assistant', content: '', slices: [], tool_results: [] })

  

  async function send(
    sendingMessage: string,
    options: {
      model: string
      chatProvider: ChatProvider
      providerConfig?: Record<string, unknown>
      attachments?: { type: 'image', data: string, mimeType: string }[]
      tools?: StreamOptions['tools']
    },
  ) {
    if (!sendingMessage && !options.attachments?.length)
      return
    sending.value = true

    try {
      await emitBeforeMessageComposedHooks(sendingMessage)

      const contentParts: CommonContentPart[] = [{ type: 'text', text: sendingMessage }]

      if (options.attachments) {
        for (const attachment of options.attachments) {
          if (attachment.type === 'image') {
            contentParts.push({
              type: 'image_url',
              image_url: {
                url: `data:${attachment.mimeType};base64,${attachment.data}`,
              },
            })
          }
        }
      }

      const finalContent = contentParts.length > 1 ? contentParts : sendingMessage

      const userContext: MessageContext = { sessionId: activeSessionId.value, source: 'text', ts: Date.now() }
      messages.value.push({ role: 'user', content: finalContent, context: userContext })

      publishContextMessage({
        sessionId: userContext.sessionId,
        ts: userContext.ts,
        role: 'user',
        source: userContext.source,
        payload: { content: finalContent },
      }, 'local')

      const parser = useLlmmarkerParser({
        onLiteral: async (literal) => {
          await emitTokenLiteralHooks(literal)

          streamingMessage.value.content += literal

          // merge text slices for markdown
          const lastSlice = streamingMessage.value.slices.at(-1)
          if (lastSlice?.type === 'text') {
            lastSlice.text += literal
            return
          }

          streamingMessage.value.slices.push({
            type: 'text',
            text: literal,
          })
        },
        onSpecial: async (special) => {
          await emitTokenSpecialHooks(special)
        },
        minLiteralEmitLength: 24, // Avoid emitting literals too fast. This is a magic number and can be changed later.
      })

      const toolCallQueue = createQueue<ChatSlices>({
        handlers: [
          async (ctx) => {
            if (ctx.data.type === 'tool-call') {
              streamingMessage.value.slices.push(ctx.data)
              return
            }

            if (ctx.data.type === 'tool-call-result') {
              streamingMessage.value.tool_results.push(ctx.data)
            }
          },
        ],
      })

      // Reset the streaming message for the next turn
      streamingMessage.value = { role: 'assistant', content: '', slices: [], tool_results: [] }

      const newMessages = messages.value.map((msg) => {
        const { context: _context, ...withoutContext } = msg
        const rawMessage = toRaw(withoutContext)
        if (rawMessage.role === 'assistant') {
          const { slices: _, tool_results, ...rest } = rawMessage as ChatAssistantMessage
          return {
            ...toRaw(rest),
            tool_results: toRaw(tool_results),
          }
        }

        return rawMessage
      })

      await emitAfterMessageComposedHooks(sendingMessage)
      await emitBeforeSendHooks(sendingMessage)

      let fullText = ''
      const headers = (options.providerConfig?.headers || {}) as Record<string, string>

      await stream(options.model, options.chatProvider, newMessages as Message[], {
        headers,
        tools: options.tools,
        onStreamEvent: async (event: StreamEvent) => {
          switch (event.type) {
            case 'tool-call':
              toolCallQueue.enqueue({
                type: 'tool-call',
                toolCall: event,
              })
              break
            case 'tool-result':
              toolCallQueue.enqueue({
                type: 'tool-call-result',
                id: event.toolCallId,
                result: event.result,
              })
              break
            case 'text-delta':
              fullText += event.text
              await parser.consume(event.text)
              break
            case 'finish':
            // Do nothing, resolve
              break
            case 'error':
              throw event.error ?? new Error('Stream error')
          }
        },
      })
      // Finalize the parsing of the actual message content
      await parser.end()

      // Add the completed message to the history only if it has content
      if (streamingMessage.value.slices.length > 0) {
        const assistantContext: MessageContext = {
          sessionId: activeSessionId.value,
          source: 'llm',
          ts: Date.now(),
        }

        const assistantMessage: ChatEntry = {
          ...(toRaw(streamingMessage.value) as ChatAssistantMessage),
          context: assistantContext,
        }

        messages.value.push(assistantMessage)

        publishContextMessage({
          sessionId: assistantContext.sessionId,
          ts: assistantContext.ts,
          role: 'assistant',
          source: assistantContext.source,
          payload: {
            content: assistantMessage.content,
            slices: assistantMessage.slices,
            tool_results: assistantMessage.tool_results,
          },
        }, 'local')
      }

      // Reset the streaming message for the next turn
      streamingMessage.value = { role: 'assistant', content: '', slices: [], tool_results: [] }

      // Instruct the TTS pipeline to flush by calling hooks directly
      const flushSignal = `${TTS_FLUSH_INSTRUCTION}${TTS_FLUSH_INSTRUCTION}`
      await emitTokenLiteralHooks(flushSignal)

      // Call the end-of-stream hooks
      await emitStreamEndHooks()

      // Call the end-of-response hooks with the full text
      await emitAssistantResponseEndHooks(fullText)

      // eslint-disable-next-line no-console
      console.debug('LLM output:', fullText)

      await emitAfterSendHooks(sendingMessage)
    }
    catch (error) {
      console.error('Error sending message:', error)
      throw error
    }
    finally {
      sending.value = false
    }
  }

  // Load initial conversation history
  async function loadInitialHistory(limit: number = 10) {
    // Prevent the function from running more than once
    if (hasLoadedInitialHistory.value) {
      return
    }

    try {
      loadingInitialHistory.value = true
      const history = await loadHistory(limit)

      // Convert history messages to chat format
      const chatMessages = history.map((msg) => {
        if (msg.type === 'assistant') {
          return {
            role: msg.type,
            content: msg.content,
            slices: [{ type: 'text', text: msg.content }] as ChatSlices[],
            tool_results: [],
            created_at: msg.created_at,
          } as ChatAssistantMessage
        }
        else {
          return {
            role: msg.type,
            content: msg.content,
            created_at: msg.created_at,
          } as UserMessage
        }
      })

      // Add system message first
      messages.value = [
        {
          role: 'system',
          content: codeBlockSystemPrompt + mathSyntaxSystemPrompt + systemPrompt.value,
        } as SystemMessage,
        ...chatMessages,
      ]

      // Set the flag to true after the first successful load
      hasLoadedInitialHistory.value = true
    }
    finally {
      loadingInitialHistory.value = false
    }
  }

  // Loads all conversation history in small, consecutive batches.
  async function loadAllHistoryPaginated(blocks: number = 4) {
    const batchSize = 100 // constant block size
    const systemMessage = messages.value.find(msg => msg.role === 'system')
    messages.value = systemMessage ? [systemMessage] : [] // Clear old messages

    loadingInitialHistory.value = true
    hasMoreHistory.value = true

    let beforeTimestamp: number | undefined
    let allChatMessages: Array<ChatMessage | ErrorMessage> = []

    try {
      // Loop until the 'hasMore' flag from the API becomes false
      // Break load after exceeding block length
      for (let i = 0; i < blocks; i++) {
        const history = await loadHistory(batchSize, beforeTimestamp)

        if (history.length === 0) {
          hasMoreHistory.value = false
          break
        }

        const batchChatMessages = history.map((msg) => {
          // Explicitly check for assistant role (assuming all others are user/error)
          if (msg.type === 'assistant') {
            return {
              role: msg.type,
              content: msg.content,
              slices: [{ type: 'text', text: msg.content }] as ChatSlices[],
              tool_results: [],
              created_at: msg.created_at,
            } as ChatAssistantMessage
          }
          else {
            // User message structure (ensuring slices and tool_results are present)
            return {
              role: 'user',
              content: msg.content,
              slices: [{ type: 'text', text: msg.content }] as ChatSlices[],
              tool_results: [],
              created_at: msg.created_at,
            } as UserMessage
          }
        })
        allChatMessages = [...allChatMessages, ...batchChatMessages]
        // Update state partially to show progress (optional, but good for UX)
        messages.value = systemMessage ? [systemMessage, ...allChatMessages] : allChatMessages

        // Determine the timestamp for the next batch (oldest message's timestamp)
        const oldestMsg = history.sort((a, b) => a.created_at - b.created_at)[0]
        beforeTimestamp = oldestMsg.created_at

        // If the batch returned less than the requested limit, we're done.
        if (history.length < batchSize) {
          hasMoreHistory.value = false
        }
      }

      // Final check for system message insertion if not already done in the loop
      if (systemMessage && messages.value[0]?.role !== 'system') {
        messages.value.unshift(systemMessage)
      }

      hasLoadedInitialHistory.value = true
      console.warn(`Loaded ${allChatMessages.length} total messages in batches.`)
    }
    catch (error) {
      console.error('Failed to load full history paginated:', error)
      // Reset flag to allow retries
      hasLoadedInitialHistory.value = false
    }
    finally {
      loadingInitialHistory.value = false
    }
  }

  async function loadMoreHistory() {
    if (!hasMoreHistory.value || isLoadingHistory.value)
      return

    const oldestMessage = messages.value
      .filter(msg => msg.role !== 'system')
      .sort((a, b) => ((a as any).created_at || 0) - ((b as any).created_at || 0))[0]

    if (!(oldestMessage as any)?.created_at)
      return

    const history = await loadHistory(10, (oldestMessage as any).created_at)

    // Convert and add to messages
    const chatMessages = history.map((msg) => {
      if (msg.type === 'assistant') {
        return {
          role: msg.type,
          content: msg.content,
          slices: [{ type: 'text', text: msg.content }] as ChatSlices[],
          tool_results: [],
          created_at: msg.created_at,
        } as ChatAssistantMessage
      }
      else {
        return {
          role: msg.type,
          content: msg.content,
          created_at: msg.created_at,
        } as UserMessage
      }
    })

    messages.value = [
      ...messages.value.filter(msg => msg.role === 'system'),
      ...chatMessages,
      ...messages.value.filter(msg => msg.role !== 'system'),
    ]
  }

  return {
    sending,
    activeSessionId,
    messages,
    streamingMessage,
    loadingInitialHistory,
    isLoadingHistory,
    hasMoreHistory,
    historyError,

    discoverToolsCompatibility,
    loadInitialHistory,
    loadAllHistoryPaginated,
    loadMoreHistory,
    send,
    setActiveSession,
    ingestContextMessage,
    publishContextMessage,
    cleanupMessages,
    getAllSessions,
    replaceSessions,
    resetAllSessions,
    clearHooks,
    emitBeforeMessageComposedHooks,
    emitAfterMessageComposedHooks,
    emitBeforeSendHooks,
    emitAfterSendHooks,
    emitTokenLiteralHooks,
    emitTokenSpecialHooks,
    emitStreamEndHooks,
    emitAssistantResponseEndHooks,

    onBeforeMessageComposed,
    onAfterMessageComposed,
    onBeforeSend,
    onAfterSend,
    onTokenLiteral,
    onTokenSpecial,
    onStreamEnd,
    onAssistantResponseEnd,
    onContextPublish,
  }
})

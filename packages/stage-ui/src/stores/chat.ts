import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { CommonContentPart, Message, SystemMessage, ToolMessage } from '@xsai/shared-chat'

import type { StreamEvent, StreamOptions } from '../stores/llm'
import type { ChatAssistantMessage, ChatHistoryItem, ChatSlices, ChatStreamEventContext, ContextMessage, StreamingAssistantMessage } from '../types/chat'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { useLocalStorage } from '@vueuse/core'
import { defineStore, storeToRefs } from 'pinia'
import { computed, ref, toRaw, watch } from 'vue'

import { useAnalytics } from '../composables'
import { useLlmmarkerParser } from '../composables/llmmarkerParser'
import { useLLM } from '../stores/llm'
import { createQueue } from '../utils/queue'
import { TTS_FLUSH_INSTRUCTION } from '../utils/tts'
import { useAiriCardStore } from './modules'

const CHAT_STORAGE_KEY = 'chat/messages/v2'
const ACTIVE_SESSION_STORAGE_KEY = 'chat/active-session'
export const CONTEXT_CHANNEL_NAME = 'airi-context-update'
export const CHAT_STREAM_CHANNEL_NAME = 'airi-chat-stream'

export const useChatStore = defineStore('chat', () => {
  const { stream, discoverToolsCompatibility } = useLLM()
  const { systemPrompt } = storeToRefs(useAiriCardStore())
  const { trackFirstMessage } = useAnalytics()

  const activeSessionId = useLocalStorage<string>(ACTIVE_SESSION_STORAGE_KEY, 'default')
  const sessionMessages = useLocalStorage<Record<string, ChatHistoryItem[]>>(CHAT_STORAGE_KEY, {})

  const sending = ref(false)
  const streamingMessage = ref<StreamingAssistantMessage>({ role: 'assistant', content: '', slices: [], tool_results: [], createdAt: Date.now() })
  const sessionGenerations = ref<Record<string, number>>({})

  const activeContexts = ref<Record<string, ContextMessage[]>>({})

  interface SendOptions {
    model: string
    chatProvider: ChatProvider
    providerConfig?: Record<string, unknown>
    attachments?: { type: 'image', data: string, mimeType: string }[]
    tools?: StreamOptions['tools']
  }

  interface QueuedSend {
    sendingMessage: string
    options: SendOptions
    generation: number
    sessionId: string
    cancelled?: boolean
    deferred: {
      resolve: () => void
      reject: (error: unknown) => void
    }
  }

  const pendingQueuedSends = ref<QueuedSend[]>([])

  const sendQueue = createQueue<QueuedSend>({
    handlers: [
      async ({ data }) => {
        const { sendingMessage, options, generation, deferred, sessionId, cancelled } = data

        if (cancelled)
          return

        if (getSessionGeneration(sessionId) !== generation) {
          deferred.reject(new Error('Chat session was reset before send could start'))
          return
        }

        try {
          await performSend(sendingMessage, options, generation, sessionId)
          deferred.resolve()
        }
        catch (error) {
          deferred.reject(error)
        }
      },
    ],
  })

  sendQueue.on('enqueue', (queuedSend) => {
    pendingQueuedSends.value = [...pendingQueuedSends.value, queuedSend]
  })

  sendQueue.on('dequeue', (queuedSend) => {
    pendingQueuedSends.value = pendingQueuedSends.value.filter(item => item !== queuedSend)
  })

  // ----- Hooks (UI callbacks) -----
  const onBeforeMessageComposedHooks = ref<Array<(message: string, context: Omit<ChatStreamEventContext, 'composedMessage'>) => Promise<void>>>([])
  const onAfterMessageComposedHooks = ref<Array<(message: string, context: ChatStreamEventContext) => Promise<void>>>([])
  const onBeforeSendHooks = ref<Array<(message: string, context: ChatStreamEventContext) => Promise<void>>>([])
  const onAfterSendHooks = ref<Array<(message: string, context: ChatStreamEventContext) => Promise<void>>>([])
  const onTokenLiteralHooks = ref<Array<(literal: string, context: ChatStreamEventContext) => Promise<void>>>([])
  const onTokenSpecialHooks = ref<Array<(special: string, context: ChatStreamEventContext) => Promise<void>>>([])
  const onStreamEndHooks = ref<Array<(context: ChatStreamEventContext) => Promise<void>>>([])
  const onAssistantResponseEndHooks = ref<Array<(message: string, context: ChatStreamEventContext) => Promise<void>>>([])
  const onAssistantMessageHooks = ref<Array<(message: StreamingAssistantMessage, messageText: string, context: ChatStreamEventContext) => Promise<void>>>([])
  const onChatTurnCompleteHooks = ref<Array<(chat: { output: StreamingAssistantMessage, outputText: string, toolCalls: ToolMessage[] }, context: ChatStreamEventContext) => Promise<void>>>([])

  function onBeforeMessageComposed(cb: (message: string, context: Omit<ChatStreamEventContext, 'composedMessage'>) => Promise<void>) {
    onBeforeMessageComposedHooks.value.push(cb)
    return () => onBeforeMessageComposedHooks.value = onBeforeMessageComposedHooks.value.filter(hook => hook !== cb) // return remove listener callback
  }

  function onAfterMessageComposed(cb: (message: string, context: ChatStreamEventContext) => Promise<void>) {
    onAfterMessageComposedHooks.value.push(cb)
    return () => onAfterMessageComposedHooks.value = onAfterMessageComposedHooks.value.filter(hook => hook !== cb) // return remove listener callback
  }

  function onBeforeSend(cb: (message: string, context: ChatStreamEventContext) => Promise<void>) {
    onBeforeSendHooks.value.push(cb)
    return () => onBeforeSendHooks.value = onBeforeSendHooks.value.filter(hook => hook !== cb) // return remove listener callback
  }

  function onAfterSend(cb: (message: string, context: ChatStreamEventContext) => Promise<void>) {
    onAfterSendHooks.value.push(cb)
    return () => onAfterSendHooks.value = onAfterSendHooks.value.filter(hook => hook !== cb) // return remove listener callback
  }

  function onTokenLiteral(cb: (literal: string, context: ChatStreamEventContext) => Promise<void>) {
    onTokenLiteralHooks.value.push(cb)
    return () => onTokenLiteralHooks.value = onTokenLiteralHooks.value.filter(hook => hook !== cb) // return remove listener callback
  }

  function onTokenSpecial(cb: (special: string, context: ChatStreamEventContext) => Promise<void>) {
    onTokenSpecialHooks.value.push(cb)
    return () => onTokenSpecialHooks.value = onTokenSpecialHooks.value.filter(hook => hook !== cb) // return remove listener callback
  }

  function onStreamEnd(cb: (context: ChatStreamEventContext) => Promise<void>) {
    onStreamEndHooks.value.push(cb)
    return () => onStreamEndHooks.value = onStreamEndHooks.value.filter(hook => hook !== cb) // return remove listener callback
  }

  function onAssistantResponseEnd(cb: (message: string, context: ChatStreamEventContext) => Promise<void>) {
    onAssistantResponseEndHooks.value.push(cb)
    return () => onAssistantResponseEndHooks.value = onAssistantResponseEndHooks.value.filter(hook => hook !== cb) // return remove listener callback
  }

  function onAssistantMessage(cb: (message: StreamingAssistantMessage, messageText: string, context: ChatStreamEventContext) => Promise<void>) {
    onAssistantMessageHooks.value.push(cb)
    return () => onAssistantMessageHooks.value = onAssistantMessageHooks.value.filter(hook => hook !== cb) // return remove listener callback
  }

  function onChatTurnComplete(cb: (chat: { output: StreamingAssistantMessage, outputText: string, toolCalls: ToolMessage[] }, context: ChatStreamEventContext) => Promise<void>) {
    onChatTurnCompleteHooks.value.push(cb)
    return () => onChatTurnCompleteHooks.value = onChatTurnCompleteHooks.value.filter(hook => hook !== cb) // return remove listener callback
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
    onAssistantMessageHooks.value = []
    onChatTurnCompleteHooks.value = []
  }

  async function emitBeforeMessageComposedHooks(message: string, context: Omit<ChatStreamEventContext, 'composedMessage'>) {
    for (const hook of onBeforeMessageComposedHooks.value)
      await hook(message, context)
  }

  async function emitAfterMessageComposedHooks(message: string, context: ChatStreamEventContext) {
    for (const hook of onAfterMessageComposedHooks.value)
      await hook(message, context)
  }

  async function emitBeforeSendHooks(message: string, context: ChatStreamEventContext) {
    for (const hook of onBeforeSendHooks.value)
      await hook(message, context)
  }

  async function emitAfterSendHooks(message: string, context: ChatStreamEventContext) {
    for (const hook of onAfterSendHooks.value)
      await hook(message, context)
  }

  async function emitTokenLiteralHooks(literal: string, context: ChatStreamEventContext) {
    for (const hook of onTokenLiteralHooks.value)
      await hook(literal, context)
  }

  async function emitTokenSpecialHooks(special: string, context: ChatStreamEventContext) {
    for (const hook of onTokenSpecialHooks.value)
      await hook(special, context)
  }

  async function emitStreamEndHooks(context: ChatStreamEventContext) {
    for (const hook of onStreamEndHooks.value)
      await hook(context)
  }

  async function emitAssistantResponseEndHooks(message: string, context: ChatStreamEventContext) {
    for (const hook of onAssistantResponseEndHooks.value)
      await hook(message, context)
  }

  async function emitAssistantMessageHooks(message: StreamingAssistantMessage, messageText: string, context: ChatStreamEventContext) {
    for (const hook of onAssistantMessageHooks.value)
      await hook(message, messageText, context)
  }

  async function emitChatTurnCompleteHooks(chat: { output: StreamingAssistantMessage, outputText: string, toolCalls: ToolMessage[] }, context: ChatStreamEventContext) {
    for (const hook of onChatTurnCompleteHooks.value)
      await hook(chat, context)
  }

  // ----- Session state helpers -----
  // I know this nu uh, better than loading all language on rehypeShiki
  const codeBlockSystemPrompt = '- For any programming code block, always specify the programming language that supported on @shikijs/rehype on the rendered markdown, eg. ```python ... ```\n'
  const mathSyntaxSystemPrompt = '- For any math equation, use LaTeX format, eg: $ x^3 $, always escape dollar sign outside math equation\n'

  function ensureSessionGeneration(sessionId: string) {
    if (sessionGenerations.value[sessionId] === undefined)
      sessionGenerations.value = { ...sessionGenerations.value, [sessionId]: 0 }
  }

  function getSessionGeneration(sessionId: string) {
    ensureSessionGeneration(sessionId)
    return sessionGenerations.value[sessionId] ?? 0
  }

  function bumpSessionGeneration(sessionId: string) {
    const nextGeneration = getSessionGeneration(sessionId) + 1
    sessionGenerations.value = { ...sessionGenerations.value, [sessionId]: nextGeneration }
    return nextGeneration
  }

  function generateInitialMessage() {
    // TODO: compose, replace {{ user }} tag, etc
    const content = codeBlockSystemPrompt + mathSyntaxSystemPrompt + systemPrompt.value

    return {
      role: 'system',
      content,
    } satisfies SystemMessage
  }

  function ensureSession(sessionId: string) {
    ensureSessionGeneration(sessionId)

    if (!sessionMessages.value[sessionId] || sessionMessages.value[sessionId].length === 0) {
      sessionMessages.value[sessionId] = [generateInitialMessage()]
    }
  }

  ensureSession(activeSessionId.value)

  function getSessionMessagesById(sessionId: string) {
    ensureSession(sessionId)
    return sessionMessages.value[sessionId]!
  }

  const messages = computed<ChatHistoryItem[]>({
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
    bumpSessionGeneration(sessionId)
    sessionMessages.value[sessionId] = [generateInitialMessage()]

    // Reject pending sends for this session so callers don't hang after cleanup
    for (const queued of pendingQueuedSends.value) {
      if (queued.sessionId !== sessionId)
        continue

      queued.cancelled = true
      queued.deferred.reject(new Error('Chat session was reset before send could start'))
    }

    pendingQueuedSends.value = pendingQueuedSends.value.filter(item => item.sessionId !== sessionId)
    sending.value = false
    streamingMessage.value = { role: 'assistant', content: '', slices: [], tool_results: [] }
  }

  function getAllSessions() {
    return JSON.parse(JSON.stringify(toRaw(sessionMessages.value))) as Record<string, ChatHistoryItem[]>
  }

  function replaceSessions(sessions: Record<string, ChatHistoryItem[]>) {
    sessionMessages.value = sessions
    sessionGenerations.value = Object.fromEntries(Object.keys(sessions).map(sessionId => [sessionId, 0]))
    const [firstSessionId] = Object.keys(sessions)
    if (!sessionMessages.value[activeSessionId.value] && firstSessionId)
      activeSessionId.value = firstSessionId

    ensureSession(activeSessionId.value)
  }

  function resetAllSessions() {
    sessionMessages.value = {}
    sessionGenerations.value = {}
    activeSessionId.value = 'default'
    ensureSession(activeSessionId.value)
  }

  watch(systemPrompt, () => {
    for (const [sessionId, history] of Object.entries(sessionMessages.value)) {
      if (history.length > 0 && history[0].role === 'system') {
        sessionMessages.value[sessionId][0] = generateInitialMessage()
      }
    }
  }, { immediate: true })

  function ingestContextMessage(envelope: ContextMessage) {
    if (!activeContexts.value[envelope.source]) {
      activeContexts.value[envelope.source] = []
    }

    if (envelope.strategy === ContextUpdateStrategy.ReplaceSelf) {
      activeContexts.value[envelope.source] = [envelope]
    }
    else if (envelope.strategy === ContextUpdateStrategy.AppendSelf) {
      activeContexts.value[envelope.source].push(envelope)
    }
  }

  // ----- Send flow (user -> LLM -> assistant) -----
  async function performSend(
    sendingMessage: string,
    options: SendOptions,
    generation: number,
    sessionId: string,
  ) {
    if (!sendingMessage && !options.attachments?.length)
      return

    ensureSession(sessionId)

    const sendingCreatedAt = Date.now()
    const streamingMessageContext: ChatStreamEventContext = {
      input: { role: 'user', content: sendingMessage, createdAt: sendingCreatedAt },
      contexts: { ...activeContexts.value },
      composedMessage: [],
    }

    const isStaleGeneration = () => getSessionGeneration(sessionId) !== generation
    const shouldAbort = () => isStaleGeneration()
    if (shouldAbort())
      return

    sending.value = true

    streamingMessage.value = { role: 'assistant', content: '', slices: [], tool_results: [], createdAt: Date.now() }

    trackFirstMessage()
    try {
      await emitBeforeMessageComposedHooks(sendingMessage, streamingMessageContext)

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
      streamingMessageContext.input.content = finalContent

      if (shouldAbort())
        return

      const sessionMessagesForSend = getSessionMessagesById(sessionId)
      sessionMessagesForSend.push({ role: 'user', content: finalContent })

      const parser = useLlmmarkerParser({
        onLiteral: async (literal) => {
          if (shouldAbort())
            return

          await emitTokenLiteralHooks(literal, streamingMessageContext)

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
          if (shouldAbort())
            return

          await emitTokenSpecialHooks(special, streamingMessageContext)
        },
        minLiteralEmitLength: 24, // Avoid emitting literals too fast. This is a magic number and can be changed later.
      })

      const toolCallQueue = createQueue<ChatSlices>({
        handlers: [
          async (ctx) => {
            if (shouldAbort())
              return
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

      let newMessages = sessionMessagesForSend.map((msg) => {
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

      // TODO: possible prototype pollution as key of activeContexts is from external source
      // TODO: sanitize keys or use a safer structure
      if (Object.keys(activeContexts.value).length > 0) {
        const system = newMessages.slice(0, 1)
        const afterSystem = newMessages.slice(1, newMessages.length)

        newMessages = [
          ...system,
          {
            role: 'user',
            content: [
            // TODO: use prompt render & i18n system later
            // TODO: Module should have description & context length management
              { type: 'text', text: ''
                + 'These are the contextual information retrieved or on-demand updated from other modules, you may use them as context for chat, or reference of the next action, tool call, etc.:\n'
                + `${Object.entries(activeContexts.value).map(([key, value]) => `Module ${key}: ${JSON.stringify(value)}`).join('\n')}\n` },
            ],
          },
          ...afterSystem,
        ]
      }

      streamingMessageContext.composedMessage = newMessages as Message[]

      await emitAfterMessageComposedHooks(sendingMessage, streamingMessageContext)
      await emitBeforeSendHooks(sendingMessage, streamingMessageContext)

      let fullText = ''
      const headers = (options.providerConfig?.headers || {}) as Record<string, string>

      if (shouldAbort())
        return

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
      if (!isStaleGeneration() && streamingMessage.value.slices.length > 0) {
        sessionMessagesForSend.push(toRaw(streamingMessage.value))
      }

      // Instruct the TTS pipeline to flush by calling hooks directly
      const flushSignal = `${TTS_FLUSH_INSTRUCTION}${TTS_FLUSH_INSTRUCTION}`
      await emitTokenLiteralHooks(flushSignal, streamingMessageContext)

      // Call the end-of-stream hooks
      await emitStreamEndHooks(streamingMessageContext)

      // Call the end-of-response hooks with the full text
      await emitAssistantResponseEndHooks(fullText, streamingMessageContext)

      await emitAfterSendHooks(sendingMessage, streamingMessageContext)
      await emitAssistantMessageHooks({ ...streamingMessage.value }, fullText, streamingMessageContext)
      await emitChatTurnCompleteHooks({
        output: { ...streamingMessage.value },
        outputText: fullText,
        toolCalls: sessionMessagesForSend.filter(msg => msg.role === 'tool') as ToolMessage[],
      }, streamingMessageContext)

      // Reset the streaming message for the next turn
      streamingMessage.value = { role: 'assistant', content: '', slices: [], tool_results: [] }
    }
    catch (error) {
      console.error('Error sending message:', error)
      throw error
    }
    finally {
      sending.value = false
    }
  }

  async function send(
    sendingMessage: string,
    options: SendOptions,
  ) {
    const sessionId = activeSessionId.value
    const generation = getSessionGeneration(sessionId)

    return new Promise<void>((resolve, reject) => {
      sendQueue.enqueue({
        sendingMessage,
        options,
        generation,
        sessionId,
        deferred: { resolve, reject },
      })
    })
  }

  return {
    sending,
    activeSessionId,
    messages,
    streamingMessage,

    discoverToolsCompatibility,

    send,
    setActiveSession,
    cleanupMessages,
    getAllSessions,
    replaceSessions,
    resetAllSessions,

    ingestContextMessage,

    clearHooks,

    emitBeforeMessageComposedHooks,
    emitAfterMessageComposedHooks,
    emitBeforeSendHooks,
    emitAfterSendHooks,
    emitTokenLiteralHooks,
    emitTokenSpecialHooks,
    emitStreamEndHooks,
    emitAssistantResponseEndHooks,
    emitAssistantMessageHooks,
    emitChatTurnCompleteHooks,

    onBeforeMessageComposed,
    onAfterMessageComposed,
    onBeforeSend,
    onAfterSend,
    onTokenLiteral,
    onTokenSpecial,
    onStreamEnd,
    onAssistantResponseEnd,
    onAssistantMessage,
    onChatTurnComplete,
  }
})

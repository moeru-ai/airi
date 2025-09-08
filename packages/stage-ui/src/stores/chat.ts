import type { ChatProvider } from '@xsai-ext/shared-providers'
import type { CommonContentPart, Message, SystemMessage, UserMessage } from '@xsai/shared-chat'

import type { StreamEvent } from '../stores/llm'
import type { ChatAssistantMessage, ChatMessage, ChatSlices } from '../types/chat'

import { useLocalStorage } from '@vueuse/core'
import { defineStore, storeToRefs } from 'pinia'
import { ref, toRaw, watch } from 'vue'

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

// TODO [lucas-oma]: remove console.debug and console.log before merging (eslint)

export const useChatStore = defineStore('chat', () => {
  const { stream, discoverToolsCompatibility } = useLLM()
  const { systemPrompt } = storeToRefs(useAiriCardStore())
  const { storeAIResponse, memoryServiceEnabled } = useMemoryService()
  const { loadHistory, isLoading: isLoadingHistory, hasMore: hasMoreHistory, error: historyError } = useConversationHistory()

  const sending = ref(false)
  const loadingInitialHistory = ref(false)
  const hasLoadedInitialHistory = ref(false)

  const onBeforeMessageComposedHooks = ref<Array<(message: string) => Promise<void>>>([])
  const onAfterMessageComposedHooks = ref<Array<(message: string) => Promise<void>>>([])
  const onBeforeSendHooks = ref<Array<(message: string) => Promise<void>>>([])
  const onAfterSendHooks = ref<Array<(message: string) => Promise<void>>>([])
  const onTokenLiteralHooks = ref<Array<(literal: string) => Promise<void>>>([])
  const onTokenSpecialHooks = ref<Array<(special: string) => Promise<void>>>([])
  const onStreamEndHooks = ref<Array<() => Promise<void>>>([])
  const onAssistantResponseEndHooks = ref<Array<(message: string) => Promise<void>>>([])

  function onBeforeMessageComposed(cb: (message: string) => Promise<void>) {
    onBeforeMessageComposedHooks.value.push(cb)
  }

  function onAfterMessageComposed(cb: (message: string) => Promise<void>) {
    onAfterMessageComposedHooks.value.push(cb)
  }

  function onBeforeSend(cb: (message: string) => Promise<void>) {
    onBeforeSendHooks.value.push(cb)
  }

  function onAfterSend(cb: (message: string) => Promise<void>) {
    onAfterSendHooks.value.push(cb)
  }

  function onTokenLiteral(cb: (literal: string) => Promise<void>) {
    onTokenLiteralHooks.value.push(cb)
  }

  function onTokenSpecial(cb: (special: string) => Promise<void>) {
    onTokenSpecialHooks.value.push(cb)
  }

  function onStreamEnd(cb: () => Promise<void>) {
    onStreamEndHooks.value.push(cb)
  }

  function onAssistantResponseEnd(cb: (message: string) => Promise<void>) {
    onAssistantResponseEndHooks.value.push(cb)
  }

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

  const messages = useLocalStorage<Array<ChatMessage | ErrorMessage>>('chat/messages', [generateInitialMessage()])

  function cleanupMessages() {
    messages.value = [generateInitialMessage()]
  }

  watch(systemPrompt, () => {
    if (messages.value.length > 0 && messages.value[0].role === 'system') {
      messages.value[0] = generateInitialMessage()
    }
  }, {
    immediate: true,
  })

  const streamingMessage = ref<ChatAssistantMessage>({ role: 'assistant', content: '', slices: [], tool_results: [] })

  // Dedupe guard to prevent duplicate storage calls
  const DEDUPE_WINDOW_MS = 100
  const DEDUPE_STORAGE_KEY = 'airi-chat-last-message'

  function shouldSkipStorage(message: string): boolean {
    try {
      const lastMessageData = localStorage.getItem(DEDUPE_STORAGE_KEY)

      if (!lastMessageData) {
        localStorage.setItem(DEDUPE_STORAGE_KEY, JSON.stringify({ message, timestamp: Date.now() }))
        return false
      }

      const { message: lastMessage, timestamp } = JSON.parse(lastMessageData)
      const now = Date.now()
      const timeDiff = now - timestamp

      // Skip if same message and within dedupe window
      if (message === lastMessage && timeDiff < DEDUPE_WINDOW_MS) {
        // console.log('Dedup check - Skipping duplicate message')
        return true
      }

      // Update with current message
      localStorage.setItem(DEDUPE_STORAGE_KEY, JSON.stringify({ message, timestamp: now }))
      return false
    }
    catch (error) {
      console.warn('Dedupe guard error:', error)
      return false
    }
  }

  async function send(
    sendingMessage: string,
    options: {
      model: string
      chatProvider: ChatProvider
      providerConfig?: Record<string, unknown>
      attachments?: { type: 'image', data: string, mimeType: string }[]
    },
  ) {
    try {
      sending.value = true

      if (!sendingMessage && !options.attachments?.length)
        return

      for (const hook of onBeforeMessageComposedHooks.value) {
        await hook(sendingMessage)
      }

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

      messages.value.push({ role: 'user', content: finalContent })

      const parser = useLlmmarkerParser({
        onLiteral: async (literal) => {
          for (const hook of onTokenLiteralHooks.value) {
            await hook(literal)
          }

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
          for (const hook of onTokenSpecialHooks.value) {
            await hook(special)
          }
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
      // Don't reset currentResponseStored here - it should persist for the entire response
      const newMessages = messages.value.map((msg) => {
        if (msg.role === 'assistant') {
          const { slices: _, ...rest } = msg // exclude slices
          rest.tool_results = toRaw(rest.tool_results)
          return toRaw(rest)
        }
        return toRaw(msg)
      })

      for (const hook of onAfterMessageComposedHooks.value) {
        await hook(sendingMessage)
      }

      for (const hook of onBeforeSendHooks.value) {
        await hook(sendingMessage)
      }

      let fullText = ''
      const headers = (options.providerConfig?.headers || {}) as Record<string, string>

      await stream(options.model, options.chatProvider, newMessages as Message[], {
        headers,
        async onStreamEvent(event: StreamEvent) {
          if (event.type === 'tool-call') {
            toolCallQueue.enqueue({
              type: 'tool-call',
              toolCall: event,
            })
          }
          else if (event.type === 'tool-result') {
            toolCallQueue.enqueue({
              type: 'tool-call-result',
              id: event.toolCallId,
              result: event.result,
            })
          }
          else if (event.type === 'text-delta') {
            fullText += event.text
            await parser.consume(event.text)
          }
          else if (event.type === 'finish') {
            // console.log(`Stream FINISH event triggered`)

            // Finalize the parsing of the actual message content
            await parser.end()

            // Add the completed message to the history only if it has content
            if (streamingMessage.value.slices.length > 0)
              messages.value.push(toRaw(streamingMessage.value))

            // Reset the streaming message for the next turn
            streamingMessage.value = { role: 'assistant', content: '', slices: [], tool_results: [] }

            // Instruct the TTS pipeline to flush by calling hooks directly
            const flushSignal = `${TTS_FLUSH_INSTRUCTION}${TTS_FLUSH_INSTRUCTION}`
            for (const hook of onTokenLiteralHooks.value)
              await hook(flushSignal)

            // Call the end-of-stream hooks
            for (const hook of onStreamEndHooks.value)
              await hook()

            // Call the end-of-response hooks with the full text
            for (const hook of onAssistantResponseEndHooks.value)
              await hook(fullText)

            // Async: Store AI response in memory service (fire and forget)
            if (memoryServiceEnabled?.value && !shouldSkipStorage(sendingMessage)) {
              // Format the full prompt
              const fullPrompt = newMessages.map(msg =>
                `${msg.role.toUpperCase()}: ${typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)}`,
              ).join('\n\n')

              // Store the completion and update localStorage
              try {
                await storeAIResponse(fullPrompt, fullText, 'web')
                // console.log('Storing completion - Success, updating localStorage')
                // Update localStorage after successful storage
                localStorage.setItem(DEDUPE_STORAGE_KEY, JSON.stringify({
                  message: sendingMessage,
                  timestamp: Date.now(),
                }))
              }
              catch (error) {
                console.warn('Memory storage failed:', error)
              }
            }
            else {
              // console.log('Storing completion - Skipped due to dedup')
            }

            // console.debug('LLM output:', fullText)
          }
        },
      })

      for (const hook of onAfterSendHooks.value) {
        await hook(sendingMessage)
      }
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

  // Load more history when scrolling up
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
    messages,
    streamingMessage,
    loadingInitialHistory,
    isLoadingHistory,
    hasMoreHistory,
    historyError,

    discoverToolsCompatibility,
    loadInitialHistory,
    loadMoreHistory,
    send,
    cleanupMessages,

    onBeforeMessageComposed,
    onAfterMessageComposed,
    onBeforeSend,
    onAfterSend,
    onTokenLiteral,
    onTokenSpecial,
    onStreamEnd,
    onAssistantResponseEnd,
  }
})

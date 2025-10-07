import type { ChatProvider } from '@xsai-ext/shared-providers'
import type { CommonContentPart, Message, SystemMessage } from '@xsai/shared-chat'

import type { StreamEvent } from '../stores/llm'
import type { ChatAssistantMessage, ChatMessage, ChatSlices } from '../types/chat'

import { useLocalStorage } from '@vueuse/core'
import { defineStore, storeToRefs } from 'pinia'
import { ref, toRaw, watch } from 'vue'

import { useLlmmarkerParser } from '../composables/llmmarkerParser'
import { useLLM } from '../stores/llm'
import { createQueue } from '../utils/queue'
import { TTS_FLUSH_INSTRUCTION } from '../utils/tts'
import { useMemoryStore } from './memory'
import { useAiriCardStore } from './modules'

export interface ErrorMessage {
  role: 'error'
  content: string
}

export const useChatStore = defineStore('chat', () => {
  console.info('[Chat] Store initializing...')
  const { stream, discoverToolsCompatibility } = useLLM()
  const { systemPrompt } = storeToRefs(useAiriCardStore())
  console.info('[Chat] System prompt from card store:', systemPrompt.value?.substring(0, 100))
  const memoryStore = useMemoryStore()
  void memoryStore.fetchRecent()

  const sending = ref(false)

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

  function clearHooks() {
    onBeforeMessageComposedHooks.value = []
    onAfterMessageComposedHooks.value = []
    onBeforeSendHooks.value = []
    onAfterSendHooks.value = []
    onTokenLiteralHooks.value = []
    onTokenSpecialHooks.value = []
    onStreamEndHooks.value = []
    onAssistantResponseEndHooks.value = []
  }

  // I know this nu uh, better than loading all language on rehypeShiki
  const codeBlockSystemPrompt = '- For any programming code block, always specify the programming language that supported on @shikijs/rehype on the rendered markdown, eg. ```python ... ```\n'
  const mathSyntaxSystemPrompt = '- For any math equation, use LaTeX format, eg: $ x^3 $, always escape dollar sign outside math equation\n'

  function generateInitialMessage() {
    // TODO: compose, replace {{ user }} tag, etc
    const systemMessage = {
      role: 'system',
      content: codeBlockSystemPrompt + mathSyntaxSystemPrompt + systemPrompt.value,
    } satisfies SystemMessage

    // Debug: log the system prompt to verify it's being set correctly
    if (import.meta.env.DEV || typeof window !== 'undefined') {
      console.info('[Chat] System prompt length:', systemMessage.content.length)
      console.info('[Chat] System prompt preview:', systemMessage.content.substring(0, 200))
    }

    return systemMessage
  }

  const messages = useLocalStorage<Array<ChatMessage | ErrorMessage>>('chat/messages', [generateInitialMessage()], {
    serializer: {
      read: (raw: string) => {
        try {
          return JSON.parse(raw)
        }
        catch (error) {
          console.error('[Chat] Failed to parse stored messages, resetting:', error)
          return [generateInitialMessage()]
        }
      },
      write: (value: Array<ChatMessage | ErrorMessage>) => JSON.stringify(value),
    },
  })

  function cleanupMessages() {
    messages.value = [generateInitialMessage()]
  }

  watch(systemPrompt, (newPrompt, oldPrompt) => {
    if (messages.value.length > 0 && messages.value[0].role === 'system') {
      messages.value[0] = generateInitialMessage()
    }

    // If system prompt changed significantly, it's likely a different character card
    // Clear chat history to avoid confusion
    if (oldPrompt && newPrompt !== oldPrompt && messages.value.length > 1) {
      console.info('[Chat] System prompt changed, clearing chat history')
      cleanupMessages()
    }
  }, {
    immediate: true,
  })

  const streamingMessage = ref<ChatAssistantMessage>({ role: 'assistant', content: '', slices: [], tool_results: [] })

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

      streamingMessage.value = { role: 'assistant', content: '', slices: [], tool_results: [] }
      const newMessages = messages.value.map((msg) => {
        if (msg.role === 'assistant') {
          const { slices: _, ...rest } = msg // exclude slices
          rest.tool_results = toRaw(rest.tool_results)
          return toRaw(rest)
        }
        return toRaw(msg)
      })

      await memoryStore.fetchRecent()
      const similarMemories = await memoryStore.searchMemories(sendingMessage, 6)
      let messagesWithMemory = memoryStore.appendContextMessages(newMessages as Message[])

      if (similarMemories.length) {
        const longTermContext: Message = {
          role: 'system',
          content: `Relevant long-term memory entries:\n${similarMemories.map(memory => `${memory.role}: ${typeof memory.content === 'string' ? memory.content : JSON.stringify(memory.content)}`).join('\n')}`,
        }

        messagesWithMemory = messagesWithMemory.length
          ? [messagesWithMemory[0], longTermContext, ...messagesWithMemory.slice(1)]
          : [longTermContext]
      }

      for (const hook of onAfterMessageComposedHooks.value) {
        await hook(sendingMessage)
      }

      for (const hook of onBeforeSendHooks.value) {
        await hook(sendingMessage)
      }

      let fullText = ''
      const headers = (options.providerConfig?.headers || {}) as Record<string, string>

      await stream(options.model, options.chatProvider, messagesWithMemory, {
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
            // Finalize the parsing of the actual message content
            await parser.end()

            // Add the completed message to the history only if it has content
            if (streamingMessage.value.slices.length > 0)
              messages.value.push(toRaw(streamingMessage.value))

            // Reset the streaming message for the next turn
            streamingMessage.value = { role: 'assistant', content: '', slices: [], tool_results: [] }

            await memoryStore.saveMessage({
              role: 'assistant',
              content: fullText,
              timestamp: new Date(),
              metadata: { source: 'assistant-response' },
            })
            await memoryStore.fetchRecent()

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

            // eslint-disable-next-line no-console
            console.debug('LLM output:', fullText)
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

  watch(() => messages.value.length, (length, prevLength) => {
    if (length <= prevLength)
      return

    const latest = messages.value.at(-1)
    if (!latest)
      return

    if (latest.role === 'user') {
      void memoryStore.saveMessage({
        role: 'user',
        content: typeof latest.content === 'string' ? latest.content : JSON.stringify(latest.content),
        timestamp: new Date(),
        metadata: { source: 'user-message' },
      }).then(() => memoryStore.fetchRecent())
    }
  }, { flush: 'post' })

  return {
    sending,
    messages,
    streamingMessage,

    discoverToolsCompatibility,

    send,
    cleanupMessages,
    clearHooks,

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

import type { ChatProvider } from '@xsai-ext/shared-providers'
import type { Message, SystemMessage, UserMessagePart } from '@xsai/shared-chat'

import type { StreamEvent } from '../stores/llm'
import type { ChatAssistantMessage, ChatMessage, ChatSlices } from '../types/chat'

import { defineStore, storeToRefs } from 'pinia'
import { ref, toRaw } from 'vue'

import { useQueue } from '../composables'
import { useLlmmarkerParser } from '../composables/llmmarkerParser'
import { useLLM } from '../stores/llm'
import { TTS_FLUSH_INSTRUCTION } from '../utils/tts'
import { useAiriCardStore } from './modules'

export interface ErrorMessage {
  role: 'error'
  content: string
}

export const useChatStore = defineStore('chat', () => {
  const { stream, discoverToolsCompatibility } = useLLM()
  const { systemPrompt } = storeToRefs(useAiriCardStore())

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

  // I know this nu uh, better than loading all language on rehypeShiki
  const codeBlockSystemPrompt = '- For any programming code block, always specify the programming language that supported on @shikijs/rehype on the rendered markdown, eg. ```python ... ```\n'
  const mathSyntaxSystemPrompt = '- For any math equation, use LaTeX format, eg: $ x^3 $, always escape dollar sign outside math equation\n'

  const messages = ref<Array<ChatMessage | ErrorMessage>>([
    {
      role: 'system',
      content: codeBlockSystemPrompt + mathSyntaxSystemPrompt + systemPrompt.value, // TODO: compose, replace {{ user }} tag, etc
    } satisfies SystemMessage,
  ])

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

      const contentParts: UserMessagePart[] = [{ type: 'text', text: sendingMessage }]

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
      })

      const toolCallQueue = useQueue<ChatSlices>({
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
            toolCallQueue.add({
              type: 'tool-call',
              toolCall: event,
            })
          }
          else if (event.type === 'tool-result') {
            toolCallQueue.add({
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

  return {
    sending,
    messages,
    streamingMessage,

    discoverToolsCompatibility,

    send,

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

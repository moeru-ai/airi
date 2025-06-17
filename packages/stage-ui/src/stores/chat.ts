import type { ChatProvider } from '@xsai-ext/shared-providers'
import type { Message, SystemMessage } from '@xsai/shared-chat'

import type { ChatAssistantMessage, ChatMessage, ChatSlices } from '../types/chat'

import { defineStore, storeToRefs } from 'pinia'
import { ref, toRaw } from 'vue'

import { useQueue } from '../composables'
import { useLlmmarkerParser } from '../composables/llmmarkerParser'
import { useLLM } from '../stores/llm'
import { asyncIteratorFromReadableStream } from '../utils'
import { useAiriCardStore } from './modules'

export interface ErrorMessage {
  role: 'error'
  content: string
}

export const useChatStore = defineStore('chat', () => {
  const { stream } = useLLM()
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

  const messages = ref<Array<ChatMessage | ErrorMessage>>([
    {
      role: 'system',
      content: systemPrompt.value, // TODO: compose, replace {{ user }} tag, etc
    } satisfies SystemMessage,
  ])

  const streamingMessage = ref<ChatAssistantMessage>({ role: 'assistant', content: '', slices: [], tool_results: [] })

  async function send(sendingMessage: string, options: { model: string, chatProvider: ChatProvider, providerConfig?: Record<string, unknown> }) {
    try {
      sending.value = true

      if (!sendingMessage)
        return

      for (const hook of onBeforeMessageComposedHooks.value) {
        await hook(sendingMessage)
      }

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

      const slicesQueue = useQueue<ChatSlices>({
        handlers: [
          async (ctx) => { // FIXME: it still looks dirty
            if (ctx.data.type === 'text') {
              await parser.consume(ctx.data.text)
              return
            }

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
      messages.value.push({ role: 'user', content: sendingMessage })
      messages.value.push(streamingMessage.value)
      const newMessages = messages.value.slice(0, messages.value.length - 1).map((msg) => {
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

      const headers = (options.providerConfig?.headers || {}) as Record<string, string>
      const res = await stream(options.model, options.chatProvider, newMessages as Message[], {
        headers,
        onToolCall(toolCall) {
          slicesQueue.add({
            type: 'tool-call',
            toolCall,
          })
        },
        onToolCallResult(toolCallResult) {
          slicesQueue.add({
            type: 'tool-call-result',
            id: toolCallResult.id,
            result: toolCallResult.result,
          })
        },
      })

      for (const hook of onAfterSendHooks.value) {
        await hook(sendingMessage)
      }

      let fullText = ''

      for await (const textPart of asyncIteratorFromReadableStream(res.textStream, async v => v)) {
        slicesQueue.add({
          type: 'text',
          text: textPart,
        })
        fullText += textPart
      }

      await parser.end()

      for (const hook of onStreamEndHooks.value) {
        await hook()
      }

      for (const hook of onAssistantResponseEndHooks.value) {
        await hook(fullText)
      }

      // eslint-disable-next-line no-console
      console.debug('LLM output:', fullText)
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

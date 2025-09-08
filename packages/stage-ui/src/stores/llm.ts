import type { ChatProvider } from '@xsai-ext/shared-providers'
import type { CommonContentPart, CompletionToolCall, Message, SystemMessage } from '@xsai/shared-chat'

import { readableStreamToAsyncIterator } from '@moeru/std'
import { listModels } from '@xsai/model'
import { XSAIError } from '@xsai/shared'
import { streamText } from '@xsai/stream-text'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { useMemoryService } from '../composables/useMemoryService'
import { debug, mcp } from '../tools'

export type StreamEvent
  = | { type: 'text-delta', text: string }
    | ({ type: 'finish' } & any)
    | ({ type: 'tool-call' } & CompletionToolCall)
    | { type: 'tool-result', toolCallId: string, result?: string | CommonContentPart[] }
    | { type: 'error', error: any }

export interface StreamOptions {
  headers?: Record<string, string>
  onStreamEvent?: (event: StreamEvent) => void | Promise<void>
  toolsCompatibility?: Map<string, boolean>
  supportsTools?: boolean
  use_memory_service?: boolean
}

function streamOptionsToolsCompatibilityOk(model: string, chatProvider: ChatProvider, _: Message[], options?: StreamOptions, toolsCompatibility: Map<string, boolean> = new Map()): boolean {
  return !!(options?.supportsTools || toolsCompatibility.get(`${chatProvider.chat(model).baseURL}-${model}`))
}

async function streamFrom(model: string, chatProvider: ChatProvider, messages: Message[], options?: StreamOptions) {
  // TODO [lucas-oma]: optimize this function
  // Right now, it fetches context and then makes LLM call for AI response,
  // this can and should be integrated into a new streamText call/function and the server API should be removed and handled
  // inside the message ingestion API.

  const { memoryServiceEnabled, memoryServiceUrl, memoryApiKey } = useMemoryService()
  let formattedMessages = messages.map(msg => ({ ...msg, content: (msg.role as string === 'error' ? `User encountered error: ${msg.content}` : msg.content), role: (msg.role as string === 'error' ? 'user' : msg.role) } as Message))

  if (memoryServiceEnabled.value) {
    try {
      if (!memoryServiceUrl.value) {
        throw new Error('Memory service URL not configured')
      }

      // Headers just for memory service
      const memoryHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      }

      if (memoryApiKey.value.trim()) {
        memoryHeaders.Authorization = `Bearer ${memoryApiKey.value}`
      }

      // 1. First get context
      const contextResponse = await fetch(`${memoryServiceUrl.value}/api/context`, {
        method: 'POST',
        headers: memoryHeaders,
        body: JSON.stringify({
          message: messages[messages.length - 1].content, // last message
        }),
      })

      if (!contextResponse.ok) {
        throw new Error(`Failed to get context: ${contextResponse.statusText}`)
      }

      const context = await contextResponse.json()

      // 2. Add context as system message
      formattedMessages = [
        ...formattedMessages,
        ...(context
          ? [{
              role: 'system',
              content: context, // Context is already a formatted string
            } as SystemMessage]
          : []),
      ]
    }
    catch (error) {
      console.error('Error fetching context:', error)
      // Continue with normal flow if context fails
    }
  }

  const headers = options?.headers

  return await streamText({
    ...chatProvider.chat(model),
    maxSteps: 10,
    // TODO: proper format for other error messages.
    messages: formattedMessages,
    headers,
    // TODO: we need Automatic tools discovery
    tools: streamOptionsToolsCompatibilityOk(model, chatProvider, messages, options)
      ? [
          ...await mcp(),
          ...await debug(),
        ]
      : undefined,
    onEvent(event) {
      options?.onStreamEvent?.(event as StreamEvent)
    },
  })
}

export async function attemptForToolsCompatibilityDiscovery(model: string, chatProvider: ChatProvider, _: Message[], options?: Omit<StreamOptions, 'supportsTools'>): Promise<boolean> {
  async function attempt(enable: boolean) {
    try {
      const res = await streamFrom(model, chatProvider, [{ role: 'user', content: 'Hello, world!' }], { ...options, supportsTools: enable })
      for await (const _ of readableStreamToAsyncIterator(res.textStream)) {
        // Drop
      }

      return true
    }
    catch (err) {
      if (err instanceof Error && err.name === new XSAIError('').name) {
        // TODO: if you encountered many more errors like these, please, add them here.

        // Ollama
        /**
         * {"error":{"message":"registry.ollama.ai/<scope>/<model> does not support tools","type":"api_error","param":null,"code":null}}
         */
        if (String(err).includes('does not support tools')) {
          return false
        }
        // OpenRouter
        /**
         * {"error":{"message":"No endpoints found that support tool use. To learn more about provider routing, visit: https://openrouter.ai/docs/provider-routing","code":404}}
         */
        if (String(err).includes('No endpoints found that support tool use.')) {
          return false
        }
      }

      throw err
    }
  }

  function promiseAllWithInterval<T>(promises: (() => Promise<T>)[], interval: number): Promise<{ result?: T, error?: any }[]> {
    return new Promise((resolve) => {
      const results: { result?: T, error?: any }[] = []
      let completed = 0

      promises.forEach((promiseFn, index) => {
        setTimeout(() => {
          promiseFn()
            .then((result) => {
              results[index] = { result }
            })
            .catch((err) => {
              results[index] = { error: err }
            })
            .finally(() => {
              completed++
              if (completed === promises.length) {
                resolve(results)
              }
            })
        }, index * interval)
      })
    })
  }

  const attempts = [
    () => attempt(true),
    () => attempt(false),
  ]

  const attemptsResults = await promiseAllWithInterval<boolean | undefined>(attempts, 1000)
  if (attemptsResults.some(res => res.error)) {
    const err = new Error(`Error during tools compatibility discovery for model: ${model}. Errors: ${attemptsResults.map(res => res.error).filter(Boolean).join(', ')}`)
    err.cause = attemptsResults.map(res => res.error).filter(Boolean)
    throw err
  }

  return attemptsResults[0].result === true && attemptsResults[1].result === true
}

export const useLLM = defineStore('llm', () => {
  const toolsCompatibility = ref<Map<string, boolean>>(new Map())

  async function discoverToolsCompatibility(model: string, chatProvider: ChatProvider, _: Message[], options?: Omit<StreamOptions, 'supportsTools'>) {
    // Cached, no need to discover again
    if (toolsCompatibility.value.has(`${chatProvider.chat(model).baseURL}-${model}`)) {
      return
    }

    const res = await attemptForToolsCompatibilityDiscovery(model, chatProvider, _, { ...options, toolsCompatibility: toolsCompatibility.value })
    toolsCompatibility.value.set(`${chatProvider.chat(model).baseURL}-${model}`, res)
  }

  function stream(model: string, chatProvider: ChatProvider, messages: Message[], options?: StreamOptions) {
    return streamFrom(model, chatProvider, messages, { ...options, toolsCompatibility: toolsCompatibility.value })
  }

  async function models(apiUrl: string, apiKey: string) {
    if (apiUrl === '') {
      return []
    }

    try {
      return await listModels({
        baseURL: (apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`) as `${string}/`,
        apiKey,
      })
    }
    catch (err) {
      if (String(err).includes(`Failed to construct 'URL': Invalid URL`)) {
        return []
      }

      throw err
    }
  }

  return {
    models,
    stream,
    discoverToolsCompatibility,
  }
})

import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { CommonContentPart, CompletionToolCall, Message, Tool } from '@xsai/shared-chat'

import { generateText } from '@xsai/generate-text'
import { listModels } from '@xsai/model'
import { streamText } from '@xsai/stream-text'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { mcp } from '../tools'

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
  waitForTools?: boolean // when true,won't resolve on finishReason=='tool_calls';
  tools?: Tool[] | (() => Promise<Tool[] | undefined>)
}

// TODO: proper format for other error messages.
function sanitizeMessages(messages: unknown[]): Message[] {
  return messages.map((m: any) => {
    if (m && m.role === 'error') {
      return {
        role: 'user',
        content: `User encountered error: ${String(m.content ?? '')}`,
      } as Message
    }
    return m as Message
  })
}

function streamOptionsToolsCompatibilityOk(model: string, chatProvider: ChatProvider, _: Message[], options?: StreamOptions): boolean {
  return !!(options?.supportsTools || options?.toolsCompatibility?.get(`${chatProvider.chat(model).baseURL}-${model}`))
}

async function streamFrom(model: string, chatProvider: ChatProvider, messages: Message[], options?: StreamOptions) {
  const headers = options?.headers
  const chatConfig = chatProvider.chat(model)

  const sanitized = sanitizeMessages(messages as unknown[])
  const resolveTools = async () => {
    const tools = typeof options?.tools === 'function'
      ? await options.tools()
      : options?.tools
    return tools ?? []
  }

  const supportedTools = streamOptionsToolsCompatibilityOk(model, chatProvider, messages, options)
  const tools = supportedTools
    ? [
        ...await mcp(),
        ...await resolveTools(),
      ]
    : undefined

  return new Promise<void>((resolve, reject) => {
    let settled = false
    const resolveOnce = () => {
      if (settled)
        return
      settled = true
      resolve()
    }
    const rejectOnce = (err: unknown) => {
      if (settled)
        return
      settled = true
      reject(err)
    }

    const onEvent = async (event: unknown) => {
      try {
        await options?.onStreamEvent?.(event as StreamEvent)
        if (event && (event as StreamEvent).type === 'finish') {
          const finishReason = (event as any).finishReason
          if (finishReason !== 'tool_calls' || !options?.waitForTools)
            resolveOnce()
        }
        else if (event && (event as StreamEvent).type === 'error') {
          const error = (event as any).error ?? new Error('Stream error')
          rejectOnce(error)
        }
      }
      catch (err) {
        rejectOnce(err)
      }
    }

    try {
      streamText({
        ...chatConfig,
        maxSteps: 10,
        messages: sanitized,
        headers,
        // TODO: we need Automatic tools discovery
        tools,
        onEvent,
      })
    }
    catch (err) {
      rejectOnce(err)
    }
  })
}

async function generateFrom(model: string, chatProvider: ChatProvider, messages: Message[], options?: StreamOptions) {
  const headers = options?.headers
  const chatConfig = chatProvider.chat(model)
  const sanitized = sanitizeMessages(messages as unknown[])

  const resolveTools = async () => {
    const tools = typeof options?.tools === 'function'
      ? await options.tools()
      : options?.tools
    return tools ?? []
  }

  const supportedTools = streamOptionsToolsCompatibilityOk(model, chatProvider, messages, options)
  const tools = supportedTools
    ? [
        ...await mcp(),
        ...await resolveTools(),
      ]
    : undefined

  return await generateText({
    ...chatConfig,
    messages: sanitized,
    headers,
    tools,
  })
}

export const useLLM = defineStore('llm', () => {
  const toolsCompatibility = ref<Map<string, boolean>>(new Map())

  function stream(model: string, chatProvider: ChatProvider, messages: Message[], options?: StreamOptions) {
    // Disable automatic discovery to save user credits.
    // Tools will be attempted blindly or skip discovery entirely.
    return streamFrom(model, chatProvider, messages, { ...options, toolsCompatibility: toolsCompatibility.value })
  }

  function generate(model: string, chatProvider: ChatProvider, messages: Message[], options?: StreamOptions) {
    return generateFrom(model, chatProvider, messages, { ...options, toolsCompatibility: toolsCompatibility.value })
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
    generate,
  }
})

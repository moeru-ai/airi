import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { CommonContentPart, CompletionToolCall, Message, Tool } from '@xsai/shared-chat'

import { useLocalStorage } from '@vueuse/core'
import { generateText } from '@xsai/generate-text'
import { listModels } from '@xsai/model'
import { streamText } from '@xsai/stream-text'
import { defineStore } from 'pinia'

import { mcp } from '../tools'

export type StreamEvent
  = | { type: 'text-delta', text: string }
    | { type: 'reasoning-delta', text: string }
    | ({ type: 'finish' } & any)
    | ({ type: 'tool-call' } & CompletionToolCall)
    | { type: 'tool-result', toolCallId: string, result?: string | CommonContentPart[] }
    | { type: 'error', error: any }

export interface StreamOptions {
  headers?: Record<string, string>
  onStreamEvent?: (event: StreamEvent) => void | Promise<void>
  toolsCompatibility?: Record<string, boolean>
  supportsTools?: boolean
  waitForTools?: boolean // when true,won't resolve on finishReason=='tool_calls';
  tools?: Tool[] | (() => Promise<Tool[] | undefined>)
  abortSignal?: AbortSignal
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
    // NOTICE: This block is critical for backward compatibility with LLM providers (e.g., DeepSeek)
    // that expect message content to be a string, not an array of content parts.
    // Failure to flatten array content (when no image_url is present) can lead to
    // deserialization errors like "invalid type: sequence, expected a string".
    if (m && Array.isArray(m.content)) {
      const contentParts = m.content as { type?: string, text?: string }[]
      if (!contentParts.some(p => p?.type === 'image_url')) {
        return { ...m, content: contentParts.map(p => p?.text ?? '').join('') } as Message
      }
    }
    return m as Message
  })
}

function streamOptionsToolsCompatibilityOk(model: string, chatProvider: ChatProvider, _: Message[], options?: StreamOptions): boolean {
  return !!(options?.supportsTools || options?.toolsCompatibility?.[`${chatProvider.chat(model).baseURL}-${model}`])
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

  if (tools && tools.length > 0) {
    console.log('Calling LLM with tools', tools.map((t: any) => t.function?.name || t.name))
  }
  else {
    console.log('Calling LLM with NO tools available')
  }

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
        abortSignal: options?.abortSignal,
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

  if (tools && tools.length > 0) {
    console.log('Calling LLM with tools', tools.map((t: any) => t.function?.name || t.name))
  }
  else {
    console.log('Calling LLM with NO tools available')
  }

  return await generateText({
    ...chatConfig,
    messages: sanitized,
    headers,
    tools,
  })
}

export async function attemptForToolsCompatibilityDiscovery(model: string, chatProvider: ChatProvider, _: Message[], options?: Omit<StreamOptions, 'supportsTools'>): Promise<boolean> {
  async function attempt(enable: boolean) {
    let toolsError = false
    try {
      await streamFrom(model, chatProvider, [{ role: 'user', content: 'Hello, world!' }], {
        ...options,
        supportsTools: enable,
        onStreamEvent: (event) => {
          if (event.type === 'error') {
            const errStr = String(event.error)
            if (errStr.includes('does not support tools') || errStr.includes('No endpoints found that support tool use.')) {
              toolsError = true
            }
          }
        },
      })
      return !toolsError
    }
    catch (err) {
      if (toolsError)
        return false
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
  const toolsCompatibility = useLocalStorage<Record<string, boolean>>('settings/llm/tools-compatibility-v3', {})

  function stream(model: string, chatProvider: ChatProvider, messages: Message[], options?: StreamOptions) {
    // Disable automatic discovery to save user credits.
    // Tools will be attempted blindly or skip discovery entirely.
    return streamFrom(model, chatProvider, messages, { ...options, toolsCompatibility: toolsCompatibility.value })
  }

  function generate(model: string, chatProvider: ChatProvider, messages: Message[], options?: StreamOptions) {
    return generateFrom(model, chatProvider, messages, { ...options, toolsCompatibility: toolsCompatibility.value })
  }

  async function discoverToolsCompatibility(model: string, chatProvider: ChatProvider, _: Message[], options?: Omit<StreamOptions, 'supportsTools'>) {
    // Cached, no need to discover again
    const key = `${chatProvider.chat(model).baseURL}-${model}`
    if (key in toolsCompatibility.value) {
      return
    }

    const res = await attemptForToolsCompatibilityDiscovery(model, chatProvider, _, { ...options, toolsCompatibility: toolsCompatibility.value })
    toolsCompatibility.value[key] = res
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
    discoverToolsCompatibility,
  }
})

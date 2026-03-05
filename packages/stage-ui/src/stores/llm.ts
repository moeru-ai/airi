import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { CommonContentPart, CompletionToolCall, Message, Tool } from '@xsai/shared-chat'

import { listModels } from '@xsai/model'
import { XSAIError } from '@xsai/shared'
import { streamText } from '@xsai/stream-text'
import { defineStore } from 'pinia'
import { ref } from 'vue'

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
  waitForTools?: boolean // when true,won't resolve on finishReason=='tool_calls';
  tools?: Tool[] | (() => Promise<Tool[] | undefined>)
}

function createToolsCompatibilityKey(model: string, chatProvider: ChatProvider): string {
  return `${chatProvider.chat(model).baseURL}-${model}`
}

function isKnownToolsUnsupportedError(error: unknown): boolean {
  const message = String(error).toLowerCase()
  return message.includes('does not support tools')
    || message.includes('no endpoints found that support tool use')
    || message.includes('does not support tool use')
    || message.includes('tool use is not supported')
    || message.includes('tools are not supported')
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
  if (typeof options?.supportsTools === 'boolean') {
    return options.supportsTools
  }

  const discovered = options?.toolsCompatibility?.get(createToolsCompatibilityKey(model, chatProvider))
  if (typeof discovered === 'boolean') {
    return discovered
  }

  // NOTICE: default optimistic-on so first message after provider switch can still use tools.
  return true
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
        ...await debug(),
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
      const stream = streamText({
        ...chatProvider.chat(model),
        maxSteps: 10,
        // NOTICE: keep tool execution serial to reduce duplicated side effects from parallel tool calls.
        parallelToolCalls: false,
        messages: sanitized,
        headers,
        // TODO: we need Automatic tools discovery
        tools,
        onEvent,
      })

      // NOTICE: some providers can end stream without a terminal `finish` event
      // (for example when max tool steps are exhausted). Resolve from stream completion
      // as a fallback to avoid hanging chat turns.
      void stream.steps.then(() => {
        resolveOnce()
      }).catch((error) => {
        rejectOnce(error)
      })
    }
    catch (err) {
      rejectOnce(err)
    }
  })
}

export async function attemptForToolsCompatibilityDiscovery(model: string, chatProvider: ChatProvider, _: Message[], options?: Omit<StreamOptions, 'supportsTools'>): Promise<boolean> {
  async function attempt(enable: boolean) {
    try {
      await streamFrom(model, chatProvider, [{ role: 'user', content: 'Hello, world!' }], { ...options, supportsTools: enable })
      return true
    }
    catch (err) {
      if (err instanceof Error && err.name === new XSAIError('').name && isKnownToolsUnsupportedError(err)) {
        return false
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
    const key = createToolsCompatibilityKey(model, chatProvider)

    // Cached, no need to discover again
    if (toolsCompatibility.value.has(key)) {
      return
    }

    try {
      const res = await attemptForToolsCompatibilityDiscovery(model, chatProvider, _, { ...options, toolsCompatibility: toolsCompatibility.value })
      toolsCompatibility.value.set(key, res)
    }
    catch (error) {
      // NOTICE: remote providers may intermittently fail capability probes.
      // Keep tools optimistic-on for MVP, then downgrade on real request rejection.
      console.warn(`[llm] tools compatibility discovery failed for ${key}, fallback to tools enabled`, error)
      toolsCompatibility.value.set(key, true)
    }
  }

  async function stream(model: string, chatProvider: ChatProvider, messages: Message[], options?: StreamOptions) {
    const key = createToolsCompatibilityKey(model, chatProvider)
    const toolsEnabled = streamOptionsToolsCompatibilityOk(model, chatProvider, messages, {
      ...options,
      toolsCompatibility: toolsCompatibility.value,
    })
    console.debug(`[llm] tools ${toolsEnabled ? 'enabled' : 'disabled'} for ${key}`)

    try {
      return await streamFrom(model, chatProvider, messages, { ...options, toolsCompatibility: toolsCompatibility.value })
    }
    catch (error) {
      if (isKnownToolsUnsupportedError(error)) {
        // NOTICE: probe can be wrong for some remote providers. Downgrade and retry once without tools.
        toolsCompatibility.value.set(key, false)
        console.warn(`[llm] provider rejected tools for ${key}, retrying without tools`, error)
        return streamFrom(model, chatProvider, messages, {
          ...options,
          supportsTools: false,
          toolsCompatibility: toolsCompatibility.value,
        })
      }

      throw error
    }
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

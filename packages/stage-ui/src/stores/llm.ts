import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { CommonContentPart, CompletionToolCall, Message, Tool } from '@xsai/shared-chat'

import { listModels } from '@xsai/model'
import { XSAIError } from '@xsai/shared'
import { streamText } from '@xsai/stream-text'
import { defineStore } from 'pinia'
import { ref } from 'vue'

import { airiSelf, hasAiriSelfNavigationBridge, mcp } from '../tools'
import { runManualToolLoop } from './llm-tool-loop'
import { beginMcpApprovalSession, endMcpApprovalSession } from './mcp-approval-session'

export type StreamEvent
  = | { type: 'text-delta', text: string }
    | ({ type: 'finish' } & any)
    | ({ type: 'tool-call' } & CompletionToolCall)
    | { type: 'tool-result', toolCallId: string, result?: string | CommonContentPart[] }
    | { type: 'error', error: any }

export interface StreamOptions {
  abortSignal?: AbortSignal
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
  return (
    // OpenAI / Azure OpenAI / Ollama
    message.includes('does not support tools')
    // OpenRouter
    || message.includes('no endpoints found that support tool use')
    // Anthropic
    || message.includes('does not support tool use')
    // Together AI
    || message.includes('tool use is not supported')
    // Fireworks AI
    || message.includes('tools are not supported')
    // Google Gemini
    || message.includes('tool use with function calling is unsupported')
    // Cloudflare Workers AI / vLLM / SGLang
    || message.includes('function calling is not supported')
  )
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

function createApprovalSessionId() {
  if (typeof globalThis.crypto?.randomUUID === 'function')
    return globalThis.crypto.randomUUID()

  return `mcp-approval-${Date.now()}`
}

// TODO: injected strict tool-use guidance should become configurable or
// removable once provider behavior is stable enough across the matrix.
function injectStrictToolUseGuidance(messages: Message[]): Message[] {
  // NOTICE: This guidance is used on providers that have shown a tendency to
  // narrate or fabricate progress instead of actually calling tools inside
  // AIRI's tool loop. The phrasing is intentionally strong because vague
  // guidance does not reliably recover those providers onto the real tool path.
  const guidance: Message = {
    role: 'developer',
    content: [
      'CRITICAL TOOL-USE RULES:',
      '1. When the user asks you to perform an action that can be fulfilled by calling a tool, you MUST make the tool call. NEVER simulate, fabricate, or assume the result of a tool call. If you need to run a workflow, execute a command, take a screenshot, or interact with the desktop, you MUST call mcp_call_tool with the correct tool name and parameters.',
      '2. NEVER output text like "status=running", "executing...", or any fabricated status. If you haven\'t actually called the tool, say so and then call it.',
      '3. When using computer_use MCP tools, be goal-driven rather than script-driven. Choose the execution surface that best matches the job, adapt when blocked, and keep iterating until the target state is verified.',
      '4. For AIRI desktop/Electron/native-app work, prefer desktop_* tools, terminal_exec, and workflow_* tools. When the task is inside AIRI itself (for example chat, settings, or module configuration), use the native airi_open_settings, airi_open_settings_module, and airi_return_to_chat tools for navigation instead of trying to reopen AIRI with desktop_open_app. For DOM interaction, prefer airi_self_devtools::* tools. Use desktop_screenshot only when structured metadata is insufficient. Treat click/type/press/scroll as the last resort, not the default.',
      '4.1. If the user asks you to come to their desktop, enter desktop mode, look at the desktop with them, or follow what is happening on screen, that is a real desktop-tool request. Start with desktop_observe_scene (or another non-mutating desktop observation tool) instead of replying conversationally.',
      '5. For real browser pages, Discord Web, OAuth flows, or iframe-heavy forms, prefer browser_dom_* tools for deterministic DOM reads/writes and verification. When the extension bridge is unavailable, use the workflow/browser reroute signal or browser_cdp_* tools instead of inventing a second browser-agent path.',
      '6. When a value must move between apps or between a browser page and AIRI settings, use clipboard_read_text / clipboard_write_text or browser_dom_* value reads before falling back to manual retyping. When the secret is stored in a local .env file, prefer secret_read_env_value over terminal_exec("cat .env"). Do not rely on memory for secrets or long values.',
      '7. Terminal and app-open actions may trigger desktop approval dialogs. Do not stop at narration: continue calling tools until you can verify success from AIRI state, browser state, terminal output, or another observable result.',
      '8. Treat obvious placeholder/template/example secrets as missing values. If a source contains strings like "replace-with", "example", or "your-token-here", do not keep rereading the same source; switch to another source or another execution surface.',
    ].join('\n') as any,
  }

  const systemBoundary = messages.findIndex(message => message.role !== 'system')
  if (systemBoundary === -1)
    return [...messages, guidance]

  return [
    ...messages.slice(0, systemBoundary),
    guidance,
    ...messages.slice(systemBoundary),
  ]
}

function streamOptionsToolsCompatibilityOk(model: string, chatProvider: ChatProvider, _: Message[], options?: StreamOptions): boolean {
  if (typeof options?.supportsTools === 'boolean') {
    return options.supportsTools
  }

  const discovered = options?.toolsCompatibility?.get(createToolsCompatibilityKey(model, chatProvider))
  if (typeof discovered === 'boolean') {
    return discovered
  }

  return true
}

export async function resolveBuiltinChatTools(params: {
  approvalSessionId?: string
  promptContentMode: 'default' | 'tight' | 'tight-text-only'
  extraTools?: Tool[]
}): Promise<Tool[]> {
  const tools: Tool[] = [
    ...await mcp({
      approvalSessionId: params.approvalSessionId,
      promptContentMode: params.promptContentMode,
    }),
  ]

  if (hasAiriSelfNavigationBridge()) {
    tools.push(...await airiSelf())
  }

  if (params.extraTools?.length) {
    tools.push(...params.extraTools)
  }

  return tools
}

async function streamFrom(model: string, chatProvider: ChatProvider, messages: Message[], options?: StreamOptions) {
  const headers = options?.headers
  const chatConfig = chatProvider.chat(model)

  const approvalSessionId = createApprovalSessionId()
  beginMcpApprovalSession(approvalSessionId)

  const sanitizedBase = sanitizeMessages(messages as unknown[])
  const sanitized = shouldUseManualToolLoop(String(chatConfig.baseURL))
    ? injectStrictToolUseGuidance(sanitizedBase)
    : sanitizedBase
  const resolveTools = async () => {
    const tools = typeof options?.tools === 'function'
      ? await options.tools()
      : options?.tools
    return tools ?? []
  }

  const supportedTools = streamOptionsToolsCompatibilityOk(model, chatProvider, messages, options)
  const mcpPromptContentMode = resolveMcpPromptContentMode(String(chatConfig.baseURL), model)
  const parallelToolCalls = resolveParallelToolCalls(String(chatConfig.baseURL), model)
  const extraTools = await resolveTools()
  const tools = supportedTools
    ? await resolveBuiltinChatTools({
        approvalSessionId,
        promptContentMode: mcpPromptContentMode,
        extraTools,
      })
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
      if (tools && tools.length > 0 && shouldUseManualToolLoop(String(chatConfig.baseURL))) {
        void runManualToolLoop({
          approvalSessionId,
          abortSignal: options?.abortSignal,
          chatProvider,
          headers,
          maxSteps: 10,
          messages: sanitized,
          model,
          onStreamEvent: onEvent as StreamOptions['onStreamEvent'],
          promptContentMode: mcpPromptContentMode,
          tools,
        }).then(() => {
          resolveOnce()
        }).catch((error) => {
          rejectOnce(error)
        })
        return
      }

      const stream = streamText({
        abortSignal: options?.abortSignal,
        ...chatConfig,
        maxSteps: 10,
        ...(typeof parallelToolCalls === 'boolean' ? { parallelToolCalls } : {}),
        messages: sanitized,
        headers,
        // TODO: we need Automatic tools discovery
        tools,
        onEvent,
      })

      void stream.steps.then(() => {
        resolveOnce()
      }).catch((error) => {
        rejectOnce(error)
      })
    }
    catch (err) {
      rejectOnce(err)
    }
  }).finally(() => {
    endMcpApprovalSession(approvalSessionId)
  })
}

function resolveMcpPromptContentMode(baseURL: string, model: string): 'default' | 'tight' | 'tight-text-only' {
  const normalizedBaseURL = baseURL.toLowerCase()
  const normalizedModel = model.toLowerCase()

  if (normalizedBaseURL.includes('models.github.ai')) {
    // NOTICE: GitHub Models currently chokes on large tool-result payloads, and some
    // model backends reject inline images inside `tool` role messages entirely.
    return 'tight-text-only'
  }

  if (normalizedModel.endsWith('gpt-4.1-mini')) {
    return 'tight'
  }

  return 'default'
}

function resolveParallelToolCalls(baseURL: string, model: string): boolean | undefined {
  const normalizedBaseURL = baseURL.toLowerCase()
  const normalizedModel = model.toLowerCase()

  if (normalizedBaseURL.includes('models.github.ai') && /(?:^|\/)o\d/.test(normalizedModel)) {
    // NOTICE: GitHub Models' o-series backends reject the `parallel_tool_calls` request field.
    return undefined
  }

  return false
}

export function shouldUseManualToolLoop(baseURL: string): boolean {
  const normalizedBaseURL = baseURL.toLowerCase()
  return normalizedBaseURL.includes('models.github.ai')
    || normalizedBaseURL.includes('generativelanguage.googleapis.com')
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

    const res = await attemptForToolsCompatibilityDiscovery(model, chatProvider, _, { ...options, toolsCompatibility: toolsCompatibility.value })
    toolsCompatibility.value.set(key, res)
  }

  async function stream(model: string, chatProvider: ChatProvider, messages: Message[], options?: StreamOptions) {
    const key = createToolsCompatibilityKey(model, chatProvider)

    try {
      return await streamFrom(model, chatProvider, messages, { ...options, toolsCompatibility: toolsCompatibility.value })
    }
    catch (error) {
      if (isKnownToolsUnsupportedError(error)) {
        toolsCompatibility.value.set(key, false)
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

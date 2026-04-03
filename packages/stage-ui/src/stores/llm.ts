import type { WebSocketBaseEvent, WebSocketEvents } from '@proj-airi/server-sdk'
import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { CommonContentPart, CompletionToolCall, Message, Tool } from '@xsai/shared-chat'

import type { OpenClawToolPayload, OpenClawToolResult } from '../tools'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { listModels } from '@xsai/model'
import { streamText } from '@xsai/stream-text'
import { tool } from '@xsai/tool'
import { nanoid } from 'nanoid'
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { z } from 'zod/v4'

import { isOpenClawModelTarget } from '../libs/providers/providers/openclaw/shared'
import { debug, executeOpenClawTool, mcp, openclaw } from '../tools'
import { useModsServerChannelStore } from './mods/api/channel-server'

function hasOpenClawMetadata(value: unknown): boolean {
  return typeof value === 'object'
    && value !== null
    && 'openclaw' in value
    && typeof value.openclaw === 'object'
    && value.openclaw !== null
}

function readOpenClawResultMetadata(value: unknown): Omit<OpenClawToolResult, 'summary'> & { commandId: string } | undefined {
  if (!hasOpenClawMetadata(value)) {
    return undefined
  }

  const record = value as { openclaw: Record<string, unknown> }
  const openclaw = record.openclaw
  if (typeof openclaw.commandId !== 'string' || typeof openclaw.status !== 'string') {
    return undefined
  }

  if (openclaw.status !== 'completed' && openclaw.status !== 'failed' && openclaw.status !== 'cancelled') {
    return undefined
  }

  return {
    commandId: openclaw.commandId,
    status: openclaw.status,
    error: typeof openclaw.error === 'object' && openclaw.error !== null ? openclaw.error as OpenClawToolResult['error'] : undefined,
    result: typeof openclaw.result === 'object' && openclaw.result !== null ? openclaw.result as OpenClawToolResult['result'] : undefined,
  }
}

function matchesOpenClawRequest(value: unknown, payload: OpenClawToolPayload): boolean {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const request = value as Record<string, unknown>
  return request.conversationId === payload.conversationId
    && request.userId === payload.userId
    && request.source === (payload.source ?? 'stage-ui:openclaw-tool')
}

export function isTrustedOpenClawResultEvent(
  event: WebSocketBaseEvent<'context:update', WebSocketEvents['context:update']>,
  commandId: string,
  payload: OpenClawToolPayload,
): boolean {
  const metadata = readOpenClawResultMetadata(event.data.metadata)
  if (!metadata || event.data.lane !== 'openclaw:result' || metadata.commandId !== commandId) {
    return false
  }

  if (event.metadata.source.kind !== 'plugin' || event.metadata.source.plugin.id !== 'openclaw-bridge') {
    return false
  }

  const openclawMetadata = hasOpenClawMetadata(event.data.metadata)
    ? (event.data.metadata as { openclaw: Record<string, unknown> }).openclaw
    : undefined

  return matchesOpenClawRequest(openclawMetadata?.request, payload)
}

export function prepareSparkCommandForSend(command: WebSocketEvents['spark:command']): WebSocketEvents['spark:command'] {
  const targetsOpenClaw = command.contexts?.some(context => context.lane === 'openclaw:task' || hasOpenClawMetadata(context.metadata))

  if (targetsOpenClaw) {
    return command
  }

  return {
    ...command,
    destinations: [],
  }
}

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
  providerId?: string
  toolsCompatibility?: Map<string, boolean>
  waitForOpenClawResult?: (commandId: string, payload: OpenClawToolPayload) => Promise<OpenClawToolResult>
  supportsTools?: boolean
  waitForTools?: boolean
  tools?: Tool[] | (() => Promise<Tool[] | undefined>)
}

export function shouldExposeOpenClawBridgeTool(model: string, options?: StreamOptions): boolean {
  if (options?.providerId === 'openclaw') {
    return false
  }

  return !isOpenClawModelTarget(model)
}

function sanitizeMessages(messages: unknown[]): Message[] {
  return messages.map((m: any) => {
    if (m && m.role === 'error') {
      return {
        role: 'user',
        content: `User encountered error: ${String(m.content ?? '')}`,
      } as Message
    }
    // NOTICE: Flatten array content for providers (e.g. DeepSeek) that expect string,
    // not content-part arrays. Skipped when image_url parts are present.
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
  if (options?.supportsTools)
    return true
  const key = `${chatProvider.chat(model).baseURL}-${model}`
  return options?.toolsCompatibility?.get(key) !== false
}

const sparkCommandGuidanceOptionSchema = z.object({
  label: z.string().describe('Short label for the option.'),
  steps: z.array(z.string()).min(1).describe('Step-by-step actions the target should follow.'),
  rationale: z.string().optional().describe('Why this option makes sense.'),
  possibleOutcome: z.array(z.string()).optional().describe('Expected outcomes if this option is followed.'),
  risk: z.enum(['high', 'medium', 'low', 'none']).optional().describe('Risk level of this option.'),
  fallback: z.array(z.string()).optional().describe('Fallback steps if the main plan fails.'),
  triggers: z.array(z.string()).optional().describe('Conditions that should trigger this option.'),
}).strict()

const sparkCommandContextSchema = z.object({
  lane: z.string().optional().describe('Logical context lane, for example "game" or "memory".'),
  ideas: z.array(z.string()).optional().describe('Loose ideas to attach to the target context.'),
  hints: z.array(z.string()).optional().describe('Hints to attach to the target context.'),
  strategy: z.nativeEnum(ContextUpdateStrategy).describe('How the target should merge this context update.'),
  text: z.string().describe('Primary text of the context update.'),
  destinations: z.union([
    z.array(z.string()),
    z.object({
      all: z.literal(true),
    }).strict(),
    z.object({
      include: z.array(z.string()).optional(),
      exclude: z.array(z.string()).optional(),
    }).strict(),
  ]).optional().describe('Optional routing for the attached context update.'),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional().describe('JSON-like metadata for the context update.'),
}).strict()

const sparkCommandToolSchema = z.object({
  destinations: z.array(z.string()).min(1).describe('One or more target module or agent IDs for this command.'),
  interrupt: z.union([z.literal('force'), z.literal('soft'), z.literal(false)]).optional().describe('Whether the command should preempt current work.'),
  priority: z.enum(['critical', 'high', 'normal', 'low']).optional().describe('Priority of the command.'),
  intent: z.enum(['plan', 'proposal', 'action', 'pause', 'resume', 'reroute', 'context']).optional().describe('Intent of the command.'),
  ack: z.string().optional().describe('Short acknowledgement or instruction summary for the receiver.'),
  parentEventId: z.string().optional().describe('Optional parent event ID when this command is a response to another event.'),
  guidance: z.object({
    type: z.enum(['proposal', 'instruction', 'memory-recall']),
    persona: z.record(z.string(), z.enum(['very-high', 'high', 'medium', 'low', 'very-low'])).optional().describe('Persona traits that shape the target behavior.'),
    options: z.array(sparkCommandGuidanceOptionSchema).min(1).describe('Concrete execution options for the target.'),
  }).strict().optional().describe('Structured guidance for how the target should interpret and execute the command.'),
  contexts: z.array(sparkCommandContextSchema).optional().describe('Optional context updates to attach to the command.'),
}).strict()

async function streamFrom(model: string, chatProvider: ChatProvider, messages: Message[], sendSparkCommand: (command: WebSocketEvents['spark:command']) => void, options?: StreamOptions) {
  const chatConfig = chatProvider.chat(model)
  const sanitized = sanitizeMessages(messages as unknown[])

  const resolveTools = async () => {
    const tools = typeof options?.tools === 'function'
      ? await options.tools()
      : options?.tools
    return tools ?? []
  }

  const supportedTools = streamOptionsToolsCompatibilityOk(model, chatProvider, messages, options)
  const includeOpenClawBridgeTool = shouldExposeOpenClawBridgeTool(model, options)
  const tools = supportedTools
    ? [
        ...await mcp(),
        ...await debug(),
        ...(includeOpenClawBridgeTool ? await openclaw(sendSparkCommand, options?.waitForOpenClawResult) : []),
        ...await resolveTools(),
        await tool({
          name: 'call_spark_command',
          description: 'Send a spark:command to one or more frontend-connected modules or sub-agents.',
          parameters: sparkCommandToolSchema,
          execute: async (payload) => {
            const command = {
              id: nanoid(),
              eventId: nanoid(),
              parentEventId: payload.parentEventId,
              commandId: nanoid(),
              interrupt: payload.interrupt ?? false,
              priority: payload.priority ?? 'normal',
              intent: payload.intent ?? 'action',
              ack: payload.ack,
              guidance: payload.guidance,
              contexts: payload.contexts?.map(context => ({
                id: nanoid(),
                contextId: nanoid(),
                lane: context.lane,
                ideas: context.ideas,
                hints: context.hints,
                strategy: context.strategy,
                text: context.text,
                destinations: context.destinations,
                metadata: context.metadata,
              })),
              destinations: payload.destinations,
            } satisfies WebSocketEvents['spark:command']

            sendSparkCommand(command)

            return `spark:command sent (${command.commandId}) to ${command.destinations.join(', ')}`
          },
        }),
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
          rejectOnce((event as any).error ?? new Error('Stream error'))
        }
      }
      catch (err) {
        rejectOnce(err)
      }
    }

    try {
      const streamResult = streamText({
        ...chatConfig,
        abortSignal: options?.abortSignal,
        maxSteps: 10,
        messages: sanitized,
        headers: options?.headers,
        tools,
        onEvent,
      })

      // NOTICE: Consume underlying promises to prevent unhandled rejections from
      // @xsai/stream-text's SSE parser surfacing as faulted app state.
      void streamResult.steps.catch((err) => {
        rejectOnce(err)
        console.error('Stream steps error:', err)
      })
      void streamResult.messages.catch(err => console.error('Stream messages error:', err))
      void streamResult.usage.catch(err => console.error('Stream usage error:', err))
      void streamResult.totalUsage.catch(err => console.error('Stream totalUsage error:', err))
    }
    catch (err) {
      rejectOnce(err)
    }
  })
}

// Runtime auto-degrade: patterns that indicate the model/provider does not support tool calling.
const TOOLS_RELATED_ERROR_PATTERNS: RegExp[] = [
  /does not support tools/i, // Ollama
  /no endpoints found that support tool use/i, // OpenRouter
  /invalid schema for function/i, // OpenAI-compatible
  /invalid.?function.?parameters/i, // OpenAI-compatible
  /functions are not supported/i, // Azure AI Foundry
  /unrecognized request argument.+tools/i, // Azure AI Foundry
  /tool use with function calling is unsupported/i, // Google Generative AI
  /tool_use_failed/i, // Groq
  /does not support function.?calling/i, // Anthropic
  /tools?\s+(is|are)\s+not\s+supported/i, // Cloudflare Workers AI
]

export function isToolRelatedError(err: unknown): boolean {
  const msg = String(err)
  return TOOLS_RELATED_ERROR_PATTERNS.some(p => p.test(msg))
}

export const useLLM = defineStore('llm', () => {
  const toolsCompatibility = ref<Map<string, boolean>>(new Map())
  const modsServerChannelStore = useModsServerChannelStore()

  function modelKey(model: string, chatProvider: ChatProvider): string {
    return `${chatProvider.chat(model).baseURL}-${model}`
  }

  function waitForOpenClawResult(commandId: string, payload: OpenClawToolPayload, timeoutMs = 120_000) {
    return new Promise<OpenClawToolResult>((resolve, reject) => {
      let settled = false
      let timeout: ReturnType<typeof setTimeout>

      const cleanup = (dispose: () => void) => {
        clearTimeout(timeout)
        dispose()
      }

      const settleResolve = (dispose: () => void, value: OpenClawToolResult) => {
        if (settled) {
          return
        }

        settled = true
        cleanup(dispose)
        resolve(value)
      }

      const settleReject = (dispose: () => void, error: unknown) => {
        if (settled) {
          return
        }

        settled = true
        cleanup(dispose)
        reject(error)
      }

      const dispose = modsServerChannelStore.onContextUpdate((event) => {
        if (!isTrustedOpenClawResultEvent(event, commandId, payload)) {
          return
        }

        const metadata = readOpenClawResultMetadata(event.data.metadata)
        if (!metadata) {
          return
        }

        settleResolve(dispose, {
          error: metadata.error,
          result: metadata.result,
          status: metadata.status,
          summary: event.data.text,
        })
      })

      timeout = setTimeout(() => {
        settleReject(dispose, new Error(`Timed out waiting for OpenClaw result (${commandId})`))
      }, timeoutMs)
    })
  }

  function sendRuntimeSparkCommand(command: WebSocketEvents['spark:command']) {
    const preparedCommand = prepareSparkCommandForSend(command)

    modsServerChannelStore.send({
      type: 'spark:command',
      data: preparedCommand,
    })
  }

  function delegateOpenClawTask(payload: OpenClawToolPayload) {
    return executeOpenClawTool(payload, sendRuntimeSparkCommand, waitForOpenClawResult)
  }

  async function stream(model: string, chatProvider: ChatProvider, messages: Message[], options?: StreamOptions) {
    const key = modelKey(model, chatProvider)
    try {
      await streamFrom(
        model,
        chatProvider,
        messages,
        // TODO(@nekomeowww,@shinohara-rin): we should not register the command callback on every stream anyway...
        sendRuntimeSparkCommand,
        { ...options, toolsCompatibility: toolsCompatibility.value, waitForOpenClawResult },
      )
    }
    catch (err) {
      if (isToolRelatedError(err)) {
        console.warn(`[llm] Auto-disabling tools for "${key}" due to tool-related error`)
        toolsCompatibility.value.set(key, false)
      }
      throw err
    }
  }

  async function models(apiUrl: string, apiKey: string) {
    if (apiUrl === '')
      return []

    try {
      return await listModels({
        baseURL: (apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`) as `${string}/`,
        apiKey,
      })
    }
    catch (err) {
      if (String(err).includes(`Failed to construct 'URL': Invalid URL`))
        return []
      throw err
    }
  }

  return {
    delegateOpenClawTask,
    models,
    stream,
  }
})

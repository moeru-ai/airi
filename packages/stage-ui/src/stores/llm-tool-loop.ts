import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Fetch } from '@xsai/shared'
import type {
  CommonContentPart,
  CompletionToolCall,
  Message,
  Tool,
  ToolMessage,
} from '@xsai/shared-chat'

import type { McpPromptContentMode } from '../tools/mcp-prompt-content'
import type { StreamEvent } from './llm'

import { chat } from '@xsai/shared-chat'

import { getCurrentMcpApprovalSessionId } from '../stores/mcp-approval-session'
import { getMcpToolBridge } from '../stores/mcp-tool-bridge'
import {
  formatMcpObservationUserContent,
  formatMcpToolResultPromptContent,
  getMcpPromptContentOptions,

} from '../tools/mcp-prompt-content'

interface RunManualToolLoopOptions {
  chatProvider: ChatProvider
  headers?: Record<string, string>
  maxSteps: number
  messages: Message[]
  model: string
  onStreamEvent?: (event: StreamEvent) => void | Promise<void>
  promptContentMode: McpPromptContentMode
  tools: Tool[]
}

interface StreamedAssistantStep {
  finishReason: string
  message: Message
  text: string
  toolCalls: Array<{
    id: string
    name: string
    type: 'function'
    argsText: string
  }>
}

export async function runManualToolLoop(options: RunManualToolLoopOptions): Promise<void> {
  const chatConfig = options.chatProvider.chat(options.model)
  const promptContentOptions = getMcpPromptContentOptions(options.promptContentMode)
  const messages = structuredClone(options.messages)

  for (let stepIndex = 0; stepIndex < options.maxSteps; stepIndex++) {
    const step = await streamAssistantStep({
      baseURL: String(chatConfig.baseURL),
      apiKey: chatConfig.apiKey,
      fetch: chatConfig.fetch,
      headers: options.headers,
      messages,
      model: options.model,
      tools: options.tools,
      onStreamEvent: options.onStreamEvent,
    })

    messages.push(step.message)

    if (step.toolCalls.length === 0) {
      // NOTICE: GitHub Models sometimes returns a text-only response that
      // fabricates tool results (e.g. "status=running") instead of actually
      // making a tool call.  When this happens on the first step and tools
      // are available, inject a hard constraint and retry ONCE so the model
      // gets a second chance to use the tools properly.
      if (
        stepIndex === 0
        && options.tools.length > 0
        && step.text.length > 0
      ) {
        messages.push({
          role: 'developer',
          content: 'Your previous response did not include any tool calls. If the user\'s request can be fulfilled by calling a tool, you MUST make the tool call NOW using mcp_call_tool. Do not describe or simulate the result — actually call the tool.' as any,
        })
        // Continue to the next iteration which will re-prompt the model
        continue
      }

      await options.onStreamEvent?.({
        type: 'finish',
        finishReason: step.finishReason,
      } as StreamEvent)
      return
    }

    for (const toolCall of step.toolCalls) {
      const executed = await executeToolCall({
        messages,
        promptContentOptions,
        toolCall,
        tools: options.tools,
      })

      messages.push(executed.toolMessage)
      await options.onStreamEvent?.({
        type: 'tool-call',
        ...executed.completionToolCall,
      })
      await options.onStreamEvent?.({
        type: 'tool-result',
        toolCallId: executed.completionToolCall.toolCallId,
        result: executed.completionToolResult.result,
      })

      if (executed.observationMessage) {
        messages.push(executed.observationMessage)
      }
    }
  }
}

async function executeToolCall(params: {
  messages: Message[]
  promptContentOptions: ReturnType<typeof getMcpPromptContentOptions>
  toolCall: StreamedAssistantStep['toolCalls'][number]
  tools: Tool[]
}): Promise<{
  completionToolCall: CompletionToolCall
  completionToolResult: {
    args: Record<string, unknown>
    result: ToolMessage['content']
    toolCallId: string
    toolName: string
  }
  observationMessage?: Message
  toolMessage: ToolMessage
}> {
  const tool = params.tools.find(candidate => candidate.function.name === params.toolCall.name)
  if (!tool) {
    throw new Error(`Model tried to call unavailable tool "${params.toolCall.name}".`)
  }

  const parsedArgs = JSON.parse(params.toolCall.argsText || '{}') as Record<string, unknown>

  let result: ToolMessage['content']
  let observationMessage: Message | undefined

  if (params.toolCall.name === 'mcp_call_tool') {
    const rawResult = await getMcpToolBridge().callTool({
      name: String(parsedArgs.name),
      arguments: Array.isArray(parsedArgs.parameters)
        ? Object.fromEntries(parsedArgs.parameters.map((entry: any) => [entry.name, entry.value]))
        : undefined,
      requestId: params.toolCall.id,
      ...(getCurrentMcpApprovalSessionId() ? { approvalSessionId: getCurrentMcpApprovalSessionId() } : {}),
    })

    result = await formatMcpToolResultPromptContent(rawResult, params.promptContentOptions)

    const observationContent = await formatMcpObservationUserContent(rawResult, params.promptContentOptions, {
      toolName: String(parsedArgs.name || 'mcp_tool'),
    })

    if (observationContent.length > 0) {
      observationMessage = {
        role: 'user',
        content: observationContent,
      }
    }
  }
  else {
    result = wrapToolExecuteResult(await tool.execute(parsedArgs, {
      messages: params.messages,
      toolCallId: params.toolCall.id,
    }))
  }

  const completionToolCall: CompletionToolCall = {
    args: params.toolCall.argsText,
    toolCallId: params.toolCall.id,
    toolCallType: 'function',
    toolName: params.toolCall.name,
  }

  return {
    completionToolCall,
    completionToolResult: {
      args: parsedArgs,
      result,
      toolCallId: params.toolCall.id,
      toolName: params.toolCall.name,
    },
    observationMessage,
    toolMessage: {
      role: 'tool',
      tool_call_id: params.toolCall.id,
      content: result,
    },
  }
}

function wrapToolExecuteResult(result: unknown): ToolMessage['content'] {
  if (typeof result === 'string') {
    return result
  }

  if (Array.isArray(result) && result.every(isCommonContentPart)) {
    return result
  }

  return JSON.stringify(result)
}

function isCommonContentPart(value: unknown): value is CommonContentPart {
  if (!value || typeof value !== 'object') {
    return false
  }

  const type = typeof (value as { type?: unknown }).type === 'string'
    ? (value as { type: string }).type
    : undefined

  return type === 'text'
    || type === 'image_url'
    || type === 'input_audio'
    || type === 'file'
}

async function streamAssistantStep(params: {
  apiKey?: string
  baseURL: string
  fetch?: Fetch | typeof globalThis.fetch
  headers?: Record<string, string>
  messages: Message[]
  model: string
  onStreamEvent?: (event: StreamEvent) => void | Promise<void>
  tools: Tool[]
}): Promise<StreamedAssistantStep> {
  const response = await chat({
    apiKey: params.apiKey,
    baseURL: params.baseURL,
    fetch: params.fetch,
    headers: params.headers,
    messages: params.messages,
    model: params.model,
    stream: true,
    tools: params.tools,
  })

  const stream = response.body
  if (!stream) {
    throw new Error('Streaming response body is missing.')
  }

  const textParts: string[] = []
  const toolCalls: StreamedAssistantStep['toolCalls'] = []
  let finishReason = 'other'

  await stream
    .pipeThrough(createSseChunkTransform())
    .pipeTo(new WritableStream({
      async write(chunk) {
        const choices = Array.isArray(chunk?.choices)
          ? chunk.choices
          : []
        const choice = choices[0]
        if (!choice) {
          return
        }

        if (choice.finish_reason != null) {
          finishReason = String(choice.finish_reason)
        }

        const delta = choice.delta || {}
        if (typeof delta.content === 'string') {
          textParts.push(delta.content)
          await params.onStreamEvent?.({ type: 'text-delta', text: delta.content })
        }

        const deltaToolCalls = Array.isArray(delta.tool_calls)
          ? delta.tool_calls
          : []

        for (const partialToolCall of deltaToolCalls) {
          const index = Number(partialToolCall.index || 0)
          const existing = toolCalls[index]
          if (!existing) {
            toolCalls[index] = {
              id: String(partialToolCall.id),
              name: String(partialToolCall.function?.name || ''),
              type: 'function',
              argsText: String(partialToolCall.function?.arguments || ''),
            }
            continue
          }

          if (partialToolCall.id) {
            existing.id = String(partialToolCall.id)
          }
          if (partialToolCall.function?.name) {
            existing.name = String(partialToolCall.function.name)
          }
          if (partialToolCall.function?.arguments) {
            existing.argsText += String(partialToolCall.function.arguments)
          }
        }
      },
    }))

  return {
    finishReason,
    message: {
      role: 'assistant',
      content: textParts.join(''),
      tool_calls: toolCalls.length > 0
        ? toolCalls.map(toolCall => ({
            id: toolCall.id,
            type: 'function',
            function: {
              name: toolCall.name,
              arguments: toolCall.argsText,
            },
          }))
        : undefined,
    },
    text: textParts.join(''),
    toolCalls,
  }
}

function createSseChunkTransform() {
  const decoder = new TextDecoder()
  let buffer = ''

  return new TransformStream({
    transform(chunk, controller) {
      const text = decoder.decode(chunk, { stream: true })
      buffer += text
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data:')) {
          continue
        }

        const rawData = line.slice('data:'.length).trimStart()
        if (rawData === '[DONE]') {
          continue
        }
        if (!rawData) {
          continue
        }
        controller.enqueue(JSON.parse(rawData))
      }
    },
  })
}

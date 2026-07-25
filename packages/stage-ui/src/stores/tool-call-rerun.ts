import type { Tool } from '@xsai/shared-chat'

import type { ChatAssistantMessage, ChatHistoryItem, ChatSlicesToolCallResult } from '../types/chat'

import { errorMessageFrom } from '@moeru/std'

import { toolNameFrom } from './llm-tool-resolver'

export interface ToolCallRerunPayload<TToolset extends string = string> {
  sessionId?: string
  messageId?: string
  index?: number
  toolset?: TToolset
  toolCallId: string
  toolName: string
  args: string
}

interface ExecuteToolCallRerunOptions<TToolset extends string = string> {
  messages: ChatHistoryItem[]
  payload: ToolCallRerunPayload<TToolset>
  resolveTools: () => Promise<Tool[]>
}

type ToolCallResultInput = Omit<ChatSlicesToolCallResult, 'type'>
type ToolExecuteOptions = NonNullable<Parameters<Tool['execute']>[1]>

/**
 * Returns a copy of an assistant message with the result for one tool call replaced.
 *
 * The chat UI can read results from `tool_results` or inline `tool-call-result`
 * slices. Reruns update both representations for the same id so stored and
 * inline messages stay consistent.
 */
export function replaceToolCallResult(message: ChatAssistantMessage, result: ToolCallResultInput): ChatAssistantMessage {
  const toolResult = {
    id: result.id,
    isError: result.isError,
    result: result.result,
  }
  const resultSlice: ChatSlicesToolCallResult = {
    type: 'tool-call-result',
    ...toolResult,
  }

  return {
    ...message,
    slices: message.slices.map((slice) => {
      if (slice.type === 'tool-call-result' && slice.id === result.id)
        return resultSlice

      return slice
    }),
    tool_results: [
      ...message.tool_results.filter(item => item.id !== result.id),
      toolResult,
    ],
  }
}

/**
 * Re-executes a stored tool call with supplied arguments and returns updated chat history.
 *
 * The resolver is injected so callers can choose the runtime-specific tool list
 * without coupling this helper to app-local stores, Electron IPC, or browser state.
 */
export async function executeToolCallRerun<TToolset extends string = string>(
  options: ExecuteToolCallRerunOptions<TToolset>,
): Promise<ChatHistoryItem[]> {
  const { messages, payload } = options
  const targetIndex = findTargetMessageIndex(messages, payload)
  const targetMessage = messages[targetIndex]

  if (targetMessage?.role !== 'assistant')
    throw new Error('Tool call rerun target must be an assistant message.')

  if (!hasMatchingToolCall(targetMessage, payload))
    throw new Error(`Assistant message does not contain tool call "${payload.toolCallId}" for "${payload.toolName}".`)

  const replaceTargetMessage = (result: ToolCallResultInput) => messages.map((item, itemIndex) => {
    if (itemIndex !== targetIndex)
      return item

    return replaceToolCallResult(targetMessage, result)
  })

  const tools = await options.resolveTools()
  const tool = tools.find(candidate => toolNameFrom(candidate) === payload.toolName)
  if (tool == null) {
    return replaceTargetMessage({
      id: payload.toolCallId,
      isError: true,
      result: `Tool "${payload.toolName}" is not available for rerun in this runtime.`,
    })
  }

  const parsedArgs = parseToolCallArgs(payload.args)
  if (!parsedArgs.ok) {
    return replaceTargetMessage({
      id: payload.toolCallId,
      isError: true,
      result: `Invalid tool call arguments JSON: ${parsedArgs.message}`,
    })
  }

  try {
    // NOTICE:
    // Re-run tools receive AIRI's original chat history so runtime tools can
    // inspect the same context the UI is updating. xsai types narrow
    // `messages` to provider `Message[]`, while AIRI history can also contain
    // local-only `error` entries. Keep the cast at this boundary instead of
    // filtering messages and silently changing the tool's context.
    // Removal condition: xsai exposes a tool execution context type that can
    // accept runtime-owned message envelopes.
    const executeOptions: ToolExecuteOptions = {
      toolCallId: payload.toolCallId,
      messages,
    } as ToolExecuteOptions
    const result = await tool.execute(parsedArgs.value, executeOptions)
    const normalizedResult = typeof result === 'string' || Array.isArray(result)
      ? result
      : JSON.stringify(result)

    return replaceTargetMessage({
      id: payload.toolCallId,
      result: normalizedResult,
    })
  }
  catch (error) {
    return replaceTargetMessage({
      id: payload.toolCallId,
      isError: true,
      result: `Tool call error for "${payload.toolName}": ${errorMessageFrom(error) ?? String(error)}`,
    })
  }
}

function findTargetMessageIndex(messages: ChatHistoryItem[], payload: ToolCallRerunPayload): number {
  if (payload.messageId != null) {
    const index = messages.findIndex(message => message.id === payload.messageId)
    if (index !== -1)
      return index
  }

  if (payload.index != null)
    return payload.index

  return -1
}

function hasMatchingToolCall(message: ChatAssistantMessage, payload: ToolCallRerunPayload): boolean {
  return message.slices.some(slice =>
    slice.type === 'tool-call'
    && slice.toolCall.toolCallId === payload.toolCallId
    && slice.toolCall.toolName === payload.toolName,
  )
}

function parseToolCallArgs(args: string): { ok: true, value: unknown } | { ok: false, message: string } {
  const trimmedArgs = args.trim()
  if (trimmedArgs === '')
    return { ok: true, value: {} }

  try {
    return { ok: true, value: JSON.parse(trimmedArgs) as unknown }
  }
  catch (error) {
    return { ok: false, message: errorMessageFrom(error) ?? String(error) }
  }
}

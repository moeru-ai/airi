import type { Tool } from '@xsai/shared-chat'

import type { ChatAssistantMessage, ChatHistoryItem, ChatSlicesToolCallResult } from '../types/chat'

import { errorMessageFrom } from '@moeru/std'
import { chatContentToInputSegments } from '@proj-airi/core-agent'

import { toolNameFrom } from './ai/chat-llm/tool-resolver'

/** Identifies one tool invocation inside the selected assistant message. */
export interface ToolCallRerunRequest {
  /** Required when the provider repeats a call id across rounds. */
  invocationId?: string
  toolCallId: string
  toolName: string
  args: string
}

/** The history component attaches its message location before forwarding the rerun. */
export interface ChatToolCallRerunEvent extends ToolCallRerunRequest {
  message: ChatHistoryItem
  index: number
  key: string | number
}

/** History location and runtime selection for a tool rerun. */
export interface ToolCallRerunPayload<TToolset extends string = string> extends ToolCallRerunRequest {
  sessionId?: string
  messageId?: string
  index?: number
  toolset?: TToolset
}

interface ExecuteToolCallRerunOptions<TToolset extends string = string> {
  messages: ChatHistoryItem[]
  payload: ToolCallRerunPayload<TToolset>
  resolveTools: () => Promise<Tool[]>
}

type ToolCallResultInput = Omit<ChatSlicesToolCallResult, 'type'>
type ToolExecuteOptions = NonNullable<Parameters<Tool['execute']>[1]>

function findInvocation(message: ChatAssistantMessage, callId: string, invocationId?: string) {
  const candidates = message.generationTranscript?.rounds.flatMap((round, roundIndex) =>
    round.toolInvocations.filter(call => call.callId === callId).map(call => ({ call, roundIndex })),
  )
  if (invocationId !== undefined) {
    const matches = candidates?.filter(candidate => candidate.call.id === invocationId)
    if (!candidates || matches?.length !== 1)
      throw new Error(`Tool invocation "${invocationId}" is missing or ambiguous.`)
    return { ...matches[0], occurrence: candidates.indexOf(matches[0]) }
  }
  if (candidates && candidates.length > 1)
    throw new Error(`Tool call "${callId}" is ambiguous. Select an invocation.`)
  return candidates?.[0] ? { ...candidates[0], occurrence: 0 } : undefined
}

/**
 * Replaces one execution and its display results, preserving their order.
 * Native continuation for this round and later rounds becomes stale after the edit.
 * Repeated provider call ids require an AIRI invocation id.
 */
export function replaceToolCallResult(message: ChatAssistantMessage, result: ToolCallResultInput, invocationId?: string): ChatAssistantMessage {
  const target = findInvocation(message, result.id, invocationId)
  const occurrence = target?.occurrence ?? 0
  const toolResult = { id: result.id, isError: result.isError, result: result.result }
  const resultSlice: ChatSlicesToolCallResult = { type: 'tool-call-result', ...toolResult }
  let generationTranscript = message.generationTranscript
  if (generationTranscript && target) {
    generationTranscript = {
      ...generationTranscript,
      rounds: generationTranscript.rounds.map((round, index) => index < target.roundIndex
        ? round
        : {
            ...round,
            // Later native rounds depend on the old result, even when their executions do not change.
            continuation: undefined,
            toolInvocations: round.toolInvocations.map(call => index !== target.roundIndex || call.id !== target.call.id
              ? call
              : { ...call, execution: { status: result.isError ? 'failed' : 'succeeded', output: chatContentToInputSegments(result.result) } }),
          }),
    }
  }
  // Display and imported provider results follow occurrence order for each call id.
  // Their protocol envelopes do not carry AIRI invocation ids.
  let providerOccurrence = 0
  let sliceOccurrence = 0
  let storedOccurrence = 0
  let replaced = false
  const toolResults = message.tool_results.map((item) => {
    if (item.id !== result.id || storedOccurrence++ !== occurrence)
      return item
    replaced = true
    return toolResult
  })
  if (!replaced)
    toolResults.push(toolResult)
  return {
    ...message,
    generationTranscript,
    providerTranscript: message.providerTranscript?.map((item) => {
      if (item.role === 'tool' && item.tool_call_id === result.id && providerOccurrence++ === occurrence)
        return { ...item, content: result.result ?? '' }
      return item
    }),
    slices: message.slices.map((slice) => {
      if (slice.type === 'tool-call-result' && slice.id === result.id && sliceOccurrence++ === occurrence)
        return resultSlice
      return slice
    }),
    tool_results: toolResults,
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

  const invocation = findInvocation(targetMessage, payload.toolCallId, payload.invocationId)
  if (invocation && invocation.call.name !== payload.toolName)
    throw new Error('The selected invocation does not match the tool name.')

  const replaceTargetMessage = (result: ToolCallResultInput) => messages.map((item, itemIndex) => {
    if (itemIndex !== targetIndex)
      return item

    return replaceToolCallResult(targetMessage, result, payload.invocationId)
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

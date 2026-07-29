import type {
  CompletionToolCall,
  CompletionToolResult,
  Event,
  PreToolCall,
  Tool,
  ToolExecuteOptions,
} from '@xsai/shared-chat'

import type { StreamEvent } from '../types/llm'

import { errorMessageFromValue } from '../utils/error-message'

/**
 * Session that turns tool failures into model-facing tool messages and AIRI
 * `tool-error` events. Does not cover `missing_name` / `missing_arguments`
 * (xsai throws those before `preToolCall`).
 */
export interface ToolErrorCapture {
  preToolCall: PreToolCall
  tools: Tool[]
  toStreamEvent: (event: Event) => StreamEvent | null
}

function isAbortError(error: unknown, abortSignal?: AbortSignal): boolean {
  if (abortSignal?.aborted === true && error === abortSignal.reason)
    return true

  return typeof error === 'object'
    && error !== null
    && (error as { name?: unknown }).name === 'AbortError'
}

/**
 * Formats a tool failure for the model-facing tool message.
 *
 * Before:
 * - toolName `"play_chess"`, error `new Error("denied")`
 *
 * After:
 * - `Tool call error for "play_chess": denied`
 */
export function formatCapturedToolError(toolName: string, error: unknown): string {
  return `Tool call error for "${toolName}": ${errorMessageFromValue(error)}`
}

function recordCapturedResult(
  capturedToolErrorByCallId: Map<string, string>,
  toolCallId: string,
  toolName: string,
  error: unknown,
  args: unknown = {},
): CompletionToolResult {
  const result = formatCapturedToolError(toolName, error)
  capturedToolErrorByCallId.set(toolCallId, result)
  return {
    args,
    result,
    toolCallId,
    toolName,
  }
}

function wrapToolsForErrorCapture(
  tools: Tool[],
  capturedToolErrorByCallId: Map<string, string>,
): Tool[] {
  return tools.map(tool => ({
    ...tool,
    execute: async (input, executeOptions) => {
      try {
        return await tool.execute(input, executeOptions)
      }
      catch (error) {
        if (isAbortError(error, executeOptions.abortSignal))
          throw error

        const result = formatCapturedToolError(tool.function.name, error)
        capturedToolErrorByCallId.set(executeOptions.toolCallId, result)
        return result
      }
    },
  }))
}

function createErrorCapturePreToolCall(
  tools: Tool[],
  capturedToolErrorByCallId: Map<string, string>,
): PreToolCall {
  return async (toolCall: CompletionToolCall, _options: ToolExecuteOptions) => {
    const tool = tools.find(candidate => candidate.function.name === toolCall.toolName)
    if (!tool) {
      const available = tools.map(candidate => candidate.function.name)
      const availableMsg = available.length === 0
        ? 'No tools are available'
        : `Available tools: ${available.join(', ')}`

      return recordCapturedResult(
        capturedToolErrorByCallId,
        toolCall.toolCallId,
        toolCall.toolName,
        `Model tried to call unavailable tool "${toolCall.toolName}", ${availableMsg}.`,
        toolCall.args,
      )
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(toolCall.args.trim() || '{}')
    }
    catch (cause) {
      return recordCapturedResult(
        capturedToolErrorByCallId,
        toolCall.toolCallId,
        toolCall.toolName,
        cause instanceof Error
          ? cause
          : new Error(`Failed to parse tool input for "${toolCall.toolName}".`, { cause }),
        toolCall.args,
      )
    }

    if (tool.validate) {
      const validated = await tool.validate(parsed)
      if (validated.issues) {
        const message = validated.issues.map(issue => issue.message).join('; ')
          || `Tool input validation failed for "${toolCall.toolName}".`
        return recordCapturedResult(
          capturedToolErrorByCallId,
          toolCall.toolCallId,
          toolCall.toolName,
          message,
          parsed,
        )
      }
    }

    return undefined
  }
}

function toAiriStreamEvent(
  event: Event,
  capturedToolErrorByCallId: Map<string, string>,
): StreamEvent | null {
  switch (event.type) {
    case 'text.delta':
      return { type: 'text-delta', text: event.delta }
    case 'reasoning.delta':
      return { type: 'reasoning-delta', text: event.delta }
    case 'tool-call.done':
      return {
        type: 'tool-call',
        args: event.args,
        toolCallId: event.toolCallId,
        toolCallType: event.toolCallType,
        toolName: event.toolName,
      }
    case 'tool-result.done': {
      const captured = capturedToolErrorByCallId.get(event.toolCallId)
      if (captured != null) {
        capturedToolErrorByCallId.delete(event.toolCallId)
        return {
          type: 'tool-error',
          args: event.args,
          isError: true,
          result: captured,
          toolCallId: event.toolCallId,
          toolName: event.toolName,
        }
      }

      return {
        type: 'tool-result',
        toolCallId: event.toolCallId,
        result: typeof event.result === 'string' || Array.isArray(event.result)
          ? event.result
          : JSON.stringify(event.result),
      }
    }
    case 'step.done':
      // Intermediate tool rounds also emit `step.done`. AIRI `finish` is
      // synthesized once from `streamText(...).steps` in `streamFrom`.
      return null
    case 'error':
      return {
        type: 'error',
        error: event.cause ?? new Error(event.message),
      }
    case 'text.start':
    case 'text.done':
    case 'reasoning.start':
    case 'reasoning.done':
    case 'step.start':
    case 'tool-call.start':
    case 'tool-call.delta':
      return null
    default: {
      const _exhaustive: never = event
      void _exhaustive
      return null
    }
  }
}

/**
 * Creates wrapped tools, `preToolCall`, and an event adapter for tool-error capture.
 */
export function createToolErrorCapture(tools: Tool[]): ToolErrorCapture {
  const capturedToolErrorByCallId = new Map<string, string>()

  return {
    tools: wrapToolsForErrorCapture(tools, capturedToolErrorByCallId),
    preToolCall: createErrorCapturePreToolCall(tools, capturedToolErrorByCallId),
    toStreamEvent: event => toAiriStreamEvent(event, capturedToolErrorByCallId),
  }
}

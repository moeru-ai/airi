import type { Message, Tool, ToolCall } from '@xsai/shared-chat'
import type { CompletionToolResult, ToolMessage } from '@xsai/shared-chat'

import { InvalidToolCallError, InvalidToolInputError, ToolExecutionError } from '@xsai/shared'
import { errorMessageFrom } from '@moeru/std'

/**
 * Result type for the local executeTool wrapper.
 *
 * On success, `isError` and `error` are undefined.
 * On captured error, `isError` is true and `error` contains the classified error.
 */
export type ExecuteToolCompletionResult = CompletionToolResult & {
  isError?: true
  error?: InvalidToolCallError | InvalidToolInputError | ToolExecutionError
}

export type ExecuteToolResult = {
  completionToolResult: ExecuteToolCompletionResult
  message: ToolMessage
}

/**
 * Options for the local executeTool wrapper.
 *
 * Extends the upstream executeTool options with additional error handling
 * and lifecycle callback capabilities.
 */
export interface ExecuteToolOptions {
  messages: Message[]
  toolCall: ToolCall
  tools: Tool[]
  abortSignal?: AbortSignal

  /**
   * When true, capture errors instead of throwing.
   * Captured errors are returned as part of the result with isError: true.
   * @default undefined
   */
  captureToolErrors?: boolean

  /**
   * Optional repair function called when a tool call fails due to an
   * unresolvable tool name. If it returns a valid ToolCall, execution
   * is retried with the repaired call. If it returns null, the error
   * is either captured or thrown depending on captureToolErrors.
   */
  repairToolCall?: (toolCall: ToolCall, messages: Message[]) => Promise<ToolCall | null>

  /**
   * Called before tool execution starts, after the tool is found and
   * arguments are parsed. Not called when the tool is not found.
   */
  onToolCallStart?: (info: { input: Record<string, unknown>; toolCallId: string; toolName: string }) => void

  /**
   * Called after tool execution finishes, regardless of success or failure.
   * On success, `output` contains the result and `error` is undefined.
   * On failure, `error` contains the classified error and `output` is undefined.
   */
  onToolCallFinish?: (info: {
    toolName: string
    toolCallId: string
    output?: string
    error?: InvalidToolCallError | InvalidToolInputError | ToolExecutionError
    durationMs: number
  }) => void
}

function isAbortError(error: unknown): boolean {
  const isNonNullObject = typeof error === 'object' && error !== null
  return isNonNullObject && (error as { name?: unknown }).name === 'AbortError'
}

function classifyError(
  error: unknown,
  toolName: string,
): InvalidToolCallError | InvalidToolInputError | ToolExecutionError {
  if (
    InvalidToolCallError.isInstance(error) ||
    InvalidToolInputError.isInstance(error) ||
    ToolExecutionError.isInstance(error)
  ) {
    return error
  }

  const message = errorMessageFrom(error) ?? String(error)

  if (error instanceof SyntaxError || message.includes('JSON') || message.includes('parse')) {
    return new InvalidToolInputError(`Invalid input for tool "${toolName}"`, {
      toolInput: undefined,
      toolName,
    })
  }

  return new ToolExecutionError(`Tool execution failed for "${toolName}": ${message}`, {
    toolInput: undefined,
    toolName,
  })
}

function createCapturedErrorContent(toolName: string, error: unknown): string {
  return `Tool call error for "${toolName}": ${errorMessageFrom(error) ?? String(error)}`
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  const isNonNullObject = typeof value === 'object' && value !== null
  return isNonNullObject && !Array.isArray(value)
}

/**
 * Execute a tool call with enhanced error handling and lifecycle callbacks.
 *
 * Wraps the upstream `@xsai/shared-chat` executeTool with additional features:
 * - Error capture mode (captureToolErrors) that returns errors instead of throwing
 * - Tool call repair via repairToolCall callback
 * - Lifecycle callbacks (onToolCallStart, onToolCallFinish)
 * - AbortError passthrough (always rethrown)
 *
 * Use when:
 * - You need to capture tool execution errors without try/catch
 * - You want lifecycle callbacks for tool execution
 * - You need tool call repair/retry logic
 *
 * Expects:
 * - `tools` array contains the available tools
 * - `toolCall.function.name` matches a tool in the tools array (for direct execution)
 * - `toolCall.function.arguments` is valid JSON (for direct execution)
 *
 * Returns:
 * - On success: `{ completionToolResult, message }` where completionToolResult has the tool output
 * - On captured error: `{ completionToolResult: { isError: true, error, result }, message }`
 * - On thrown error: throws InvalidToolCallError, InvalidToolInputError, or ToolExecutionError
 */
export async function executeTool(options: ExecuteToolOptions): Promise<ExecuteToolResult> {
  const { messages, toolCall, tools, captureToolErrors, repairToolCall, onToolCallStart, onToolCallFinish } = options

  const toolName = toolCall.function?.name ?? ''
  const tool = tools.find((t) => t.function.name === toolName)

  // If no tool found, handle as InvalidToolCallError (before JSON parsing so
  // repairToolCall can still run for unknown-tool scenarios).
  if (!tool) {
    const error = new InvalidToolCallError(`Unknown tool "${toolName}"`, {
      reason: 'unknown_tool',
      toolCall,
      toolName,
    })

    if (captureToolErrors) {
      // Try repair first
      if (repairToolCall) {
        const repaired = await repairToolCall(toolCall, messages)
        if (repaired) {
          return executeTool({ ...options, toolCall: repaired, repairToolCall: undefined })
        }
      }

      const result = createCapturedErrorContent(toolName, error)
      const message: ToolMessage = {
        role: 'tool',
        content: result,
        tool_call_id: toolCall.id,
      }

      onToolCallFinish?.({
        toolName,
        toolCallId: toolCall.id,
        error,
        durationMs: 0,
      })

      return {
        completionToolResult: { args: {}, isError: true, error, result, toolCallId: toolCall.id, toolName },
        message,
      }
    }

    // Not capturing errors — try repair or throw
    if (repairToolCall) {
      const repaired = await repairToolCall(toolCall, messages)
      if (repaired) {
        return executeTool({ ...options, toolCall: repaired, repairToolCall: undefined })
      }
      const repairError = new InvalidToolCallError(`Unknown tool "${toolName}" and repair returned null`, {
        reason: 'unknown_tool',
        toolCall,
        toolName,
      })
      onToolCallFinish?.({
        toolName,
        toolCallId: toolCall.id,
        error: repairError,
        durationMs: 0,
      })
      throw repairError
    }

    onToolCallFinish?.({
      toolName,
      toolCallId: toolCall.id,
      error,
      durationMs: 0,
    })
    throw error
  }

  // Tool found — parse arguments
  let parsedInput: Record<string, unknown>

  try {
    const raw = JSON.parse(toolCall.function?.arguments ?? '{}')
    if (!isPlainObject(raw)) {
      throw new InvalidToolInputError(
        `Invalid input for tool "${toolName}": expected object, got ${Array.isArray(raw) ? 'array' : typeof raw}`,
        { toolInput: raw, toolName },
      )
    }
    parsedInput = raw
  } catch (error) {
    // Re-throw if it's already an InvalidToolInputError from the plain-object check
    if (InvalidToolInputError.isInstance(error)) {
      if (captureToolErrors) {
        const result = createCapturedErrorContent(toolName, error)
        const message: ToolMessage = {
          role: 'tool',
          content: result,
          tool_call_id: toolCall.id,
        }
        onToolCallFinish?.({ toolName, toolCallId: toolCall.id, error, durationMs: 0 })
        return {
          completionToolResult: { args: {}, isError: true, error, result, toolCallId: toolCall.id, toolName },
          message,
        }
      }
      onToolCallFinish?.({ toolName, toolCallId: toolCall.id, error, durationMs: 0 })
      throw error
    }

    // JSON parse failure — handle as InvalidToolInputError
    const inputError = new InvalidToolInputError(`Invalid input for tool "${toolName}"`, {
      toolInput: toolCall.function?.arguments,
      toolName,
    })

    if (captureToolErrors) {
      const result = createCapturedErrorContent(toolName, inputError)
      const message: ToolMessage = {
        role: 'tool',
        content: result,
        tool_call_id: toolCall.id,
      }
      onToolCallFinish?.({ toolName, toolCallId: toolCall.id, error: inputError, durationMs: 0 })
      return {
        completionToolResult: { args: {}, isError: true, error: inputError, result, toolCallId: toolCall.id, toolName },
        message,
      }
    }

    onToolCallFinish?.({ toolName, toolCallId: toolCall.id, error: inputError, durationMs: 0 })
    throw inputError
  }

  // Tool found and arguments parsed — execute with lifecycle callbacks
  const startTime = performance.now()

  onToolCallStart?.({
    input: parsedInput,
    toolCallId: toolCall.id,
    toolName,
  })

  try {
    const result = await tool.execute(parsedInput, {
      messages,
      toolCallId: toolCall.id,
    })

    const durationMs = performance.now() - startTime

    const resultStr = typeof result === 'string' ? result : JSON.stringify(result)

    const message: ToolMessage = {
      role: 'tool',
      content: resultStr,
      tool_call_id: toolCall.id,
    }

    const completionToolResult: ExecuteToolCompletionResult = {
      args: parsedInput,
      result: resultStr,
      toolCallId: toolCall.id,
      toolName,
    }

    onToolCallFinish?.({
      toolName,
      toolCallId: toolCall.id,
      output: resultStr,
      durationMs,
    })

    return { completionToolResult, message }
  } catch (error) {
    const durationMs = performance.now() - startTime

    if (isAbortError(error)) {
      onToolCallFinish?.({ toolName, toolCallId: toolCall.id, durationMs })
      throw error
    }

    const classifiedError = classifyError(error, toolName)

    if (captureToolErrors) {
      const result = createCapturedErrorContent(toolName, classifiedError)
      const message: ToolMessage = {
        role: 'tool',
        content: result,
        tool_call_id: toolCall.id,
      }

      onToolCallFinish?.({
        toolName,
        toolCallId: toolCall.id,
        error: classifiedError,
        durationMs,
      })

      return {
        completionToolResult: {
          args: parsedInput,
          isError: true,
          error: classifiedError,
          result,
          toolCallId: toolCall.id,
          toolName,
        },
        message,
      }
    }

    onToolCallFinish?.({
      toolName,
      toolCallId: toolCall.id,
      error: classifiedError,
      durationMs,
    })

    throw classifiedError
  }
}

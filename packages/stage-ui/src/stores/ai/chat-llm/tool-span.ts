import type { Span } from '@opentelemetry/api'
import type { Tool } from '@xsai/shared-chat'

import { SpanStatusCode } from '@opentelemetry/api'
import { IOAttributes, IOSpanNames, IOSubsystems } from '@proj-airi/stage-shared'

import { startSpan } from '../../../composables/use-io-tracer'

/** MCP reports a failed tool call in its result, without a throw. */
function isErrorResult(result: unknown) {
  return typeof result === 'object' && result !== null && 'isError' in result && result.isError === true
}

/**
 * Records one `Tool execution` span under `parent` for each call of `tool`.
 *
 * The span holds the tool name and the tool call ID, never the arguments or the result.
 * A thrown error or an MCP error result sets the error status. A call that its abort signal stopped gets the cancelled attribute.
 */
export function withToolSpan(tool: Tool, parent: Span): Tool {
  return {
    ...tool,
    async execute(input, options) {
      const span = startSpan(IOSpanNames.ToolExecution, parent, {
        [IOAttributes.Subsystem]: IOSubsystems.Tool,
        [IOAttributes.GenAIToolName]: tool.function.name,
        [IOAttributes.GenAIToolCallId]: options.toolCallId,
      })
      try {
        const result = await tool.execute(input, options)
        if (isErrorResult(result)) {
          span.setAttribute(IOAttributes.ErrorType, 'tool_error')
          span.setStatus({ code: SpanStatusCode.ERROR })
        }
        return result
      }
      catch (error) {
        if (options.abortSignal?.aborted) {
          span.setAttribute(IOAttributes.Cancelled, true)
        }
        else {
          span.setAttribute(IOAttributes.ErrorType, error instanceof Error ? error.name : 'Error')
          span.setStatus({ code: SpanStatusCode.ERROR })
        }
        throw error
      }
      finally {
        span.end()
      }
    },
  }
}

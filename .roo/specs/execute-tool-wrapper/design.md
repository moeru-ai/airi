# Design: executeTool Wrapper

## Architecture

The wrapper is a standalone TypeScript module at `packages/stage-ui/src/stores/execute-tool.ts`. It wraps the upstream `executeTool` from `@xsai/shared-chat` with additional error-handling and lifecycle features.

```
┌─────────────────────────────────────────────────────────┐
│  execute-tool.test.ts                                   │
│  import { executeTool } from './execute-tool'           │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│  execute-tool.ts (new local wrapper)                    │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │ executeTool(options)                            │    │
│  │                                                 │    │
│  │  1. Try upstream executeTool()                  │    │
│  │  2. On error + captureToolErrors:               │    │
│  │     a. Classify error type                      │    │
│  │     b. If repairToolCall provided → retry       │    │
│  │     c. Return error-augmented result            │    │
│  │  3. Lifecycle callbacks around execution        │    │
│  └─────────────────────────────────────────────────┘    │
│                       │                                 │
│                       ▼                                 │
│  ┌─────────────────────────────────────────────────┐    │
│  │ @xsai/shared-chat executeTool (upstream)        │    │
│  └─────────────────────────────────────────────────┘    │
│                       │                                 │
│                       ▼                                 │
│  ┌─────────────────────────────────────────────────┐    │
│  │ @xsai/shared error classes                      │    │
│  │ (InvalidToolCallError, InvalidToolInputError,   │    │
│  │  ToolExecutionError)                            │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

## Module: `execute-tool.ts`

### Exported Types

```typescript
import type { Message, Tool, ToolCall } from '@xsai/shared-chat'
import type { InvalidToolCallError, InvalidToolInputError, ToolExecutionError } from '@xsai/shared'

/** Augmented tool result that includes error information when captureToolErrors is true. */
export interface CapturedToolResult {
  isError: true
  error: InvalidToolCallError | InvalidToolInputError | ToolExecutionError
  result: string
}

/** Options for the local executeTool wrapper. */
export interface ExecuteToolOptions {
  messages: Message[]
  toolCall: ToolCall
  tools: Tool[]
  abortSignal?: AbortSignal

  /** When true, capture errors instead of throwing. */
  captureToolErrors?: boolean

  /** Optional repair function called when a tool call fails. */
  repairToolCall?: (toolCall: ToolCall, messages: Message[]) => Promise<ToolCall | null>

  /** Called before tool execution starts. */
  onToolCallStart?: (info: { input: Record<string, unknown>; toolCallId: string; toolName: string }) => void

  /** Called after tool execution finishes. */
  onToolCallFinish?: (info: {
    toolName: string
    toolCallId: string
    output?: string
    error?: InvalidToolCallError | InvalidToolInputError | ToolExecutionError
    durationMs: number
  }) => void
}
```

### Exported Function

```typescript
export async function executeTool(options: ExecuteToolOptions): Promise<{
  completionToolResult: CompletionToolResult | CapturedToolResult
  message: Message
}>
```

### Error Classification

The wrapper catches errors from the upstream `executeTool` and classifies them:

| Error Condition        | Error Type              | Detection                                                 |
| ---------------------- | ----------------------- | --------------------------------------------------------- |
| Unknown tool name      | `InvalidToolCallError`  | Error message contains tool name reference or "not found" |
| Invalid JSON arguments | `InvalidToolInputError` | Error is `SyntaxError` or contains "JSON" / "parse"       |
| Tool execute rejection | `ToolExecutionError`    | Any other error from tool execution                       |
| AbortError             | Rethrown                | `error.name === 'AbortError'`                             |

### Execution Flow

```
executeTool(options)
  │
  ├─ Try direct execution:
  │    ├─ Find tool by name
  │    ├─ Parse arguments as JSON
  │    ├─ onToolCallStart?.({ input, toolCallId, toolName })
  │    ├─ Execute tool
  │    ├─ onToolCallFinish?.({ toolName, toolCallId, output, durationMs })
  │    └─ Return { completionToolResult, message }
  │
  ├─ On AbortError → rethrow
  │
  ├─ On error + !captureToolErrors:
  │    ├─ If repairToolCall → call it
  │    │    ├─ Returns valid ToolCall → retry execution
  │    │    └─ Returns null → throw InvalidToolCallError
  │    └─ No repairToolCall → rethrow
  │
  └─ On error + captureToolErrors:
       ├─ Classify error
       ├─ If repairToolCall → call it
       │    ├─ Returns valid ToolCall → retry execution (return success)
       │    └─ Returns null → return error result
       ├─ onToolCallFinish?.({ toolName, toolCallId, error, durationMs })
       └─ Return { completionToolResult: { isError: true, error, result }, message }
```

## Test Updates

The test file `execute-tool.test.ts` requires minimal changes:

1. Change import from `import { executeTool } from '@xsai/shared-chat'` to `import { executeTool } from './execute-tool'`
2. All existing test assertions remain unchanged since the wrapper's API surface matches what the tests expect.

## Error Message Format

For captured errors, the message content follows the pattern:

```
Tool call error for "<toolName>": <errorMessage>
```

This matches the existing pattern in `packages/core-agent/src/runtime/llm-service.ts` (`createCapturedToolErrorResult`).

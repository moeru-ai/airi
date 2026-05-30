# Requirements: executeTool Wrapper

## Problem Statement

`packages/stage-ui/src/stores/execute-tool.test.ts` imports `executeTool` from `@xsai/shared-chat` and tests a **hypothetical patched API** that includes options (`captureToolErrors`, `repairToolCall`, `onToolCallStart`, `onToolCallFinish`) and result properties (`isError`, `error`) which do not exist in the upstream `@xsai/shared-chat` v0.5.0-beta.2 package. This causes 18 typecheck errors.

The test file's describe block explicitly labels this as "patched @xsai/shared-chat", confirming the features were planned but never implemented.

## Goals

1. Create a local `executeTool` wrapper module in `packages/stage-ui` that wraps the upstream `@xsai/shared-chat` `executeTool` with additional features.
2. Update the existing test to import from the local wrapper instead of `@xsai/shared-chat` directly.
3. Ensure `pnpm -F @proj-airi/stage-ui typecheck` passes.

## Functional Requirements

### FR-1: Core Wrapper

The wrapper must re-export or wrap the upstream `executeTool` from `@xsai/shared-chat`, accepting all the original parameters plus additional options.

### FR-2: `captureToolErrors` Option

When `captureToolErrors: true` is passed:

- Tool execution errors (unknown tool, invalid JSON arguments, tool execute rejection) are **captured** instead of thrown.
- The return value includes a `completionToolResult` augmented with `isError: true` and an `error` property containing the appropriate error instance (`InvalidToolCallError`, `InvalidToolInputError`, or `ToolExecutionError` from `@xsai/shared`).
- The returned `message` includes a stringified error content with the tool name.

When `captureToolErrors` is not set (default), the wrapper preserves upstream behavior — errors are thrown.

### FR-3: `repairToolCall` Option

When `repairToolCall` is provided:

- If the original tool call fails (e.g., unknown tool), the wrapper calls `repairToolCall` with the original tool call and messages.
- If `repairToolCall` returns a valid tool call, the wrapper retries execution with the repaired call.
- If `repairToolCall` returns `null`, the wrapper returns an error result (or throws `InvalidToolCallError` if `captureToolErrors` is not set).

### FR-4: Lifecycle Callbacks

The wrapper supports `onToolCallStart` and `onToolCallFinish` callbacks:

- `onToolCallStart` is called before tool execution with `{ input, toolCallId, toolName }`.
- `onToolCallFinish` is called after execution with `{ toolName, toolCallId, output, error, durationMs }`.
- For unknown tool errors (no tool found), `onToolCallStart` is NOT called, but `onToolCallFinish` IS called with the error.

### FR-5: AbortError Passthrough

`AbortError` instances thrown by tool execution must always be rethrown, regardless of `captureToolErrors`.

### FR-6: Error Types

The wrapper must use error types from `@xsai/shared`:

- `InvalidToolCallError` — for unknown/unresolvable tool calls
- `InvalidToolInputError` — for invalid JSON arguments
- `ToolExecutionError` — for tool execute rejections

## Non-Functional Requirements

- **NFR-1**: The wrapper must be a plain TypeScript module (not a Pinia store), placed at `packages/stage-ui/src/stores/execute-tool.ts`.
- **NFR-2**: The test file must be updated to import from the local wrapper (`./execute-tool`) instead of `@xsai/shared-chat`.
- **NFR-3**: All existing test cases must pass with the same assertions.
- **NFR-4**: The wrapper must not modify the upstream `@xsai/shared-chat` module.
- **NFR-5**: Follow project coding conventions (JSDoc on exports, `errorMessageFrom` from `@moeru/std`, Valibot for schemas if needed).

## Out of Scope

- Modifying the upstream `@xsai/shared-chat` package.
- Adding the wrapper to the package exports map (it's only used internally by tests and potentially internal stores).
- Implementing tool execution retry logic beyond `repairToolCall`.

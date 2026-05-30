# Tasks: executeTool Wrapper

## Phase 1: Create the Wrapper Module

- [x] **T1**: Create `packages/stage-ui/src/stores/execute-tool.ts`
  - Import `executeTool` from `@xsai/shared-chat` (upstream)
  - Import error classes from `@xsai/shared` (`InvalidToolCallError`, `InvalidToolInputError`, `ToolExecutionError`)
  - Import `errorMessageFrom` from `@moeru/std`
  - Define and export `CapturedToolResult` interface
  - Define and export `ExecuteToolOptions` interface
  - Implement and export `executeTool` function with:
    - Tool lookup by name
    - JSON argument parsing
    - Upstream `executeTool` invocation
    - `captureToolErrors` error capture logic
    - `repairToolCall` retry logic
    - `onToolCallStart` / `onToolCallFinish` lifecycle callbacks
    - `AbortError` passthrough
  - Add JSDoc on all exported types and the main function

## Phase 2: Update the Test File

- [x] **T2**: Update `packages/stage-ui/src/stores/execute-tool.test.ts`
  - Change `import { executeTool } from '@xsai/shared-chat'` to `import { executeTool } from './execute-tool'`
  - Remove the `type` import for `Message`, `Tool`, `ToolCall` from `@xsai/shared-chat` if no longer needed directly (they're still used in test helpers, so keep)
  - No assertion changes needed — all existing tests should pass as-is against the wrapper

## Phase 3: Verify

- [x] **T3**: Run typecheck
  - `pnpm -F @proj-airi/stage-ui typecheck` — must pass with zero errors
- [x] **T4**: Run tests
  - `pnpm -F @proj-airi/stage-ui exec vitest run src/stores/execute-tool.test.ts` — all tests must pass
- [x] **T5**: Run format check
  - `pnpm format:check` — must pass

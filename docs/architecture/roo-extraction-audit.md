# Roo Extraction Audit

Audit of the Roo-derived codebase (`modules/code/`) to identify VSCode-coupled components, reusable execution logic, and extension-host assumptions. Categorized as **reusable now**, **reusable later**, or **replace entirely**.

## VSCode-Coupled Components (from `src/`)

| Component | File | Verdict | Notes |
|-----------|------|---------|-------|
| Extension entry point | `src/extension.ts` | **Replace entirely** | Imports `vscode` directly, registers commands/providers, manages webview panels |
| Webview panel management | `src/core/webview/ClineProvider.ts` | **Replace entirely** | VSCode webview panel lifecycle, message passing to webview |
| ExecuteCommandTool | `src/core/tools/ExecuteCommandTool.ts` | **Replace entirely** | Imports `vscode` for terminal creation and execution |
| Terminal integration | `src/integrations/terminal/` | **Replace entirely** | VSCode terminal registry, terminal events |
| Editor/DiffView integration | `src/integrations/editor/` | **Replace entirely** | VSCode DiffViewProvider, editor decorations |
| ContextProxy | `src/core/config/ContextProxy.ts` | **Replace entirely** | Wraps `vscode.workspace.getConfiguration` |
| VSCode API shim | `packages/vscode-shim/src/` | **Reusable later** | Proves decoupling is possible; shim layer can be adapted for other editors |

## Reusable Execution Logic (from `packages/types/src/`)

| Type | File | Verdict | Notes |
|------|------|---------|-------|
| ToolName, ToolGroup, toolDisplayNames | `tool.ts` | **Reusable now** | Pure data, no dependencies |
| Tool params (ReadFileParams, etc.) | `tool-params.ts` | **Reusable now** | Zod schemas, no editor deps |
| TaskLike, TaskProviderLike, TaskStatus | `task.ts` | **Reusable later** | Adapt interface for AIRI task model |
| ClineMessage, ClineAsk, TokenUsage | `message.ts` | **Reusable later** | Adapt for AIRI streaming events |
| GitRepositoryInfo, GitCommit | `git.ts` | **Reusable now** | Plain interfaces, no deps |
| Worktree, WorktreeResult, CreateWorktreeOptions | `worktree.ts` | **Reusable now** | Plain interfaces, no deps |
| RooCodeEventName enum | `events.ts` | **Reusable later** | Adapt for AIRI event types |
| Mode definitions | `mode.ts` | **Reusable now** | Pure data |

## Reusable Planners/Tool Orchestration (from `src/core/tools/`)

| Component | File | Verdict | Notes |
|-----------|------|---------|-------|
| BaseTool abstract class | `BaseTool.ts` | **Reusable later** | Adapt for capability boundary; strip Task dependency |
| ReadFileTool | `ReadFileTool.ts` | **Reusable now** | File reading with slice/indentation modes; extract logic, replace `vscode.workspace.fs` with Node.js `fs` |
| ListFilesTool | `ListFilesTool.ts` | **Reusable now** | Directory listing; replace `listFiles` service with Node.js `fs` |
| SearchFilesTool | `SearchFilesTool.ts` | **Reusable now** | File search with regex; replace `regexSearchFiles` with Node.js implementation |
| ApplyDiffTool | `ApplyDiffTool.ts` | **Reusable later** | Diff application logic is sound but tightly coupled to diff strategy and approval flow |
| ApplyPatchTool | `ApplyPatchTool.ts` | **Reusable later** | Patch parsing is editor-independent; approval flow is not |

## Extension-Host Assumptions

| Assumption | Roo Implementation | AIRI Replacement |
|------------|-------------------|-----------------|
| `vscode.workspace.fs` | Used for all file reads/writes | Node.js `fs/promises` |
| `vscode.window.createTerminal` | Used for shell command execution | `node:child_process` (`exec`, `spawn`) |
| `vscode.workspace.getConfiguration` | Used for settings | Environment variables / file-based config |
| `vscode.EventEmitter` | Used for event propagation | AIRI EventBus |
| `vscode.Uri` | Used for file path abstraction | Plain string paths or `node:path` |
| `vscode.TextEditor` | Used for editor interactions | No editor — capability-oriented |
| `vscode.DiffViewProvider` | Used for diff display | Pure string manipulation |

## Summary

- **Reusable now (10)**: ToolName/ToolGroup, tool params, Git types, Worktree types, Mode types, ReadFileTool logic, ListFilesTool logic, SearchFilesTool logic, ApplyDiffTool logic, ApplyPatchTool logic
- **Reusable later (6)**: TaskLike/TaskProviderLike, ClineMessage/TokenUsage, RooCodeEventName, BaseTool pattern, ApplyDiffTool approval flow, ApplyPatchTool approval flow
- **Replace entirely (7)**: extension.ts, ClineProvider, ExecuteCommandTool, terminal integration, editor/DiffView integration, ContextProxy, webview management

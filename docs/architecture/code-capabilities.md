# Code Capabilities Architecture

## Overview

The code capabilities layer extracts real coding-agent functionality from the Roo-derived codebase (`modules/code/`) into AIRI's worker-runtime architecture. This replaces the mock `CodeTaskExecutor` with editor-independent capabilities that run in isolated worker processes.

## Capability Extraction Strategy

### What was extracted from Roo

| Roo Component | What was extracted | How it was adapted |
|---------------|-------------------|-------------------|
| `ReadFileTool.ts` | File reading with slice/indentation modes, binary detection | New `ReadFileTool` using Node.js `fs/promises` + `isbinaryfile` |
| `ListFilesTool.ts` | Directory listing with recursive support | New `ListFilesTool` using Node.js `fs/promises` |
| `SearchFilesTool.ts` | Regex-based file content search | New `SearchFilesTool` using Node.js `fs` |
| `ApplyDiffTool.ts` | Diff application (SEARCH/REPLACE + unified diff) | New `ApplyDiffTool` with pure string manipulation |
| `BaseTool.ts` | Abstract tool pattern with validation | `ToolCapability` interface with `validateInput()` + `execute()` |
| `ToolName`, `ToolGroup` | Tool type system | Reused as-is from `@roo-code/types` |
| `Worktree`, `CreateWorktreeOptions` | Worktree type definitions | Reused as-is from `@roo-code/types` |
| `GitRepositoryInfo`, `GitCommit` | Git type definitions | Reused as-is from `@roo-code/types` |

### What was replaced

| Roo Component | Why it was replaced | AIRI replacement |
|---------------|---------------------|-----------------|
| `src/extension.ts` | VSCode extension entry point | `airios.module.ts` with `AiriModule` interface |
| `src/core/webview/ClineProvider.ts` | VSCode webview management | AIRI event bus + streaming protocol |
| `src/core/tools/ExecuteCommandTool.ts` | Uses `vscode.window.createTerminal` | Not extracted (security concern for workers) |
| `src/integrations/terminal/` | VSCode terminal integration | Not extracted (worker processes don't have terminals) |
| `src/integrations/editor/` | VSCode DiffViewProvider | Pure string manipulation in `ApplyDiffTool` |
| `src/core/config/ContextProxy` | VSCode configuration proxy | Task metadata + environment variables |

### What was adapted

| Roo Pattern | AIRI Adaptation |
|-------------|----------------|
| `ToolCallbacks` (askApproval, handleError, pushToolResult) | `CapabilityExecutionContext` with structured logging |
| `Task` class dependency | Removed — capabilities are task-agnostic |
| `vscode.workspace.fs` | Node.js `fs/promises` |
| `vscode.EventEmitter` | AIRI `EventBus` + `StreamingEmitter` |
| `vscode.window.createTerminal` | Not applicable (workers are headless) |

## Capability Topology

```
┌─────────────────────────────────────────────────────────┐
│                    AIRI Daemon                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ TaskManager  │──│ TaskScheduler│──│ WorkerManager │  │
│  └──────────────┘  └──────────────┘  └──────┬───────┘  │
│                                              │          │
│  ┌───────────────────────────────────────────┘          │
│  │  EventBus                                           │
│  │  ├── workspace.created                              │
│  │  ├── tool.execution.started/completed              │
│  │  ├── patch.generated/approved/rejected               │
│  │  └── task.started/completed/failed                  │
│  └─────────────────────────────────────────────────────┘
│                          │ stdio (length-prefixed JSON)
├──────────────────────────┼──────────────────────────────┤
│              Worker Process                              │
│  ┌───────────────────────┴──────────────────────────┐   │
│  │           CapabilityCodeExecutor                  │   │
│  │  ┌─────────────────────────────────────────────┐ │   │
│  │  │         CapabilityRegistry                  │ │   │
│  │  │  ┌──────────┐ ┌──────────┐ ┌────────────┐  │ │   │
│  │  │  │ReadFile  │ │ListFiles │ │SearchFiles │  │ │   │
│  │  │  │Tool      │ │Tool      │ │Tool        │  │ │   │
│  │  │  └──────────┘ └──────────┘ └────────────┘  │ │   │
│  │  │  ┌──────────┐                               │ │   │
│  │  │  │ApplyDiff │                               │ │   │
│  │  │  │Tool      │                               │ │   │
│  │  │  └──────────┘                               │ │   │
│  │  └─────────────────────────────────────────────┘ │   │
│  │  ┌─────────────────────────────────────────────┐ │   │
│  │  │       WorkspaceSessionManager               │ │   │
│  │  │  ┌──────────────┐  ┌───────────────────┐   │ │   │
│  │  │  │  Session #1  │  │    Session #2     │   │ │   │
│  │  │  │  (workspace) │  │    (temp dir)     │   │ │   │
│  │  │  └──────────────┘  └───────────────────┘   │ │   │
│  │  └─────────────────────────────────────────────┘ │   │
│  │  ┌─────────────────────────────────────────────┐ │   │
│  │  │         StreamingEmitter                    │ │   │
│  │  │  ┌─────────┐ ┌─────────┐ ┌──────────┐     │ │   │
│  │  │  │ tokens  │ │ partial │ │ progress │     │ │   │
│  │  │  └─────────┘ └─────────┘ └──────────┘     │ │   │
│  │  └─────────────────────────────────────────────┘ │   │
│  │  ┌─────────────────────────────────────────────┐ │   │
│  │  │         PatchGenerator                      │ │   │
│  │  │  generateDiff / createProposal / applyPatch │ │   │
│  │  └─────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Workspace Lifecycle

```
Create ──→ Use ──→ Dispose
  │         │        │
  │         │        ├── Remove temp dirs (if useTempDir)
  │         │        ├── Clear streaming events
  │         │        └── Release session from manager
  │         │
  │         ├── scan() → file count, git info
  │         ├── readFile() → content with slice/indentation
  │         ├── listFiles() → directory entries
  │         └── exists() → boolean
  │
  ├── Create session ID (ws-{timestamp}-{random})
  ├── Resolve workspace path (from task metadata or cwd)
  └── Optionally create temp directory (sandboxed mode)
```

## Patch Approval Flow

```
Generate ──→ Propose ──→ Review ──→ Apply/Reject
    │            │          │           │
    │            │          │           ├── Write patched files
    │            │          │           └── Emit patch.approved
    │            │          │
    │            │          └── User/system approves or rejects
    │            │
    │            ├── Create PatchProposal with ID
    │            ├── Set status to "pending"
    │            └── Emit patch.generated event
    │
    ├── generateDiff(original, modified) → unified diff
    └── createProposal(taskId, files, desc) → PatchProposal
```

## Tool Boundaries

```
TaskExecutor.execute(task, ctx)
    │
    ├── Create workspace session
    ├── Emit workspace.created event
    │
    ├── For each tool call:
    │   ├── CodeToolExecutor.execute(input, ctx)
    │   │   ├── Lookup tool in registry
    │   │   ├── Validate input
    │   │   ├── Execute with timeout
    │   │   └── Return ToolOutput
    │   │
    │   ├── Emit tool.execution.started
    │   └── Emit tool.execution.completed
    │
    ├── Generate diffs/patches
    │   └── Emit patch.generated
    │
    ├── Report progress via StreamingEmitter
    │
    └── Dispose workspace session (always)
```

## Why VSCode Assumptions Are Isolated

The Roo codebase uses a **vscode-shim pattern** (`packages/vscode-shim/src/`) that provides mock implementations of VSCode APIs. This proves that the core logic can be decoupled from VSCode.

In AIRI's architecture:

1. **No VSCode imports** in any new files under `modules/code/capabilities/`, `workspace/`, `tools/`, `streaming/`, `patches/`.
2. **Node.js fs** replaces `vscode.workspace.fs` for all file operations.
3. **Node.js child_process** replaces `vscode.window.createTerminal` for command execution (not yet implemented).
4. **AIRI EventBus** replaces `vscode.EventEmitter` for event propagation.
5. **Task metadata** replaces `vscode.workspace.getConfiguration` for settings.

## Future Adapter Direction

To add support for a new editor/IDE:

1. **Create an adapter module** under `modules/code/adapters/{editor}/`.
2. **Implement the `AiriModule` interface** for the editor.
3. **Map editor events** to AIRI events via the EventBus.
4. **Map editor commands** to `ToolCapability` implementations.
5. **No changes needed** to the capability layer itself.

The capability layer is editor-agnostic by design. Adapters are thin translation layers between editor-specific APIs and AIRI's capability interfaces.

/**
 * VS Code Tool Descriptors
 */

import type { ToolDescriptor } from './types'

export const vscodeDescriptors: ToolDescriptor[] = [
  {
    canonicalName: 'vscode_resolve_code_cli',
    displayName: 'VS Code Resolve CLI',
    summary: 'Detect the active VS Code CLI binary (code, code-insiders, or cursor) available in PATH.',
    lane: 'vscode',
    kind: 'read',
    readOnly: true,
    destructive: false,
    concurrencySafe: true,
    requiresApprovalByDefault: false,
    public: true,
  },
  {
    canonicalName: 'vscode_open_workspace',
    displayName: 'VS Code Open Workspace',
    summary: 'Open a folder in VS Code using the CLI. Supports reusing or creating new windows.',
    lane: 'vscode',
    kind: 'control',
    readOnly: false,
    destructive: false,
    concurrencySafe: false,
    requiresApprovalByDefault: true,
    public: true,
  },
  {
    canonicalName: 'vscode_open_file',
    displayName: 'VS Code Open File',
    summary: 'Open a file in VS Code at a specific line and column using the --goto option.',
    lane: 'vscode',
    kind: 'control',
    readOnly: false,
    destructive: false,
    concurrencySafe: false,
    requiresApprovalByDefault: false,
    public: true,
  },
  {
    canonicalName: 'vscode_run_task',
    displayName: 'VS Code Run Task',
    summary: 'Run a shell command in VS Code integrated terminal. Returns the command output.',
    lane: 'vscode',
    kind: 'write',
    readOnly: false,
    destructive: false,
    concurrencySafe: false,
    requiresApprovalByDefault: true,
    public: true,
  },
  {
    canonicalName: 'vscode_list_problems',
    displayName: 'VS Code List Problems',
    summary: 'Parse TypeScript diagnostics by running typecheck and extracting errors. Returns structured problem objects.',
    lane: 'vscode',
    kind: 'read',
    readOnly: true,
    destructive: false,
    concurrencySafe: true,
    requiresApprovalByDefault: false,
    public: true,
  },
]

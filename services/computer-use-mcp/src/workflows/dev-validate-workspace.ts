/**
 * Workflow: Dev → Validate Workspace
 *
 * Opens a workspace in Finder and an IDE, confirms the working directory,
 * inspects local changes, and runs a validation command such as typecheck.
 */

import type { WorkflowDefinition } from './types'

import { canonicalizeKnownAppName } from '../app-aliases'
import { createOpenWorkspaceSteps } from './dev-open-workspace'

export function createDevValidateWorkspaceWorkflow(params?: {
  projectPath?: string
  ideApp?: string
  fileManagerApp?: string
  changesCommand?: string
  checkCommand?: string
}): WorkflowDefinition {
  const projectPath = params?.projectPath ?? '{projectPath}'
  const ideApp = canonicalizeKnownAppName(params?.ideApp ?? 'Cursor')
  const fileManagerApp = canonicalizeKnownAppName(params?.fileManagerApp ?? 'Finder')
  const changesCommand = params?.changesCommand ?? 'git diff --stat'
  const checkCommand = params?.checkCommand ?? 'pnpm typecheck'

  return {
    id: 'dev_validate_workspace',
    name: `Open workspace in ${ideApp} and validate project state`,
    description: `Reveal "${projectPath}" in ${fileManagerApp}, open it in ${ideApp}, inspect local changes with "${changesCommand}", run "${checkCommand}", and summarize the results.`,
    maxRetries: 2,
    steps: [
      ...createOpenWorkspaceSteps({ projectPath, ideApp, fileManagerApp }),
      {
        label: 'Confirm project working directory',
        kind: 'run_command',
        description: 'Run pwd in the target workspace to confirm the terminal is anchored to the project root.',
        params: {
          command: 'pwd',
          cwd: projectPath,
          timeoutMs: 30_000,
        },
        critical: true,
      },
      {
        label: 'Inspect local changes',
        kind: 'run_command',
        description: `Inspect the local workspace changes using "${changesCommand}".`,
        params: {
          command: changesCommand,
          cwd: projectPath,
          timeoutMs: 30_000,
        },
        critical: true,
      },
      {
        label: 'Run workspace validation',
        kind: 'run_command',
        description: `Run the validation command "${checkCommand}".`,
        params: {
          command: checkCommand,
          cwd: projectPath,
          timeoutMs: 120_000,
        },
        critical: true,
      },
      {
        label: 'Summarize workspace validation',
        kind: 'summarize',
        description: 'Summarize the opened apps, confirmed working directory, local change status, and validation result.',
        params: {},
      },
    ],
  }
}

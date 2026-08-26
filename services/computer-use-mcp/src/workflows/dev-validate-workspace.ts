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
  changesCommand?: string
  checkCommand?: string
  fileManagerApp?: string
  ideApp?: string
  projectPath?: string
}): WorkflowDefinition {
  const projectPath = params?.projectPath ?? '{projectPath}'
  const ideApp = canonicalizeKnownAppName(params?.ideApp ?? 'Cursor')
  const fileManagerApp = canonicalizeKnownAppName(params?.fileManagerApp ?? 'Finder')
  const changesCommand = params?.changesCommand ?? 'git diff --stat'
  const checkCommand = params?.checkCommand ?? 'pnpm typecheck'

  return {
    description: `Reveal "${projectPath}" in ${fileManagerApp}, open it in ${ideApp}, inspect local changes with "${changesCommand}", run "${checkCommand}", and summarize the results.`,
    id: 'dev_validate_workspace',
    maxRetries: 2,
    name: `Open workspace in ${ideApp} and validate project state`,
    steps: [
      ...createOpenWorkspaceSteps({ fileManagerApp, ideApp, projectPath }),
      {
        critical: true,
        description: 'Run pwd in the target workspace to confirm the terminal is anchored to the project root.',
        kind: 'run_command',
        label: 'Confirm project working directory',
        params: {
          command: 'pwd',
          cwd: projectPath,
          timeoutMs: 30_000,
        },
      },
      {
        critical: true,
        description: `Inspect the local workspace changes using "${changesCommand}".`,
        kind: 'run_command',
        label: 'Inspect local changes',
        params: {
          command: changesCommand,
          cwd: projectPath,
          timeoutMs: 30_000,
        },
      },
      {
        critical: true,
        description: `Run the validation command "${checkCommand}".`,
        kind: 'run_command',
        label: 'Run workspace validation',
        params: {
          command: checkCommand,
          cwd: projectPath,
          timeoutMs: 120_000,
        },
      },
      {
        description: 'Summarize the opened apps, confirmed working directory, local change status, and validation result.',
        kind: 'summarize',
        label: 'Summarize workspace validation',
        params: {},
      },
    ],
  }
}

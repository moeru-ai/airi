/**
 * Workflow: Dev → Open Workspace
 *
 * Reveals a project directory in Finder and opens the same directory in an IDE.
 * This keeps the flow deterministic by using terminal-backed `open` commands
 * instead of relying on brittle desktop clicks.
 *
 * Parameterised by:
 *   - projectPath: absolute path to the project root
 *   - ideApp: IDE to open the project with (default: Cursor)
 *   - fileManagerApp: file manager to foreground after reveal (default: Finder)
 */

import type { WorkflowDefinition, WorkflowStepTemplate } from './types'

import { canonicalizeKnownAppName, getKnownAppLaunchNames } from '../app-aliases'

export function createDevOpenWorkspaceWorkflow(params?: {
  fileManagerApp?: string
  ideApp?: string
  projectPath?: string
}): WorkflowDefinition {
  const projectPath = params?.projectPath ?? '{projectPath}'
  const ideApp = canonicalizeKnownAppName(params?.ideApp ?? 'Cursor')
  const fileManagerApp = canonicalizeKnownAppName(params?.fileManagerApp ?? 'Finder')

  return {
    description: `Reveal "${projectPath}" in ${fileManagerApp} and open the same directory in ${ideApp}.`,
    id: 'dev_open_workspace',
    maxRetries: 2,
    name: `Open workspace in ${fileManagerApp} and ${ideApp}`,
    steps: [
      ...createOpenWorkspaceSteps({ fileManagerApp, ideApp, projectPath }),
      {
        description: 'Capture the current desktop window list for the workspace-opening task.',
        kind: 'observe_windows',
        label: 'Observe visible workspace windows',
        params: { limit: 12 },
        skippable: true,
      },
      {
        description: 'Summarize which apps were opened and whether the workspace is ready.',
        kind: 'summarize',
        label: 'Summarize workspace state',
        params: {},
      },
    ],
  }
}

export function createOpenWorkspaceSteps(params?: {
  fileManagerApp?: string
  ideApp?: string
  projectPath?: string
}): WorkflowStepTemplate[] {
  const projectPath = params?.projectPath ?? '{projectPath}'
  const ideApp = canonicalizeKnownAppName(params?.ideApp ?? 'Cursor')
  const fileManagerApp = canonicalizeKnownAppName(params?.fileManagerApp ?? 'Finder')

  return [
    {
      critical: true,
      description: `Open the project directory in ${fileManagerApp}.`,
      kind: 'run_command',
      label: `Reveal project in ${fileManagerApp}`,
      params: {
        command: 'open .',
        cwd: projectPath,
        timeoutMs: 30_000,
      },
    },
    {
      description: `Bring ${fileManagerApp} to the foreground so the project directory is visible.`,
      kind: 'ensure_app',
      label: `Focus ${fileManagerApp}`,
      params: { app: fileManagerApp },
      skippable: true,
    },
    {
      critical: true,
      description: `Open the same directory in ${ideApp}.`,
      kind: 'run_command',
      label: `Open project in ${ideApp}`,
      params: {
        command: buildOpenAppCommand(ideApp),
        cwd: projectPath,
        timeoutMs: 30_000,
      },
    },
    {
      description: `Bring ${ideApp} to the foreground after opening the workspace.`,
      kind: 'ensure_app',
      label: `Focus ${ideApp}`,
      params: { app: ideApp },
      skippable: true,
    },
  ]
}

function buildOpenAppCommand(app: string) {
  const candidates = Array.from(new Set(getKnownAppLaunchNames(app)))
  return candidates
    .map(candidate => `open -a ${JSON.stringify(candidate)} .`)
    .join(' || ')
}

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

function buildOpenAppCommand(app: string) {
  const candidates = Array.from(new Set(getKnownAppLaunchNames(app)))
  return candidates
    .map(candidate => `open -a ${JSON.stringify(candidate)} .`)
    .join(' || ')
}

export function createOpenWorkspaceSteps(params?: {
  projectPath?: string
  ideApp?: string
  fileManagerApp?: string
}): WorkflowStepTemplate[] {
  const projectPath = params?.projectPath ?? '{projectPath}'
  const ideApp = canonicalizeKnownAppName(params?.ideApp ?? 'Cursor')
  const fileManagerApp = canonicalizeKnownAppName(params?.fileManagerApp ?? 'Finder')

  return [
    {
      label: `Reveal project in ${fileManagerApp}`,
      kind: 'run_command',
      description: `Open the project directory in ${fileManagerApp}.`,
      params: {
        command: 'open .',
        cwd: projectPath,
        timeoutMs: 30_000,
      },
      critical: true,
    },
    {
      label: `Focus ${fileManagerApp}`,
      kind: 'ensure_app',
      description: `Bring ${fileManagerApp} to the foreground so the project directory is visible.`,
      params: { app: fileManagerApp },
      skippable: true,
    },
    {
      label: `Open project in ${ideApp}`,
      kind: 'run_command',
      description: `Open the same directory in ${ideApp}.`,
      params: {
        command: buildOpenAppCommand(ideApp),
        cwd: projectPath,
        timeoutMs: 30_000,
      },
      critical: true,
    },
    {
      label: `Focus ${ideApp}`,
      kind: 'ensure_app',
      description: `Bring ${ideApp} to the foreground after opening the workspace.`,
      params: { app: ideApp },
      skippable: true,
    },
  ]
}

export function createDevOpenWorkspaceWorkflow(params?: {
  projectPath?: string
  ideApp?: string
  fileManagerApp?: string
}): WorkflowDefinition {
  const projectPath = params?.projectPath ?? '{projectPath}'
  const ideApp = canonicalizeKnownAppName(params?.ideApp ?? 'Cursor')
  const fileManagerApp = canonicalizeKnownAppName(params?.fileManagerApp ?? 'Finder')

  return {
    id: 'dev_open_workspace',
    name: `Open workspace in ${fileManagerApp} and ${ideApp}`,
    description: `Reveal "${projectPath}" in ${fileManagerApp} and open the same directory in ${ideApp}.`,
    maxRetries: 2,
    steps: [
      ...createOpenWorkspaceSteps({ projectPath, ideApp, fileManagerApp }),
      {
        label: 'Observe visible workspace windows',
        kind: 'observe_windows',
        description: 'Capture the current desktop window list for the workspace-opening task.',
        params: { limit: 12 },
        skippable: true,
      },
      {
        label: 'Summarize workspace state',
        kind: 'summarize',
        description: 'Summarize which apps were opened and whether the workspace is ready.',
        params: {},
      },
    ],
  }
}

/**
 * Workflow: Dev → Inspect Failure
 *
 * Opens the IDE (Cursor / VSCode), combines terminal output with the
 * visible editor state, and helps locate the root cause of a test or
 * build failure.
 *
 * Parameterised by:
 *   - ideApp: the IDE to focus (default: "Cursor")
 *   - diagnosticCommand: optional terminal command to re-run for error output
 */

import type { WorkflowDefinition } from './types'

export function createDevInspectFailureWorkflow(params?: {
  ideApp?: string
  diagnosticCommand?: string
}): WorkflowDefinition {
  const ideApp = params?.ideApp ?? 'Cursor'
  const diagnosticCommand = params?.diagnosticCommand

  const steps: WorkflowDefinition['steps'] = [
    {
      label: `Focus ${ideApp}`,
      kind: 'ensure_app',
      description: `Bring ${ideApp} to the foreground so we can see the editor state.`,
      params: { app: ideApp },
      skippable: true,
    },
    {
      label: 'Screenshot IDE state',
      kind: 'take_screenshot',
      description: 'Capture the current editor view to understand what file is open and any inline errors.',
      params: { label: 'ide-state' },
    },
  ]

  if (diagnosticCommand) {
    steps.push({
      label: 'Re-run diagnostic command',
      kind: 'run_command',
      description: `Execute "${diagnosticCommand}" to get fresh error output.`,
      params: { command: diagnosticCommand, timeoutMs: 60_000 },
    })
  }

  steps.push(
    {
      label: 'Capture terminal error output',
      kind: 'run_command',
      description: 'Read the last terminal error to correlate with the editor state.',
      params: { command: 'echo "--- stderr from last command ---" && cat /dev/null' },
      // NOTICE: This is a placeholder; the real value comes from the
      // strategy layer inspecting lastTerminalResult in run state.
      skippable: true,
    },
    {
      label: 'Evaluate failure context',
      kind: 'evaluate',
      description: 'Combine the screenshot, terminal output, and run state to locate the failure.',
      params: {},
    },
    {
      label: 'Summarize findings',
      kind: 'summarize',
      description: 'Produce a summary of the likely root cause and suggested fix.',
      params: {},
    },
  )

  return {
    id: 'dev_inspect_failure',
    name: `Inspect failure in ${ideApp}`,
    description: `Focus ${ideApp}, capture the editor state, combine with terminal output, and locate the root cause.`,
    maxRetries: 2,
    steps,
  }
}

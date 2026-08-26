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
  diagnosticCommand?: string
  ideApp?: string
}): WorkflowDefinition {
  const ideApp = params?.ideApp ?? 'Cursor'
  const diagnosticCommand = params?.diagnosticCommand

  const steps: WorkflowDefinition['steps'] = [
    {
      description: `Bring ${ideApp} to the foreground so we can see the editor state.`,
      kind: 'ensure_app',
      label: `Focus ${ideApp}`,
      params: { app: ideApp },
      skippable: true,
    },
    {
      description: 'Capture the current editor view to understand what file is open and any inline errors.',
      kind: 'take_screenshot',
      label: 'Screenshot IDE state',
      params: { label: 'ide-state' },
    },
  ]

  if (diagnosticCommand) {
    steps.push({
      description: `Execute "${diagnosticCommand}" to get fresh error output.`,
      kind: 'run_command',
      label: 'Re-run diagnostic command',
      params: { command: diagnosticCommand, timeoutMs: 60_000 },
    })
  }

  steps.push(
    {
      description: 'Read the last terminal error to correlate with the editor state.',
      kind: 'run_command',
      label: 'Capture terminal error output',
      params: { command: 'echo "--- stderr from last command ---" && cat /dev/null' },
      // NOTICE: This is a placeholder; the real value comes from the
      // strategy layer inspecting lastTerminalResult in run state.
      skippable: true,
    },
    {
      description: 'Combine the screenshot, terminal output, and run state to locate the failure.',
      kind: 'evaluate',
      label: 'Evaluate failure context',
      params: {},
    },
    {
      description: 'Produce a summary of the likely root cause and suggested fix.',
      kind: 'summarize',
      label: 'Summarize findings',
      params: {},
    },
  )

  return {
    description: `Focus ${ideApp}, capture the editor state, combine with terminal output, and locate the root cause.`,
    id: 'dev_inspect_failure',
    maxRetries: 2,
    name: `Inspect failure in ${ideApp}`,
    steps,
  }
}

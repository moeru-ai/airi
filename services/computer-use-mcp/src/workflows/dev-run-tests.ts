/**
 * Workflow: Dev → Run Tests
 *
 * Opens a project directory, runs the test suite, and summarizes results.
 * Designed for monorepo-style projects with `pnpm` / `npm` / `yarn`.
 *
 * Parameterised by:
 *   - projectPath: absolute path to the project root
 *   - testCommand: the shell command to run tests (default: `pnpm test:run`)
 */

import type { WorkflowDefinition } from './types'

export function createDevRunTestsWorkflow(params?: {
  projectPath?: string
  testCommand?: string
}): WorkflowDefinition {
  const projectPath = params?.projectPath ?? '{projectPath}'
  const testCommand = params?.testCommand ?? 'pnpm test:run'

  return {
    description: `Open the project at "${projectPath}", run "${testCommand}", and produce a summary of pass/fail results.`,
    id: 'dev_run_tests',
    maxRetries: 3,
    name: 'Run project tests and summarize results',
    steps: [
      {
        description: 'Make sure Terminal (or the configured shell host) is open.',
        kind: 'ensure_app',
        label: 'Ensure Terminal is available',
        params: { app: 'Terminal' },
        skippable: true,
      },
      {
        critical: true,
        description: `cd into the project directory at ${projectPath}.`,
        kind: 'change_directory',
        label: `Change directory to project root`,
        params: { path: projectPath },
      },
      {
        critical: true,
        description: `Execute "${testCommand}" and capture output.`,
        kind: 'run_command',
        label: 'Run test suite',
        params: { command: testCommand, timeoutMs: 120_000 },
      },
      {
        description: 'Check the exit code and output of the test command to determine pass/fail.',
        kind: 'evaluate',
        label: 'Evaluate test results',
        params: {},
      },
      {
        description: 'Produce a human-readable summary of test results including failures.',
        kind: 'summarize',
        label: 'Summarize results',
        params: {},
      },
    ],
  }
}

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
    id: 'dev_run_tests',
    name: 'Run project tests and summarize results',
    description: `Open the project at "${projectPath}", run "${testCommand}", and produce a summary of pass/fail results.`,
    maxRetries: 3,
    steps: [
      {
        label: 'Ensure Terminal is available',
        kind: 'ensure_app',
        description: 'Make sure Terminal (or the configured shell host) is open.',
        params: { app: 'Terminal' },
        skippable: true,
      },
      {
        label: `Change directory to project root`,
        kind: 'change_directory',
        description: `cd into the project directory at ${projectPath}.`,
        params: { path: projectPath },
        critical: true,
      },
      {
        label: 'Run test suite',
        kind: 'run_command',
        description: `Execute "${testCommand}" and capture output.`,
        params: { command: testCommand, timeoutMs: 120_000 },
        critical: true,
      },
      {
        label: 'Evaluate test results',
        kind: 'evaluate',
        description: 'Check the exit code and output of the test command to determine pass/fail.',
        params: {},
      },
      {
        label: 'Summarize results',
        kind: 'summarize',
        description: 'Produce a human-readable summary of test results including failures.',
        params: {},
      },
    ],
  }
}

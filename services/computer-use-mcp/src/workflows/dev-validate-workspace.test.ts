import { describe, expect, it } from 'vitest'

import { createDevValidateWorkspaceWorkflow } from './dev-validate-workspace'

describe('createDevValidateWorkspaceWorkflow', () => {
  it('opens the workspace, inspects changes, and runs validation from the project cwd', () => {
    const workflow = createDevValidateWorkspaceWorkflow({
      projectPath: '/tmp/workspace',
      ideApp: 'VS Code',
      changesCommand: 'git diff --stat',
      checkCommand: 'pnpm typecheck',
    })

    expect(workflow.id).toBe('dev_validate_workspace')
    expect(workflow.steps.map(step => step.label)).toEqual([
      'Reveal project in Finder',
      'Focus Finder',
      'Open project in Visual Studio Code',
      'Focus Visual Studio Code',
      'Confirm project working directory',
      'Inspect local changes',
      'Run workspace validation',
      'Summarize workspace validation',
    ])

    expect(workflow.steps[4]?.params?.command).toBe('pwd')
    expect(workflow.steps[5]?.params?.command).toBe('git diff --stat')
    expect(workflow.steps[6]?.params?.command).toBe('pnpm typecheck')
    expect(workflow.steps[6]?.params?.cwd).toBe('/tmp/workspace')
  })
})

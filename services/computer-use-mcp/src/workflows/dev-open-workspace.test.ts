import { describe, expect, it } from 'vitest'

import { createDevOpenWorkspaceWorkflow } from './dev-open-workspace'

describe('createDevOpenWorkspaceWorkflow', () => {
  it('builds a fallback open command for VS Code launch name variants', () => {
    const workflow = createDevOpenWorkspaceWorkflow({
      projectPath: '/tmp/workspace',
      ideApp: 'VS Code',
    })

    const openStep = workflow.steps[2]
    expect(openStep?.kind).toBe('run_command')
    expect(openStep?.params?.command).toContain('open -a "Visual Studio Code" .')
    expect(openStep?.params?.command).toContain('open -a "Visual Studio Code for mac" .')
    expect(openStep?.params?.command).toContain('||')
  })
})

import { describe, expect, it } from 'vitest'

import {
  appendMcpOutput,
  appendSerenaOutput,
  approveTasksArtifact,
  createSubagentJob,
  createSubagentJobStore,
  SubagentJobLifecycleError,
  SubagentJobPolicyError,
  transitionSubagentJob,
} from './index'

describe('subagent job model', () => {
  it('creates research jobs during requirements and design phases', () => {
    const store = createSubagentJobStore()

    const requirements = createSubagentJob(store, {
      phase: 'requirements',
      taskDescription: 'Find relevant user goals',
      inputs: [{ kind: 'prompt', value: 'research requirements' }],
    })

    const design = createSubagentJob(requirements.store, {
      phase: 'design',
      taskDescription: 'Compare implementation options',
      inputs: [{ kind: 'prompt', value: 'research design' }],
    })

    expect(requirements.job.engine).toBe('native')
    expect(requirements.job.status).toBe('queued')
    expect(design.job.status).toBe('queued')
    expect(Object.keys(design.store.jobs)).toEqual(['job-1', 'job-2'])
  })

  it('supports lifecycle transitions and rejects terminal-state transitions', () => {
    const created = createSubagentJob(createSubagentJobStore(), {
      phase: 'requirements',
      taskDescription: 'Summarize existing docs',
    })

    const running = transitionSubagentJob(created.store, created.jobId, 'running')
    const completed = transitionSubagentJob(running.store, created.jobId, 'completed', {
      output: { kind: 'summary', value: 'Requirements context collected' },
    })

    expect(completed.job.status).toBe('completed')
    expect(completed.job.outputs).toEqual([{ kind: 'summary', value: 'Requirements context collected' }])
    expect(() => transitionSubagentJob(completed.store, created.jobId, 'running')).toThrow(SubagentJobLifecycleError)
  })

  it('blocks implementation jobs before approved tasks.md exists', () => {
    const created = createSubagentJob(createSubagentJobStore(), {
      phase: 'implementation',
      taskDescription: 'Implement T-001',
      inputs: [{ kind: 'task-id', value: 'T-001' }],
    })

    expect(created.job.status).toBe('blocked')
    expect(created.job.provenance).toContainEqual({
      source: 'agent',
      reference: 'policy:tasks-md-approval',
      metadata: {
        reason: 'implementation jobs require approved tasks.md',
      },
    })
    expect(() => transitionSubagentJob(created.store, created.jobId, 'running')).toThrow(SubagentJobLifecycleError)
  })

  it('allows implementation jobs after tasks.md approval', () => {
    const store = approveTasksArtifact(createSubagentJobStore())

    const created = createSubagentJob(store, {
      phase: 'implementation',
      taskDescription: 'Implement T-001',
      inputs: [{ kind: 'task-id', value: 'T-001' }],
    })

    expect(created.job.status).toBe('queued')
    expect(transitionSubagentJob(created.store, created.jobId, 'running').job.status).toBe('running')
  })

  it('rejects reserved ACP engines in v1', () => {
    const store = createSubagentJobStore()

    expect(() =>
      createSubagentJob(store, {
        phase: 'requirements',
        taskDescription: 'Research with Pi',
        engine: 'acp:pi',
      }),
    ).toThrow(SubagentJobPolicyError)

    expect(() =>
      createSubagentJob(store, {
        phase: 'requirements',
        taskDescription: 'Research with Codex ACP',
        engine: 'acp:codex',
      }),
    ).toThrow(SubagentJobPolicyError)
    expect(store.jobs).toEqual({})
  })

  it('attaches MCP and Serena provenance to job outputs', () => {
    const created = createSubagentJob(createSubagentJobStore(), {
      phase: 'design',
      taskDescription: 'Inspect symbol references',
    })

    const mcp = appendMcpOutput(created.store, created.jobId, {
      output: {
        kind: 'ranked-context',
        label: 'MCP context',
        value: [{ filePath: 'src/example.ts' }],
      },
      serverName: 'generic-mcp',
      toolName: 'workspace_search_pattern',
      query: { pattern: 'SubagentJobRecord' },
    })

    const serena = appendSerenaOutput(mcp.store, created.jobId, {
      output: {
        kind: 'references',
        label: 'Serena references',
        value: [{ symbol: 'SubagentJobRecord' }],
      },
      serverName: 'serena',
      toolName: 'find_referencing_symbols',
      query: { namePath: 'SubagentJobRecord' },
    })

    expect(serena.job.outputs).toHaveLength(2)
    expect(serena.job.provenance).toEqual([
      {
        source: 'mcp',
        backend: 'available',
        serverName: 'generic-mcp',
        toolName: 'workspace_search_pattern',
        metadata: { query: { pattern: 'SubagentJobRecord' } },
      },
      {
        source: 'serena',
        backend: 'serena',
        serverName: 'serena',
        toolName: 'find_referencing_symbols',
        metadata: { query: { namePath: 'SubagentJobRecord' } },
      },
    ])
  })
})

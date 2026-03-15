import { describe, expect, it } from 'vitest'

import {
  applyGraphToSession,
  buildPlanGraphFromSession,
  computePlanFrontier,
  decideNextPlannerNode,
  insertMissedDependencyNode,
  markCheckpointOutcome,
  promoteNodeRunning,
  recoverNeedsReplanNode,
  validatePlanGraphInvariants,
} from './planner-graph'

function createSession() {
  return {
    id: 'session_graph_test',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'active' as const,
    amendCount: 0,
    backtrackCount: 0,
    maxAmendCount: 2 as const,
    maxBacktrackCount: 1 as const,
    maxFiles: 3 as const,
    changeIntent: 'behavior_fix' as const,
    steps: [
      {
        filePath: 'src/a.ts',
        intent: 'behavior_fix' as const,
        source: 'target_selection' as const,
        status: 'ready' as const,
        dependsOn: [],
        checkpoint: 'none' as const,
      },
      {
        filePath: 'src/c.ts',
        intent: 'behavior_fix' as const,
        source: 'search' as const,
        status: 'blocked_by_dependency' as const,
        dependsOn: ['src/a.ts'],
        checkpoint: 'validation_required_before_next' as const,
      },
    ],
    reason: 'graph test',
  }
}

describe('planner-graph', () => {
  it('builds task/subtask/file hierarchy while preserving file-level session semantics', () => {
    const session = createSession()
    const graph = buildPlanGraphFromSession(session)

    expect(graph.taskNodes).toHaveLength(1)
    expect(graph.taskNodes[0]?.layer).toBe('task')
    expect(graph.subtaskNodes).toHaveLength(session.steps.length)
    expect(graph.subtaskNodes.every(node => node.layer === 'subtask')).toBe(true)
    expect(graph.nodes).toHaveLength(session.steps.length)

    const projected = applyGraphToSession(session, graph)
    expect(projected.steps).toHaveLength(session.steps.length)
    expect(projected.steps[0]?.filePath).toBe('src/a.ts')
    expect(projected.steps[0]?.status).toBe('ready')
    expect(projected.steps[1]?.filePath).toBe('src/c.ts')
    expect(projected.steps[1]?.status).toBe('blocked_by_dependency')
    expect(projected.steps[1]?.dependsOn).toEqual(['src/a.ts'])
  })

  it('computes frontier with dependency-gated nodes', () => {
    const graph = buildPlanGraphFromSession(createSession())
    const frontier = computePlanFrontier(graph)

    expect(frontier.activeTaskNodeId).toBe('task:session_graph_test')
    expect(frontier.readySubtaskIds).toContain('subtask:src/a.ts')
    expect(frontier.blockedSubtaskIds).toContain('subtask:src/c.ts')
    expect(frontier.readyNodeIds).toContain('node:src/a.ts')
    expect(frontier.blockedNodeIds).toContain('node:src/c.ts')
    expect(frontier.blockedReasons.some(reason => reason.nodeId === 'node:src/c.ts')).toBe(true)
  })

  it('emits why-not runner-up explanation for layered decision bundle', () => {
    const graph = buildPlanGraphFromSession(createSession())
    const decision = decideNextPlannerNode({
      graph,
      changeIntent: 'behavior_fix',
    })

    expect(decision.decision).toBeDefined()
    expect(decision.decision?.whyNotRunnerUp).toBeDefined()
    expect((decision.decision?.whyNotRunnerUp?.explanation || '').length).toBeGreaterThan(0)
  })

  it('rewires edges after inserting missed dependency node', () => {
    const session = createSession()
    const graph = buildPlanGraphFromSession(session)
    const insertion = insertMissedDependencyNode({
      graph,
      currentFilePath: 'src/a.ts',
      dependencyFilePath: 'src/b.ts',
      intent: 'behavior_fix',
      source: 'search',
    })

    expect(insertion.ok).toBe(true)
    if (!insertion.ok) {
      return
    }

    const dependencyNode = insertion.graph.nodes.find(node => node.filePath === 'src/b.ts')
    const downstreamNode = insertion.graph.nodes.find(node => node.filePath === 'src/c.ts')

    expect(dependencyNode?.dependsOn).toContain('node:src/a.ts')
    expect(downstreamNode?.dependsOn).toContain('node:src/b.ts')
    expect(downstreamNode?.dependsOn).not.toContain('node:src/a.ts')

    const dependencySubtaskNode = insertion.graph.subtaskNodes.find(node => node.filePath === 'src/b.ts')
    expect(dependencySubtaskNode?.fileNodeId).toBe('node:src/b.ts')

    const projected = applyGraphToSession(session, insertion.graph)
    expect(projected.steps.some(step => step.filePath === 'src/b.ts')).toBe(true)
    const projectedDownstream = projected.steps.find(step => step.filePath === 'src/c.ts')
    expect(projectedDownstream?.dependsOn).toEqual(['src/b.ts'])
  })

  it('marks node as needs_replan when checkpoint fails', () => {
    const base = buildPlanGraphFromSession(createSession())
    const withRunning = promoteNodeRunning({ graph: base, filePath: 'src/a.ts' })
    const failed = markCheckpointOutcome({
      graph: withRunning,
      filePath: 'src/a.ts',
      passed: false,
    })

    expect(failed.nodes.find(node => node.filePath === 'src/a.ts')?.status).toBe('needs_replan')
  })

  it('recovers needs_replan node back to ready/running flow', () => {
    const base = buildPlanGraphFromSession(createSession())
    const withFailure = markCheckpointOutcome({
      graph: base,
      filePath: 'src/a.ts',
      passed: false,
    })

    const recovered = recoverNeedsReplanNode({
      graph: withFailure,
      filePath: 'src/a.ts',
    })
    expect(recovered.nodes.find(node => node.filePath === 'src/a.ts')?.status).toBe('ready')

    const running = promoteNodeRunning({ graph: recovered, filePath: 'src/a.ts' })
    expect(running.nodes.find(node => node.filePath === 'src/a.ts')?.status).toBe('running')
  })

  it('rejects dependency insert when maxNodes budget is exhausted', () => {
    const session = createSession() as any
    session.maxFiles = 1
    session.steps = [session.steps[0]!]

    const graph = buildPlanGraphFromSession(session)
    const insertion = insertMissedDependencyNode({
      graph,
      currentFilePath: 'src/a.ts',
      dependencyFilePath: 'src/b.ts',
      intent: 'behavior_fix',
      source: 'search',
    })

    expect(insertion.ok).toBe(false)
    if (!insertion.ok) {
      const reason = 'reason' in insertion ? insertion.reason : ''
      expect(reason).toContain('max_nodes_exhausted')
    }
  })

  it('validates a clean graph as invariant-safe', () => {
    const graph = buildPlanGraphFromSession(createSession())
    const validation = validatePlanGraphInvariants(graph)
    expect(validation.ok).toBe(true)
  })

  it('detects duplicate node filePath and edge drift invariants', () => {
    const graph = buildPlanGraphFromSession(createSession())
    const broken = {
      ...graph,
      nodes: [
        ...graph.nodes,
        {
          ...graph.nodes[0]!,
          id: 'node:src/dup.ts',
          filePath: graph.nodes[0]!.filePath,
          order: 99,
        },
      ],
      edges: graph.edges.filter(edge => edge.relation !== 'task_contains_subtask'),
    }

    const validation = validatePlanGraphInvariants(broken as any)
    expect(validation.ok).toBe(false)
    if (!('issues' in validation)) {
      return
    }
    const issues = validation.issues

    expect(issues.some(issue => issue.code === 'duplicate_node_file_path')).toBe(true)
    expect(issues.some(issue => issue.code === 'edge_drift')).toBe(true)
  })

  it('detects self dependency and running node conflicts', () => {
    const graph = buildPlanGraphFromSession(createSession())
    const broken = {
      ...graph,
      nodes: graph.nodes.map((node, index) => {
        if (index === 0) {
          return {
            ...node,
            status: 'running',
            dependsOn: [node.id],
          }
        }

        if (index === 1) {
          return {
            ...node,
            status: 'running',
          }
        }

        return node
      }),
    }

    const validation = validatePlanGraphInvariants(broken as any)
    expect(validation.ok).toBe(false)
    if (!('issues' in validation)) {
      return
    }
    const issues = validation.issues

    expect(issues.some(issue => issue.code === 'self_dependency')).toBe(true)
    expect(issues.some(issue => issue.code === 'running_node_conflict')).toBe(true)
  })
})

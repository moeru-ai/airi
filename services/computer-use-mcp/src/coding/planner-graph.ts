import type {
  CodingChangeIntent,
  CodingPlanDraft,
  CodingPlanEdge,
  CodingPlanFrontier,
  CodingPlanGraph,
  CodingPlannerCandidateScore,
  CodingPlannerDecision,
  CodingPlanNode,
  CodingPlanNodeStatus,
  CodingPlanSession,
  CodingPlanSessionStep,
  CodingPlanSubtaskNode,
  CodingPlanTaskNode,
} from '../state'

function stepStatusToNodeStatus(status: CodingPlanSessionStep['status']): CodingPlanNodeStatus {
  switch (status) {
    case 'blocked_by_dependency':
      return 'blocked'
    case 'in_progress':
      return 'running'
    case 'awaiting_checkpoint':
      return 'awaiting_checkpoint'
    case 'validated':
      return 'validated'
    case 'needs_replan':
      return 'needs_replan'
    case 'abandoned':
      return 'aborted'
    case 'ready':
    default:
      return 'ready'
  }
}

function nodeStatusToStepStatus(status: CodingPlanNodeStatus): CodingPlanSessionStep['status'] {
  switch (status) {
    case 'blocked':
      return 'blocked_by_dependency'
    case 'running':
      return 'in_progress'
    case 'awaiting_checkpoint':
      return 'awaiting_checkpoint'
    case 'validated':
      return 'validated'
    case 'needs_replan':
      return 'needs_replan'
    case 'aborted':
      return 'abandoned'
    case 'ready':
    default:
      return 'ready'
  }
}

function nodeIdForFilePath(filePath: string) {
  return `node:${filePath.replace(/\\/g, '/')}`
}

function subtaskIdForFilePath(filePath: string) {
  return `subtask:${filePath.replace(/\\/g, '/')}`
}

function taskIdForSession(sessionId: string) {
  return `task:${sessionId}`
}

function isTestLikePath(filePath: string) {
  const normalized = filePath.toLowerCase()
  return normalized.includes('__tests__')
    || normalized.includes('/test/')
    || normalized.includes('/tests/')
    || normalized.endsWith('.test.ts')
    || normalized.endsWith('.test.tsx')
    || normalized.endsWith('.test.js')
    || normalized.endsWith('.test.jsx')
    || normalized.endsWith('.spec.ts')
    || normalized.endsWith('.spec.tsx')
    || normalized.endsWith('.spec.js')
    || normalized.endsWith('.spec.jsx')
}

function cloneGraph(graph: CodingPlanGraph): CodingPlanGraph {
  return {
    ...graph,
    amendBudget: { ...graph.amendBudget },
    backtrackBudget: { ...graph.backtrackBudget },
    taskNodes: graph.taskNodes.map(taskNode => ({ ...taskNode })),
    subtaskNodes: graph.subtaskNodes.map(subtaskNode => ({ ...subtaskNode })),
    nodes: graph.nodes.map(node => ({ ...node, dependsOn: [...node.dependsOn] })),
    edges: graph.edges.map(edge => ({ ...edge })),
  }
}

function buildGraphEdges(graph: Pick<CodingPlanGraph, 'taskNodes' | 'subtaskNodes' | 'nodes'>): CodingPlanEdge[] {
  const dependencyEdges: CodingPlanEdge[] = graph.nodes.flatMap((node) => {
    return node.dependsOn.map(depId => ({
      from: depId,
      to: node.id,
      relation: 'depends_on' as const,
    }))
  })

  const taskHierarchyEdges: CodingPlanEdge[] = graph.subtaskNodes.map(subtaskNode => ({
    from: subtaskNode.parentTaskId,
    to: subtaskNode.id,
    relation: 'task_contains_subtask' as const,
  }))

  const subtaskToFileEdges: CodingPlanEdge[] = graph.subtaskNodes.map(subtaskNode => ({
    from: subtaskNode.id,
    to: subtaskNode.fileNodeId,
    relation: 'subtask_targets_file' as const,
  }))

  return [...dependencyEdges, ...taskHierarchyEdges, ...subtaskToFileEdges]
}

function syncSubtaskStatuses(graph: CodingPlanGraph): CodingPlanGraph {
  const next = cloneGraph(graph)
  const fileNodeById = new Map(next.nodes.map(node => [node.id, node]))

  next.subtaskNodes = next.subtaskNodes.map((subtaskNode) => {
    const fileNode = fileNodeById.get(subtaskNode.fileNodeId)
    if (!fileNode) {
      return {
        ...subtaskNode,
        status: 'blocked',
      }
    }

    return {
      ...subtaskNode,
      status: fileNode.status,
    }
  })

  return next
}

function dependenciesValidated(graph: CodingPlanGraph, node: CodingPlanNode) {
  if (node.dependsOn.length === 0) {
    return true
  }

  const nodeById = new Map(graph.nodes.map(item => [item.id, item]))
  return node.dependsOn.every((depId) => {
    const depNode = nodeById.get(depId)
    return depNode?.status === 'validated'
  })
}

function refreshNodeStatuses(graph: CodingPlanGraph): CodingPlanGraph {
  const next = cloneGraph(graph)
  const nodeById = new Map(next.nodes.map(node => [node.id, node]))

  for (const node of next.nodes) {
    if (node.status === 'validated' || node.status === 'needs_replan' || node.status === 'aborted') {
      continue
    }

    if (node.status === 'running') {
      continue
    }

    if (node.dependsOn.length === 0) {
      node.status = node.status === 'awaiting_checkpoint' ? 'awaiting_checkpoint' : 'ready'
      continue
    }

    const deps = node.dependsOn
      .map(depId => nodeById.get(depId))
      .filter((dep): dep is CodingPlanNode => Boolean(dep))

    if (deps.length !== node.dependsOn.length) {
      node.status = 'blocked'
      continue
    }

    if (deps.some(dep => dep.status === 'needs_replan' || dep.status === 'aborted')) {
      node.status = 'blocked'
      continue
    }

    if (deps.some(dep => dep.status !== 'validated')) {
      node.status = 'blocked'
      continue
    }

    node.status = node.status === 'awaiting_checkpoint' ? 'awaiting_checkpoint' : 'ready'
  }

  return syncSubtaskStatuses(next)
}

function hasCycle(graph: CodingPlanGraph) {
  const nodeById = new Map(graph.nodes.map(node => [node.id, node]))
  const tempVisited = new Set<string>()
  const visited = new Set<string>()

  const visit = (nodeId: string): boolean => {
    if (visited.has(nodeId)) {
      return false
    }

    if (tempVisited.has(nodeId)) {
      return true
    }

    tempVisited.add(nodeId)
    const node = nodeById.get(nodeId)
    for (const depId of node?.dependsOn || []) {
      if (!nodeById.has(depId)) {
        continue
      }

      if (visit(depId)) {
        return true
      }
    }

    tempVisited.delete(nodeId)
    visited.add(nodeId)
    return false
  }

  return graph.nodes.some(node => visit(node.id))
}

export type CodingPlanGraphInvariantCode
  = | 'max_nodes_exceeds_hard_limit'
    | 'node_budget_exhausted'
    | 'duplicate_node_id'
    | 'duplicate_node_file_path'
    | 'duplicate_node_order'
    | 'missing_task_node'
    | 'duplicate_task_node_id'
    | 'duplicate_subtask_id'
    | 'subtask_missing_parent_task'
    | 'subtask_missing_file_node'
    | 'subtask_count_mismatch'
    | 'invalid_dep_reference'
    | 'self_dependency'
    | 'duplicate_dependency'
    | 'running_node_conflict'
    | 'edge_drift'
    | 'cycle_detected'

export interface CodingPlanGraphInvariantIssue {
  code: CodingPlanGraphInvariantCode
  message: string
  detail?: string
}

export function validatePlanGraphInvariants(graph: CodingPlanGraph): {
  ok: true
} | {
  ok: false
  issues: CodingPlanGraphInvariantIssue[]
} {
  const issues: CodingPlanGraphInvariantIssue[] = []

  const taskNodes = Array.isArray((graph as Partial<CodingPlanGraph>).taskNodes)
    ? graph.taskNodes
    : []
  const subtaskNodes = Array.isArray((graph as Partial<CodingPlanGraph>).subtaskNodes)
    ? graph.subtaskNodes
    : []
  const nodes = Array.isArray((graph as Partial<CodingPlanGraph>).nodes)
    ? graph.nodes
    : []
  const edges = Array.isArray((graph as Partial<CodingPlanGraph>).edges)
    ? graph.edges
    : []
  const maxNodes = Number.isFinite(graph.maxNodes) ? graph.maxNodes : 0
  const maxNodesHardLimit = Number.isFinite(graph.maxNodesHardLimit) ? graph.maxNodesHardLimit : 0

  if (maxNodes > maxNodesHardLimit) {
    issues.push({
      code: 'max_nodes_exceeds_hard_limit',
      message: `graph.maxNodes=${maxNodes} exceeds hard limit=${maxNodesHardLimit}.`,
    })
  }

  if (nodes.length > maxNodes || nodes.length > maxNodesHardLimit) {
    issues.push({
      code: 'node_budget_exhausted',
      message: `graph has ${nodes.length} nodes, budget=${maxNodes}, hard=${maxNodesHardLimit}.`,
    })
  }

  if (taskNodes.length === 0) {
    issues.push({
      code: 'missing_task_node',
      message: 'graph.taskNodes must contain at least one task node.',
    })
  }

  const duplicateTaskNodeIds = taskNodes
    .map(node => node.id)
    .filter((id, index, array) => array.indexOf(id) !== index)
  for (const duplicateId of new Set(duplicateTaskNodeIds)) {
    issues.push({
      code: 'duplicate_task_node_id',
      message: `duplicate task node id detected: ${duplicateId}`,
      detail: duplicateId,
    })
  }

  const nodeIds = nodes.map(node => node.id)
  const duplicateNodeIds = nodeIds.filter((id, index, array) => array.indexOf(id) !== index)
  for (const duplicateId of new Set(duplicateNodeIds)) {
    issues.push({
      code: 'duplicate_node_id',
      message: `duplicate node id detected: ${duplicateId}`,
      detail: duplicateId,
    })
  }

  const nodeFilePaths = nodes.map(node => node.filePath)
  const duplicateNodeFilePaths = nodeFilePaths.filter((filePath, index, array) => array.indexOf(filePath) !== index)
  for (const duplicatePath of new Set(duplicateNodeFilePaths)) {
    issues.push({
      code: 'duplicate_node_file_path',
      message: `duplicate node filePath detected: ${duplicatePath}`,
      detail: duplicatePath,
    })
  }

  const nodeOrders = nodes.map(node => node.order)
  const duplicateNodeOrders = nodeOrders.filter((order, index, array) => array.indexOf(order) !== index)
  for (const duplicateOrder of new Set(duplicateNodeOrders)) {
    issues.push({
      code: 'duplicate_node_order',
      message: `duplicate node order detected: ${duplicateOrder}`,
      detail: String(duplicateOrder),
    })
  }

  const subtaskIds = subtaskNodes.map(node => node.id)
  const duplicateSubtaskIds = subtaskIds.filter((id, index, array) => array.indexOf(id) !== index)
  for (const duplicateId of new Set(duplicateSubtaskIds)) {
    issues.push({
      code: 'duplicate_subtask_id',
      message: `duplicate subtask id detected: ${duplicateId}`,
      detail: duplicateId,
    })
  }

  const nodeById = new Map(nodes.map(node => [node.id, node]))
  const taskIdSet = new Set(taskNodes.map(taskNode => taskNode.id))

  for (const subtaskNode of subtaskNodes) {
    if (!taskIdSet.has(subtaskNode.parentTaskId)) {
      issues.push({
        code: 'subtask_missing_parent_task',
        message: `subtask ${subtaskNode.id} references missing parentTaskId=${subtaskNode.parentTaskId}.`,
        detail: subtaskNode.id,
      })
    }

    if (!nodeById.has(subtaskNode.fileNodeId)) {
      issues.push({
        code: 'subtask_missing_file_node',
        message: `subtask ${subtaskNode.id} references missing fileNodeId=${subtaskNode.fileNodeId}.`,
        detail: subtaskNode.id,
      })
    }
  }

  if (subtaskNodes.length !== nodes.length) {
    issues.push({
      code: 'subtask_count_mismatch',
      message: `subtask count (${subtaskNodes.length}) must match file node count (${nodes.length}).`,
    })
  }

  for (const node of nodes) {
    const dependencySet = new Set<string>()
    for (const depId of node.dependsOn) {
      if (depId === node.id) {
        issues.push({
          code: 'self_dependency',
          message: `node ${node.id} cannot depend on itself.`,
          detail: node.id,
        })
      }

      if (!nodeById.has(depId)) {
        issues.push({
          code: 'invalid_dep_reference',
          message: `node ${node.id} has missing dependency ${depId}.`,
          detail: `${node.id}->${depId}`,
        })
      }

      if (dependencySet.has(depId)) {
        issues.push({
          code: 'duplicate_dependency',
          message: `node ${node.id} has duplicate dependency ${depId}.`,
          detail: `${node.id}->${depId}`,
        })
      }

      dependencySet.add(depId)
    }
  }

  const runningNodes = nodes.filter(node => node.status === 'running')
  if (runningNodes.length > 1) {
    issues.push({
      code: 'running_node_conflict',
      message: `multiple running nodes detected: ${runningNodes.map(node => node.filePath).join(', ')}`,
    })
  }

  const edgeKey = (edge: CodingPlanEdge) => `${edge.from}->${edge.to}#${edge.relation}`
  const expectedEdges = buildGraphEdges({
    taskNodes,
    subtaskNodes,
    nodes,
  })
  const expectedEdgeSet = new Set(expectedEdges.map(edgeKey))
  const actualEdgeSet = new Set(edges.map(edgeKey))
  const missingEdges = [...expectedEdgeSet].filter(key => !actualEdgeSet.has(key))
  const staleEdges = [...actualEdgeSet].filter(key => !expectedEdgeSet.has(key))
  if (missingEdges.length > 0 || staleEdges.length > 0) {
    issues.push({
      code: 'edge_drift',
      message: `edge drift detected (missing=${missingEdges.length}, stale=${staleEdges.length}).`,
      detail: [...missingEdges.slice(0, 5), ...staleEdges.slice(0, 5)].join(', '),
    })
  }

  if (hasCycle({
    ...graph,
    taskNodes,
    subtaskNodes,
    nodes,
    edges,
  })) {
    issues.push({
      code: 'cycle_detected',
      message: 'dependency cycle detected in plan graph.',
    })
  }

  if (issues.length === 0) {
    return { ok: true }
  }

  return {
    ok: false,
    issues,
  }
}

export function buildPlanGraphFromSession(session: CodingPlanSession): CodingPlanGraph {
  const maxNodes = Math.min(Math.max(session.maxFiles, 1), 3)
  const taskNode: CodingPlanTaskNode = {
    id: taskIdForSession(session.id),
    layer: 'task',
    sessionId: session.id,
    title: session.reason || `Task ${session.id}`,
    changeIntent: session.changeIntent,
    maxFiles: session.maxFiles,
    status: session.status === 'completed'
      ? 'completed'
      : session.status === 'aborted'
        ? 'aborted'
        : 'active',
  }

  const nodes: CodingPlanNode[] = session.steps.map((step, index) => ({
    id: nodeIdForFilePath(step.filePath),
    filePath: step.filePath,
    intent: step.intent,
    source: step.source,
    status: stepStatusToNodeStatus(step.status),
    checkpoint: step.checkpoint || 'none',
    dependsOn: (step.dependsOn || []).map(dep => nodeIdForFilePath(dep)),
    order: index,
  }))

  const subtaskNodes: CodingPlanSubtaskNode[] = nodes.map((node) => {
    const sourceStep = session.steps.find(step => step.filePath === node.filePath)

    return {
      id: subtaskIdForFilePath(node.filePath),
      layer: 'subtask',
      parentTaskId: taskNode.id,
      fileNodeId: node.id,
      filePath: node.filePath,
      title: sourceStep?.intent
        ? `${sourceStep.intent}:${node.filePath}`
        : `edit:${node.filePath}`,
      intent: sourceStep?.intent || session.changeIntent,
      status: node.status,
      order: node.order,
    }
  })

  return refreshNodeStatuses({
    version: 1,
    sessionId: session.id,
    generatedAt: new Date().toISOString(),
    maxNodes,
    maxNodesHardLimit: 5,
    amendBudget: {
      limit: session.maxAmendCount,
      used: session.amendCount,
    },
    backtrackBudget: {
      limit: session.maxBacktrackCount,
      used: session.backtrackCount,
    },
    taskNodes: [taskNode],
    subtaskNodes,
    nodes,
    edges: buildGraphEdges({
      taskNodes: [taskNode],
      subtaskNodes,
      nodes,
    }),
  })
}

export function applyGraphToSession(session: CodingPlanSession, graph: CodingPlanGraph): CodingPlanSession {
  const stepByPath = new Map(session.steps.map(step => [step.filePath, step]))
  const graphOrderedNodes = [...graph.nodes].sort((left, right) => left.order - right.order)

  const graphBackedSteps: CodingPlanSession['steps'] = graphOrderedNodes.map((node) => {
    const existingStep = stepByPath.get(node.filePath)
    const dependsOn = node.dependsOn
      .map(depId => graph.nodes.find(item => item.id === depId)?.filePath)
      .filter((dep): dep is string => Boolean(dep))

    if (!existingStep) {
      return {
        filePath: node.filePath,
        intent: node.intent,
        source: node.source,
        status: nodeStatusToStepStatus(node.status),
        dependsOn,
        checkpoint: node.checkpoint,
      }
    }

    return {
      ...existingStep,
      status: nodeStatusToStepStatus(node.status),
      dependsOn,
      checkpoint: node.checkpoint,
    }
  })

  return {
    ...session,
    updatedAt: new Date().toISOString(),
    steps: graphBackedSteps,
  }
}

export function computePlanFrontier(graph: CodingPlanGraph): CodingPlanFrontier {
  const refreshed = refreshNodeStatuses(graph)
  const readyNodeIds: string[] = []
  const blockedNodeIds: string[] = []
  const readySubtaskIds: string[] = []
  const blockedSubtaskIds: string[] = []
  const blockedReasons: CodingPlanFrontier['blockedReasons'] = []
  const nodeById = new Map(refreshed.nodes.map(node => [node.id, node]))
  const subtaskByFileNodeId = new Map(refreshed.subtaskNodes.map(subtaskNode => [subtaskNode.fileNodeId, subtaskNode]))

  for (const node of refreshed.nodes) {
    const boundSubtask = subtaskByFileNodeId.get(node.id)

    if (node.status === 'ready' || node.status === 'running') {
      if (dependenciesValidated(refreshed, node)) {
        readyNodeIds.push(node.id)
        if (boundSubtask) {
          readySubtaskIds.push(boundSubtask.id)
        }
      }
      else {
        blockedNodeIds.push(node.id)
        if (boundSubtask) {
          blockedSubtaskIds.push(boundSubtask.id)
        }
        blockedReasons.push({
          nodeId: node.id,
          reason: 'dependency_not_validated',
          details: [...node.dependsOn],
        })
      }
      continue
    }

    if (node.status === 'validated') {
      continue
    }

    blockedNodeIds.push(node.id)
    if (boundSubtask) {
      blockedSubtaskIds.push(boundSubtask.id)
    }

    if (node.status === 'awaiting_checkpoint') {
      blockedReasons.push({
        nodeId: node.id,
        reason: 'checkpoint_pending',
        details: [node.checkpoint],
      })
      continue
    }

    if (node.status === 'blocked') {
      blockedReasons.push({
        nodeId: node.id,
        reason: 'dependency_not_validated',
        details: node.dependsOn
          .map((depId) => {
            const dep = nodeById.get(depId)
            return `${dep?.filePath || depId}:${dep?.status || 'missing'}`
          }),
      })
      continue
    }

    blockedReasons.push({
      nodeId: node.id,
      reason: 'node_not_ready',
      details: [node.status],
    })
  }

  return {
    generatedAt: new Date().toISOString(),
    activeTaskNodeId: refreshed.taskNodes.find(taskNode => taskNode.status === 'active')?.id,
    readySubtaskIds,
    blockedSubtaskIds,
    readyNodeIds,
    blockedNodeIds,
    blockedReasons,
  }
}

export function scorePlanFrontier(params: {
  graph: CodingPlanGraph
  frontier: CodingPlanFrontier
  changeIntent: CodingChangeIntent
  previousStatuses?: Record<string, CodingPlanNodeStatus>
  lastSelectionFile?: string
  companionFiles?: string[]
  scopedValidationFilePath?: string
  preferredFilePath?: string
}): Array<CodingPlannerCandidateScore & { nodeId: string }> {
  const {
    graph,
    frontier,
    changeIntent,
    previousStatuses = {},
    lastSelectionFile,
    companionFiles = [],
    scopedValidationFilePath,
    preferredFilePath,
  } = params

  const companionSet = new Set(companionFiles)
  const nodeById = new Map(graph.nodes.map(node => [node.id, node]))
  const subtaskByFileNodeId = new Map(graph.subtaskNodes.map(subtaskNode => [subtaskNode.fileNodeId, subtaskNode]))
  const activeTaskNode = graph.taskNodes.find(taskNode => taskNode.status === 'active')
  const lastValidated = [...graph.nodes]
    .reverse()
    .find(node => node.status === 'validated')

  const ranked: Array<CodingPlannerCandidateScore & { nodeId: string, order: number, statusRank: number }> = []

  for (const nodeId of frontier.readyNodeIds) {
    const node = nodeById.get(nodeId)
    if (!node) {
      continue
    }

    if (!dependenciesValidated(graph, node)) {
      continue
    }

    const boundSubtask = subtaskByFileNodeId.get(node.id)

    const reasons: string[] = []
    let score = 0

    if (activeTaskNode) {
      score += 4
      reasons.push('active_task_scope(+4)')
    }

    if (boundSubtask) {
      score += 6
      reasons.push('subtask_bound(+6)')
      if (boundSubtask.status === 'ready' || boundSubtask.status === 'running') {
        score += 4
        reasons.push('subtask_ready(+4)')
      }
    }

    const running = node.status === 'running'
    if (running) {
      score += 100
      reasons.push('resume_current(+100)')
    }

    const recovered = previousStatuses[node.id] === 'needs_replan' && (node.status === 'ready' || node.status === 'running')
    if (recovered) {
      score += 80
      reasons.push('recovery_retry(+80)')
    }

    score += 40
    reasons.push('dependencies_satisfied(+40)')

    if (lastValidated && node.dependsOn.includes(lastValidated.id)) {
      score += 25
      reasons.push('follow_dependency_chain(+25)')
    }

    if (lastSelectionFile && node.filePath === lastSelectionFile) {
      score += 15
      reasons.push('matches_last_selection(+15)')
    }

    if (companionSet.has(node.filePath)) {
      score += 10
      reasons.push('impact_companion(+10)')
    }

    if (scopedValidationFilePath && scopedValidationFilePath === node.filePath) {
      score += 8
      reasons.push('scoped_validation_precise(+8)')
    }

    if (preferredFilePath && preferredFilePath === node.filePath) {
      score += 6
      reasons.push('preferred_file_hint(+6)')
    }

    if (isTestLikePath(node.filePath) && changeIntent !== 'test_fix') {
      score -= 10
      reasons.push('non_test_fix_penalty(-10)')
    }

    ranked.push({
      nodeId: node.id,
      filePath: node.filePath,
      status: running ? 'in_progress' : 'ready',
      score,
      reasons,
      order: node.order,
      statusRank: running ? 1 : 0,
    })
  }

  ranked.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score
    }

    if (right.statusRank !== left.statusRank) {
      return right.statusRank - left.statusRank
    }

    if (left.order !== right.order) {
      return left.order - right.order
    }

    return left.filePath.localeCompare(right.filePath)
  })

  return ranked.map(({ order: _order, statusRank: _statusRank, ...candidate }) => candidate)
}

export function decideNextPlannerNode(params: {
  graph: CodingPlanGraph
  changeIntent: CodingChangeIntent
  previousGraph?: CodingPlanGraph
  lastSelectionFile?: string
  companionFiles?: string[]
  scopedValidationFilePath?: string
  preferredFilePath?: string
}): {
  decision?: CodingPlannerDecision
  frontier: CodingPlanFrontier
} {
  const {
    graph,
    previousGraph,
    changeIntent,
    lastSelectionFile,
    companionFiles,
    scopedValidationFilePath,
    preferredFilePath,
  } = params

  const frontier = computePlanFrontier(graph)
  const previousStatuses = Object.fromEntries((previousGraph?.nodes || []).map(node => [node.id, node.status]))
  const candidateScores = scorePlanFrontier({
    graph,
    frontier,
    changeIntent,
    previousStatuses,
    lastSelectionFile,
    companionFiles,
    scopedValidationFilePath,
    preferredFilePath,
  })

  const selected = candidateScores[0]
  if (!selected) {
    return {
      decision: undefined,
      frontier,
    }
  }

  const selectionMode: CodingPlannerDecision['selectionMode'] = selected.status === 'in_progress'
    ? 'resume_current'
    : selected.reasons.some(reason => reason.includes('recovery_retry'))
      ? 'recovery_retry'
      : selected.reasons.some(reason => reason.includes('follow_dependency_chain'))
        ? 'follow_dependency_chain'
        : 'dependency_ready'

  const runnerUp = candidateScores[1]
  const whyNotRunnerUpExplanation = runnerUp
    ? `winner=${selected.filePath}(${selected.score}) beats runnerUp=${runnerUp.filePath}(${runnerUp.score}) via ${selected.reasons.join(', ')}; runnerUp_only=${runnerUp.reasons.filter(reason => !selected.reasons.includes(reason)).join(', ') || 'none'}.`
    : `winner=${selected.filePath}(${selected.score}) is the only executable layered candidate in current frontier.`

  return {
    decision: {
      selectedFile: selected.filePath,
      candidateScores: candidateScores.map(candidate => ({
        filePath: candidate.filePath,
        status: candidate.status,
        score: candidate.score,
        reasons: candidate.reasons,
      })),
      decisionReason: `Planner selected ${selected.filePath} via ${selectionMode}: ${selected.reasons.join(', ')}.`,
      selectionMode,
      whyNotRunnerUp: {
        winner: {
          filePath: selected.filePath,
          score: selected.score,
          reasons: selected.reasons,
        },
        runnerUp: runnerUp
          ? {
              filePath: runnerUp.filePath,
              score: runnerUp.score,
              reasons: runnerUp.reasons,
            }
          : undefined,
        explanation: whyNotRunnerUpExplanation,
      },
    },
    frontier,
  }
}

export function markCheckpointOutcome(params: {
  graph: CodingPlanGraph
  filePath: string
  passed: boolean
}): CodingPlanGraph {
  const next = cloneGraph(params.graph)
  const node = next.nodes.find(item => item.filePath === params.filePath)
  if (!node) {
    return next
  }

  node.status = params.passed ? 'validated' : 'needs_replan'
  return refreshNodeStatuses(next)
}

export function recoverNeedsReplanNode(params: {
  graph: CodingPlanGraph
  filePath: string
}): CodingPlanGraph {
  const next = cloneGraph(params.graph)
  const node = next.nodes.find(item => item.filePath === params.filePath)
  if (!node) {
    return next
  }

  if (node.status === 'needs_replan') {
    node.status = dependenciesValidated(next, node) ? 'ready' : 'blocked'
  }

  return refreshNodeStatuses(next)
}

export function insertMissedDependencyNode(params: {
  graph: CodingPlanGraph
  currentFilePath?: string
  dependencyFilePath: string
  intent: CodingChangeIntent
  source: CodingPlanNode['source']
}): {
  ok: true
  graph: CodingPlanGraph
} | {
  ok: false
  reason: string
} {
  const next = cloneGraph(params.graph)

  if (next.nodes.some(node => node.filePath === params.dependencyFilePath)) {
    return {
      ok: true,
      graph: refreshNodeStatuses(next),
    }
  }

  if (next.nodes.length >= next.maxNodes || next.nodes.length >= next.maxNodesHardLimit) {
    return {
      ok: false,
      reason: `max_nodes_exhausted:${next.nodes.length}/${next.maxNodes}`,
    }
  }

  const currentNode = params.currentFilePath
    ? next.nodes.find(node => node.filePath === params.currentFilePath)
    : undefined

  const dependencyNode: CodingPlanNode = {
    id: nodeIdForFilePath(params.dependencyFilePath),
    filePath: params.dependencyFilePath,
    intent: params.intent,
    source: params.source,
    status: currentNode ? 'blocked' : 'ready',
    checkpoint: 'validation_required_before_next',
    dependsOn: currentNode ? [currentNode.id] : [],
    order: next.nodes.length,
  }

  const parentTaskId = next.taskNodes[0]?.id || taskIdForSession(next.sessionId)
  const dependencySubtaskNode: CodingPlanSubtaskNode = {
    id: subtaskIdForFilePath(params.dependencyFilePath),
    layer: 'subtask',
    parentTaskId,
    fileNodeId: dependencyNode.id,
    filePath: dependencyNode.filePath,
    title: `${params.intent}:${dependencyNode.filePath}`,
    intent: params.intent,
    status: dependencyNode.status,
    order: dependencyNode.order,
  }

  if (currentNode) {
    const firstBlockedDependent = next.nodes
      .filter(node => node.dependsOn.includes(currentNode.id))
      .sort((a, b) => a.order - b.order)[0]

    const insertionOrder = typeof firstBlockedDependent?.order === 'number'
      ? firstBlockedDependent.order
      : currentNode.order + 1

    dependencyNode.order = insertionOrder
    for (const node of next.nodes) {
      if (node.order >= insertionOrder) {
        node.order += 1
      }
    }

    for (const node of next.nodes) {
      if (!node.dependsOn.includes(currentNode.id)) {
        continue
      }

      node.dependsOn = node.dependsOn.map(depId => depId === currentNode.id ? dependencyNode.id : depId)
    }
  }

  next.nodes.push(dependencyNode)
  next.subtaskNodes.push(dependencySubtaskNode)

  next.nodes.sort((a, b) => a.order - b.order)
  next.subtaskNodes = next.subtaskNodes
    .map((subtaskNode) => {
      const mappedNode = next.nodes.find(node => node.id === subtaskNode.fileNodeId)
      return {
        ...subtaskNode,
        order: mappedNode?.order ?? subtaskNode.order,
        status: mappedNode?.status ?? subtaskNode.status,
      }
    })
    .sort((a, b) => a.order - b.order)

  next.edges = buildGraphEdges(next)

  if (hasCycle(next)) {
    return {
      ok: false,
      reason: 'cycle_detected_after_dependency_insert',
    }
  }

  return {
    ok: true,
    graph: refreshNodeStatuses(next),
  }
}

export function promoteNodeRunning(params: {
  graph: CodingPlanGraph
  filePath: string
}): CodingPlanGraph {
  const next = refreshNodeStatuses(cloneGraph(params.graph))
  for (const node of next.nodes) {
    if (node.status === 'running' && node.filePath !== params.filePath) {
      node.status = dependenciesValidated(next, node) ? 'ready' : 'blocked'
    }
  }

  const selected = next.nodes.find(node => node.filePath === params.filePath)
  if (selected && (selected.status === 'ready' || selected.status === 'running')) {
    selected.status = 'running'
  }

  return refreshNodeStatuses(next)
}

export function buildPlanDraftFromGraph(params: {
  graph: CodingPlanGraph
  mode: 'initial' | 'replan'
  rationale: string
}): CodingPlanDraft {
  const nodes = [...params.graph.nodes]
    .sort((a, b) => a.order - b.order)
    .slice(0, 3)

  const fileByNodeId = new Map(nodes.map(node => [node.id, node.filePath]))

  return {
    generatedAt: new Date().toISOString(),
    mode: params.mode,
    nodes: nodes.map(node => ({
      filePath: node.filePath,
      dependsOn: node.dependsOn
        .map(depId => fileByNodeId.get(depId))
        .filter((dep): dep is string => Boolean(dep)),
      checkpoint: node.checkpoint,
      reason: `status=${node.status}`,
    })),
    rationale: params.rationale,
  }
}

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type { PrepToolPolicy, StrategyAdvisory } from '../strategy'

import { globalRegistry, initializeGlobalRegistry } from '../server/tool-descriptors'
import { PREP_TOOL_POLICY } from '../strategy'

export type WorkflowPrepToolLane
  = | 'display'
    | 'accessibility'
    | 'browser_dom'
    | 'browser_cdp'
    | 'pty'
    | 'desktop'
    | 'internal'

export type WorkflowPrepToolKind = 'probe' | 'mutation' | 'reroute' | 'internal'

export interface WorkflowPrepToolSpec {
  canonicalName: string
  displayName: string
  lane: WorkflowPrepToolLane
  kind: WorkflowPrepToolKind
  concurrencySafe: boolean
  summary: string
}

export interface PlannedPreparatoryExecution {
  advisory: StrategyAdvisory
  policy: PrepToolPolicy
  toolName: string
  spec: WorkflowPrepToolSpec
}

export interface PlannedPreparatoryExecutionBatch {
  priority: number
  parallel: boolean
  executions: PlannedPreparatoryExecution[]
}

/**
 * Map descriptor lanes to workflow prep lanes.
 */
function mapDescriptorLaneToWorkflowLane(lane: string): WorkflowPrepToolLane {
  const mapping: Record<string, WorkflowPrepToolLane> = {
    display: 'display',
    accessibility: 'accessibility',
    browser_dom: 'browser_dom',
    browser_cdp: 'browser_cdp',
    pty: 'pty',
    desktop: 'desktop',
    internal: 'internal',
  }
  return mapping[lane] ?? 'internal'
}

/**
 * Map descriptor kinds to workflow prep kinds.
 */
function mapDescriptorKindToWorkflowKind(kind: string, readOnly: boolean): WorkflowPrepToolKind {
  if (readOnly) {
    return 'probe'
  }
  if (kind === 'write' || kind === 'control') {
    return 'mutation'
  }
  if (kind === 'workflow') {
    return 'reroute'
  }
  return 'internal'
}

const unknownPrepToolSpec: WorkflowPrepToolSpec = {
  canonicalName: 'unknown',
  displayName: 'Workflow prep tool',
  lane: 'internal',
  kind: 'internal',
  concurrencySafe: false,
  summary: 'Internal workflow preparation tool.',
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  return value as Record<string, unknown>
}

export function canonicalizeWorkflowPrepToolName(toolName: string) {
  if (toolName.startsWith('pty_send_input:')) {
    return 'pty_send_input'
  }

  if (toolName.startsWith('pty_read_screen:')) {
    return 'pty_read_screen'
  }

  if (toolName.startsWith('pty_destroy:')) {
    return 'pty_destroy'
  }

  return toolName
}

/**
 * Resolve workflow prep tool spec from descriptor registry.
 * Falls back to unknown spec if not found.
 */
export function resolveWorkflowPrepToolSpec(toolName: string): WorkflowPrepToolSpec {
  const canonicalName = canonicalizeWorkflowPrepToolName(toolName)

  // Ensure registry is initialized
  if (!globalRegistry.has(canonicalName)) {
    // Try to initialize in case this is called early
    try {
      initializeGlobalRegistry()
    }
    catch {
      // Already initialized or other error; proceed with lookup
    }
  }

  // Lookup from descriptor registry
  if (globalRegistry.has(canonicalName)) {
    const descriptor = globalRegistry.get(canonicalName)
    return {
      canonicalName: descriptor.canonicalName,
      displayName: descriptor.displayName,
      lane: mapDescriptorLaneToWorkflowLane(descriptor.lane),
      kind: mapDescriptorKindToWorkflowKind(descriptor.kind, descriptor.readOnly),
      concurrencySafe: descriptor.concurrencySafe,
      summary: descriptor.summary,
    }
  }

  // Fallback to unknown spec
  return {
    ...unknownPrepToolSpec,
    canonicalName,
    displayName: canonicalName,
  }
}

export function buildPreparatoryExecutionPlan(advisories: StrategyAdvisory[]): PlannedPreparatoryExecutionBatch[] {
  const executions = advisories
    .filter(advisory => PREP_TOOL_POLICY[advisory.kind])
    .sort((a, b) => (PREP_TOOL_POLICY[a.kind]!.priority) - (PREP_TOOL_POLICY[b.kind]!.priority))
    .map((advisory) => {
      const policy = PREP_TOOL_POLICY[advisory.kind]!
      const toolName = advisory.suggestedToolName ?? `prep_${advisory.kind}`
      return {
        advisory,
        policy,
        toolName,
        spec: resolveWorkflowPrepToolSpec(toolName),
      } satisfies PlannedPreparatoryExecution
    })

  const batches: PlannedPreparatoryExecutionBatch[] = []

  for (const execution of executions) {
    const previousBatch = batches.at(-1)
    const canJoinPreviousBatch = previousBatch
      && previousBatch.priority === execution.policy.priority
      && previousBatch.parallel
      && execution.policy.outcomeOnSuccess === 'prepared'
      && execution.spec.concurrencySafe

    if (canJoinPreviousBatch) {
      previousBatch.executions.push(execution)
      continue
    }

    const parallel = execution.policy.outcomeOnSuccess === 'prepared'
      && execution.spec.concurrencySafe

    batches.push({
      priority: execution.policy.priority,
      parallel,
      executions: [execution],
    })
  }

  return batches
}

export function extractWorkflowPrepMetadata(toolName: string, result: CallToolResult): Record<string, unknown> | undefined {
  const structured = toRecord(result.structuredContent)

  if (!structured) {
    return undefined
  }

  switch (canonicalizeWorkflowPrepToolName(toolName)) {
    case 'display_enumerate':
      return {
        status: structured.status,
        displayCount: structured.displayCount,
        combinedBounds: structured.combinedBounds,
        capturedAt: structured.capturedAt,
      }
    case 'accessibility_snapshot':
      return {
        status: structured.status,
        appName: structured.appName,
        pid: structured.pid,
        nodeCount: structured.nodeCount,
        capturedAt: structured.capturedAt,
      }
    case 'browser_cdp_collect_elements':
      return {
        status: structured.status,
        elementCount: structured.elementCount,
        page: structured.page,
      }
    case 'browser_dom_read_page':
      return {
        status: structured.status,
        frameCount: structured.frameCount,
        interactiveElementCount: structured.interactiveElementCount,
        bridge: structured.bridge,
      }
    case 'pty_read_screen':
      return {
        status: structured.status,
        sessionId: structured.sessionId,
        alive: structured.alive,
        rows: structured.rows,
        cols: structured.cols,
        executionReason: structured.executionReason,
      }
    case 'pty_send_input':
    case 'pty_destroy':
      return typeof structured.status === 'string'
        ? {
            status: structured.status,
            sessionId: structured.sessionId,
          }
        : undefined
    default:
      return typeof structured.status === 'string'
        ? { status: structured.status }
        : undefined
  }
}

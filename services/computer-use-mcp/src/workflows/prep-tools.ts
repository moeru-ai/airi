import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type { PrepToolPolicy, StrategyAdvisory } from '../strategy'

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

const prepToolSpecs: Record<string, WorkflowPrepToolSpec> = {
  display_enumerate: {
    canonicalName: 'display_enumerate',
    displayName: 'Display enumerate',
    lane: 'display',
    kind: 'probe',
    concurrencySafe: true,
    summary: 'Capture display geometry and combined bounds before desktop interaction.',
  },
  accessibility_snapshot: {
    canonicalName: 'accessibility_snapshot',
    displayName: 'Accessibility snapshot',
    lane: 'accessibility',
    kind: 'probe',
    concurrencySafe: true,
    summary: 'Read the focused accessibility tree for semantic grounding.',
  },
  browser_cdp_collect_elements: {
    canonicalName: 'browser_cdp_collect_elements',
    displayName: 'Browser CDP collect elements',
    lane: 'browser_cdp',
    kind: 'probe',
    concurrencySafe: true,
    summary: 'Collect interactive browser elements through CDP.',
  },
  browser_dom_read_page: {
    canonicalName: 'browser_dom_read_page',
    displayName: 'Browser DOM read page',
    lane: 'browser_dom',
    kind: 'probe',
    concurrencySafe: true,
    summary: 'Read browser DOM frames and interactive elements from the extension bridge.',
  },
  pty_read_screen: {
    canonicalName: 'pty_read_screen',
    displayName: 'PTY read screen',
    lane: 'pty',
    kind: 'probe',
    concurrencySafe: false,
    summary: 'Read the current PTY screen buffer.',
  },
  pty_send_input: {
    canonicalName: 'pty_send_input',
    displayName: 'PTY send input',
    lane: 'pty',
    kind: 'mutation',
    concurrencySafe: false,
    summary: 'Write bytes into a PTY session.',
  },
  pty_destroy: {
    canonicalName: 'pty_destroy',
    displayName: 'PTY destroy session',
    lane: 'pty',
    kind: 'mutation',
    concurrencySafe: false,
    summary: 'Destroy a PTY session and revoke its grant.',
  },
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

export function resolveWorkflowPrepToolSpec(toolName: string): WorkflowPrepToolSpec {
  const canonicalName = canonicalizeWorkflowPrepToolName(toolName)
  return prepToolSpecs[canonicalName] ?? {
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

/**
 * Tool Lane Hygiene
 *
 * Lightweight cross-lane tool usage advisory. When an Agent calls a tool
 * that belongs to a different lane than the inferred active lane, this
 * module generates an informational advisory nudge.
 *
 * Advisory-only: never blocks execution.
 */

import type { ToolLane } from './tool-descriptors'

import { globalRegistry } from './tool-descriptors'

// NOTICE: These lanes are considered "omnipresent" — they serve every lane
// and should never trigger cross-lane advisories.
const EXEMPT_LANES: ReadonlySet<ToolLane> = new Set<ToolLane>([
  'workflow',
  'internal',
  'task_memory',
  'display',
])

/**
 * Look up the lane for a tool by its canonical name.
 * Returns undefined if the tool is not registered.
 */
export function inferToolLane(toolName: string): ToolLane | undefined {
  return globalRegistry.getOptional(toolName)?.lane
}

/**
 * Determine whether a tool invocation constitutes a cross-lane usage
 * relative to the inferred active lane, and if so, build an advisory string.
 *
 * Returns `null` when:
 * - No active lane is established yet (first tool call)
 * - The tool's lane matches the active lane
 * - Either lane is in the exempt set (workflow, internal, display, task_memory)
 * - The tool is not found in the registry
 */
export function buildCrossLaneAdvisory(params: {
  toolName: string
  toolLane: ToolLane
  inferredActiveLane: ToolLane | undefined
}): string | null {
  const { toolName, toolLane, inferredActiveLane } = params

  // No active lane yet — nothing to compare against.
  if (!inferredActiveLane) {
    return null
  }

  // Same lane — no advisory needed.
  if (toolLane === inferredActiveLane) {
    return null
  }

  // Exempt lanes never trigger advisories (either direction).
  if (EXEMPT_LANES.has(toolLane) || EXEMPT_LANES.has(inferredActiveLane)) {
    return null
  }

  return (
    `💡 Advisory: You are currently in the "${inferredActiveLane}" lane but called `
    + `"${toolName}" which belongs to the "${toolLane}" lane. `
    + `Consider using a handoff if you need to switch execution surfaces.`
  )
}

/**
 * Determine if a lane should update the inferred active lane.
 * Exempt lanes do not change the active lane inference.
 */
export function shouldUpdateActiveLane(lane: ToolLane): boolean {
  return !EXEMPT_LANES.has(lane)
}

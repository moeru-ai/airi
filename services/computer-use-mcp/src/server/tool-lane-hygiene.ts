/**
 * Tool Lane Hygiene
 *
 * Advisory-only tracking for cross-lane MCP tool usage. A lane mismatch
 * appends a nudge to the tool result, but never blocks execution.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

import type { ToolLane } from './tool-descriptors'

import { textContent } from './content'
import { globalRegistry, initializeGlobalRegistry } from './tool-descriptors'

const EXEMPT_LANES: ReadonlySet<ToolLane> = new Set<ToolLane>([
  'workflow',
  'internal',
  'task_memory',
  'display',
])

export interface ToolLaneStateManager {
  getState: () => Readonly<{ inferredActiveLane?: ToolLane }>
  updateInferredLane: (lane: ToolLane) => void
}

export function inferToolLane(toolName: string): ToolLane | undefined {
  if (globalRegistry.size === 0) {
    initializeGlobalRegistry()
  }

  return globalRegistry.getOptional(toolName)?.lane
}

export function buildCrossLaneAdvisory(params: {
  toolName: string
  toolLane: ToolLane
  inferredActiveLane: ToolLane | undefined
}): string | null {
  const { toolName, toolLane, inferredActiveLane } = params

  if (!inferredActiveLane) {
    return null
  }

  if (toolLane === inferredActiveLane) {
    return null
  }

  if (EXEMPT_LANES.has(toolLane) || EXEMPT_LANES.has(inferredActiveLane)) {
    return null
  }

  return (
    `Advisory: You are currently in the "${inferredActiveLane}" lane but called `
    + `"${toolName}" which belongs to the "${toolLane}" lane. `
    + 'Consider using a handoff if you need to switch execution surfaces.'
  )
}

export function shouldUpdateActiveLane(lane: ToolLane): boolean {
  return !EXEMPT_LANES.has(lane)
}

export function createToolLaneHygieneServer(
  server: McpServer,
  stateManager: ToolLaneStateManager,
): McpServer {
  return new Proxy(server, {
    get(target, prop, receiver) {
      if (prop !== 'tool') {
        return Reflect.get(target, prop, receiver)
      }

      return (name: string, ...rest: unknown[]) => {
        const handlerIndex = findLastHandlerIndex(rest)
        if (handlerIndex < 0) {
          return (server.tool as any)(name, ...rest)
        }

        const originalHandler = rest[handlerIndex] as (...args: any[]) => Promise<CallToolResult> | CallToolResult
        const wrappedHandler = async (...args: any[]): Promise<CallToolResult> => {
          const lane = inferToolLane(name)
          let advisory: string | null = null

          if (lane) {
            advisory = buildCrossLaneAdvisory({
              toolName: name,
              toolLane: lane,
              inferredActiveLane: stateManager.getState().inferredActiveLane,
            })

            if (shouldUpdateActiveLane(lane)) {
              stateManager.updateInferredLane(lane)
            }
          }

          const result = await originalHandler(...args)
          if (!advisory || !Array.isArray(result.content)) {
            return result
          }

          return {
            ...result,
            content: [
              ...result.content,
              textContent(`\n\n${advisory}`),
            ],
          }
        }

        const wrappedRest = [...rest]
        wrappedRest[handlerIndex] = wrappedHandler
        return (server.tool as any)(name, ...wrappedRest)
      }
    },
  })
}

function findLastHandlerIndex(args: unknown[]): number {
  for (let index = args.length - 1; index >= 0; index -= 1) {
    if (typeof args[index] === 'function') {
      return index
    }
  }

  return -1
}

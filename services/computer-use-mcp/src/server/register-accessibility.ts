import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import type { ComputerUseServerRuntime } from './runtime'

import { z } from 'zod'

import { captureAXTree, formatAXSnapshotAsText } from '../accessibility'
import { errorMessageFromValue } from '../utils/error-message'
import { textContent } from './content'

export interface RegisterAccessibilityToolsOptions {
  runtime: ComputerUseServerRuntime
  server: McpServer
}

export function registerAccessibilityTools({ runtime, server }: RegisterAccessibilityToolsOptions) {
  server.tool(
    'accessibility_snapshot',
    {
      includeBounds: z.boolean().optional().describe('Include screen-coordinate bounding rects in the text output'),
      maxDepth: z.number().int().min(1).max(30).optional().describe('Maximum tree depth to traverse (default: 15)'),
      maxNodes: z.number().int().min(1).max(10000).optional().describe('Maximum total nodes to collect (default: 2000)'),
      pid: z.number().int().min(1).optional().describe('Target a specific process by PID; defaults to the frontmost application'),
      verbose: z.boolean().optional().describe('Include all nodes, even those with empty roles/titles'),
    },
    async ({ includeBounds, maxDepth, maxNodes, pid, verbose }) => {
      try {
        const snapshot = await captureAXTree(runtime.config, {
          maxDepth,
          maxNodes,
          pid,
          verbose,
        })

        const text = formatAXSnapshotAsText(snapshot, {
          includeBounds: includeBounds ?? false,
          includeUids: true,
        })

        return {
          content: [
            textContent(text),
          ],
          structuredContent: {
            appName: snapshot.appName,
            capturedAt: snapshot.capturedAt,
            nodeCount: snapshot.uidToNode.size,
            pid: snapshot.pid,
            snapshotId: snapshot.snapshotId,
            status: 'ok',
            truncated: snapshot.truncated,
          },
        }
      }
      catch (error) {
        return {
          content: [
            textContent(`Accessibility snapshot failed: ${errorMessageFromValue(error)}`),
          ],
          isError: true,
          structuredContent: {
            error: errorMessageFromValue(error),
            status: 'error',
          },
        }
      }
    },
  )

  server.tool(
    'accessibility_find_element',
    {
      maxResults: z.number().int().min(1).max(50).optional().describe('Maximum matches to return (default: 10)'),
      pid: z.number().int().min(1).optional().describe('Target process PID; defaults to frontmost app'),
      role: z.string().optional().describe('AX role to search for, e.g. AXButton, AXTextField'),
      title: z.string().optional().describe('Title substring to match (case-insensitive)'),
    },
    async ({ maxResults, pid, role, title }) => {
      try {
        const snapshot = await captureAXTree(runtime.config, {
          maxDepth: 20,
          maxNodes: 5000,
          pid,
          verbose: true,
        })

        const limit = maxResults ?? 10
        const matches: Array<{
          bounds?: { height: number, width: number, x: number, y: number }
          role: string
          title?: string
          uid: string
          value?: string
        }> = []

        const titleLower = title?.toLowerCase()

        for (const [uid, node] of snapshot.uidToNode) {
          if (matches.length >= limit)
            break

          const roleMatch = !role || node.role === role
          const titleMatch = !titleLower || (node.title?.toLowerCase().includes(titleLower))

          if (roleMatch && titleMatch) {
            matches.push({
              bounds: node.bounds,
              role: node.role,
              title: node.title,
              uid,
              value: node.value,
            })
          }
        }

        return {
          content: [
            textContent(`Found ${matches.length} element(s) matching role=${role ?? 'any'}, title=${title ?? 'any'} in ${snapshot.appName}.`),
          ],
          structuredContent: {
            appName: snapshot.appName,
            matches,
            pid: snapshot.pid,
            status: 'ok',
          },
        }
      }
      catch (error) {
        return {
          content: [
            textContent(`Accessibility find failed: ${errorMessageFromValue(error)}`),
          ],
          isError: true,
          structuredContent: {
            error: errorMessageFromValue(error),
            status: 'error',
          },
        }
      }
    },
  )
}

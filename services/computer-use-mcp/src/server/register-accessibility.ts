import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import type { ComputerUseServerRuntime } from './runtime'

import { z } from 'zod'

import { captureAXTree, formatAXSnapshotAsText } from '../accessibility'
import { textContent } from './content'

export interface RegisterAccessibilityToolsOptions {
  server: McpServer
  runtime: ComputerUseServerRuntime
}

export function registerAccessibilityTools({ server, runtime }: RegisterAccessibilityToolsOptions) {
  server.tool(
    'accessibility_snapshot',
    {
      pid: z.number().int().min(1).optional().describe('Target a specific process by PID; defaults to the frontmost application'),
      maxDepth: z.number().int().min(1).max(30).optional().describe('Maximum tree depth to traverse (default: 15)'),
      maxNodes: z.number().int().min(1).max(10000).optional().describe('Maximum total nodes to collect (default: 2000)'),
      verbose: z.boolean().optional().describe('Include all nodes, even those with empty roles/titles'),
      includeBounds: z.boolean().optional().describe('Include screen-coordinate bounding rects in the text output'),
    },
    async ({ pid, maxDepth, maxNodes, verbose, includeBounds }) => {
      try {
        const snapshot = await captureAXTree(runtime.config, {
          pid,
          maxDepth,
          maxNodes,
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
            status: 'ok',
            appName: snapshot.appName,
            pid: snapshot.pid,
            snapshotId: snapshot.snapshotId,
            nodeCount: snapshot.uidToNode.size,
            truncated: snapshot.truncated,
            capturedAt: snapshot.capturedAt,
          },
        }
      }
      catch (error) {
        return {
          isError: true,
          content: [
            textContent(`Accessibility snapshot failed: ${error instanceof Error ? error.message : String(error)}`),
          ],
          structuredContent: {
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          },
        }
      }
    },
  )

  server.tool(
    'accessibility_find_element',
    {
      role: z.string().optional().describe('AX role to search for, e.g. AXButton, AXTextField'),
      title: z.string().optional().describe('Title substring to match (case-insensitive)'),
      pid: z.number().int().min(1).optional().describe('Target process PID; defaults to frontmost app'),
      maxResults: z.number().int().min(1).max(50).optional().describe('Maximum matches to return (default: 10)'),
    },
    async ({ role, title, pid, maxResults }) => {
      try {
        const snapshot = await captureAXTree(runtime.config, {
          pid,
          maxDepth: 20,
          maxNodes: 5000,
          verbose: true,
        })

        const limit = maxResults ?? 10
        const matches: Array<{
          uid: string
          role: string
          title?: string
          value?: string
          bounds?: { x: number, y: number, width: number, height: number }
        }> = []

        const titleLower = title?.toLowerCase()

        for (const [uid, node] of snapshot.uidToNode) {
          if (matches.length >= limit)
            break

          const roleMatch = !role || node.role === role
          const titleMatch = !titleLower || (node.title?.toLowerCase().includes(titleLower))

          if (roleMatch && titleMatch) {
            matches.push({
              uid,
              role: node.role,
              title: node.title,
              value: node.value,
              bounds: node.bounds,
            })
          }
        }

        return {
          content: [
            textContent(`Found ${matches.length} element(s) matching role=${role ?? 'any'}, title=${title ?? 'any'} in ${snapshot.appName}.`),
          ],
          structuredContent: {
            status: 'ok',
            appName: snapshot.appName,
            pid: snapshot.pid,
            matches,
          },
        }
      }
      catch (error) {
        return {
          isError: true,
          content: [
            textContent(`Accessibility find failed: ${error instanceof Error ? error.message : String(error)}`),
          ],
          structuredContent: {
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          },
        }
      }
    },
  )
}

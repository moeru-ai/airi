/**
 * Tool Directory Registration
 *
 * Registers the public `tool_directory` tool that provides
 * introspection into available tools.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { z } from 'zod'

import { textContent } from './content'
import { globalRegistry, initializeGlobalRegistry } from './tool-descriptors'

/**
 * Options for registering the tool directory.
 */
export interface RegisterToolDirectoryOptions {
  server: McpServer
}

/**
 * Register the tool_directory tool.
 *
 * This tool returns a directory of available tools with optional filtering.
 */
export function registerToolDirectory({ server }: RegisterToolDirectoryOptions): void {
  // Ensure registry is initialized
  if (globalRegistry.size === 0) {
    initializeGlobalRegistry()
  }

  server.tool(
    'tool_directory',
    'List available tools with optional filtering by lane, kind, or search query. Returns a compact directory for navigation and a structured list for programmatic access.',
    {
      lane: z.string().optional().describe(
        'Filter by tool lane (desktop, browser_dom, browser_cdp, coding, pty, display, accessibility, task_memory, vscode, workflow, internal)',
      ),
      kind: z.string().optional().describe(
        'Filter by tool kind (read, write, control, workflow, memory, internal)',
      ),
      readOnlyOnly: z.boolean().optional().describe(
        'If true, only return read-only tools that do not mutate state',
      ),
      approvalRequiredOnly: z.boolean().optional().describe(
        'If true, only return tools that require approval by default',
      ),
      query: z.string().optional().describe(
        'Case-insensitive substring search across tool names, display names, and summaries',
      ),
    },
    async ({ lane, kind, readOnlyOnly, approvalRequiredOnly, query }) => {
      // Query the registry with filters
      const results = globalRegistry.query({
        lane: lane as Parameters<typeof globalRegistry.query>[0]['lane'],
        kind: kind as Parameters<typeof globalRegistry.query>[0]['kind'],
        readOnlyOnly,
        approvalRequiredOnly,
        query,
      })

      // Build compact text output
      const lines = results.map(d =>
        `${d.canonicalName} | ${d.summary} | ${d.lane}`,
      )

      const compactText = lines.length > 0
        ? `Found ${lines.length} tool(s):\n\n${lines.join('\n')}`
        : 'No tools match the specified filters.'

      // Build structured output
      const structuredContent = {
        status: 'ok' as const,
        totalCount: results.length,
        filters: {
          lane: lane ?? null,
          kind: kind ?? null,
          readOnlyOnly: readOnlyOnly ?? false,
          approvalRequiredOnly: approvalRequiredOnly ?? false,
          query: query ?? null,
        },
        tools: results.map(d => ({
          canonicalName: d.canonicalName,
          displayName: d.displayName,
          summary: d.summary,
          lane: d.lane,
          kind: d.kind,
          readOnly: d.readOnly,
          destructive: d.destructive,
          concurrencySafe: d.concurrencySafe,
          requiresApprovalByDefault: d.requiresApprovalByDefault,
        })),
      }

      return {
        content: [textContent(compactText)],
        structuredContent,
      }
    },
  )
}

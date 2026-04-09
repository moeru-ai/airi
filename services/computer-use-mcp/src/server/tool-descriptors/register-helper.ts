/**
 * Registration Helper
 *
 * Utilities for descriptor-driven tool registration.
 */

import type { McpServer, RegisteredTool } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { ZodRawShape, ZodTypeAny } from 'zod'

import type { ToolDescriptor } from './types'

import { initializeGlobalRegistry } from './all'
import { globalRegistry } from './registry'

/**
 * Registry of instantiated tools on the current server.
 */
export const toolInstances = new Map<string, RegisteredTool>()

/**
 * Options for descriptor-driven tool registration.
 */
export interface DescriptorToolOptions<TSchema extends ZodRawShape> {
  /**
   * The tool descriptor (from registry or inline).
   */
  descriptor: ToolDescriptor

  /**
   * Zod schema for input validation.
   */
  schema: TSchema

  /**
   * Tool handler function.
   */
  handler: (input: { [K in keyof TSchema]: TSchema[K] extends ZodTypeAny ? TSchema[K]['_output'] : never }, extra: unknown) => Promise<CallToolResult>
}

/**
 * Register a tool using its descriptor.
 * The description is automatically taken from the descriptor's summary.
 */
export function registerToolWithDescriptor<TSchema extends ZodRawShape>(
  server: McpServer,
  options: DescriptorToolOptions<TSchema>,
): RegisteredTool {
  const { descriptor, schema, handler } = options

  // Validate descriptor is in registry (fail-closed)
  if (!globalRegistry.has(descriptor.canonicalName)) {
    throw new Error(
      `Tool "${descriptor.canonicalName}" is not registered in the global descriptor registry. `
      + 'All tools must have descriptors registered before use.',
    )
  }

  // Register with MCP server
  // The description comes from the descriptor's summary
  // NOTE: cast required due MCP SDK overload shape not expressing generic descriptor schema here.
  const register = server.tool as unknown as (
    name: string,
    description: string,
    schema: TSchema,
    handler: DescriptorToolOptions<TSchema>['handler'],
  ) => RegisteredTool

  const registeredTool = register(
    descriptor.canonicalName,
    descriptor.summary,
    schema,
    handler,
  )

  toolInstances.set(descriptor.canonicalName, registeredTool)

  if (descriptor.defaultDeferred && registeredTool?.disable) {
    registeredTool.disable()
  }

  return registeredTool
}

/**
 * Get descriptor for a tool name, throwing if not found.
 */
export function requireDescriptor(canonicalName: string): ToolDescriptor {
  if (globalRegistry.size === 0) {
    initializeGlobalRegistry()
  }
  return globalRegistry.get(canonicalName)
}

/**
 * Get descriptor summary for use in tool registration.
 */
export function getToolSummary(canonicalName: string): string {
  return globalRegistry.get(canonicalName).summary
}

/**
 * Check if a tool is read-only according to its descriptor.
 */
export function isToolReadOnly(canonicalName: string): boolean {
  return globalRegistry.get(canonicalName).readOnly
}

/**
 * Check if a tool requires approval by default according to its descriptor.
 */
export function toolRequiresApprovalByDefault(canonicalName: string): boolean {
  return globalRegistry.get(canonicalName).requiresApprovalByDefault
}

/**
 * Check if a tool is concurrency-safe according to its descriptor.
 */
export function isToolConcurrencySafe(canonicalName: string): boolean {
  return globalRegistry.get(canonicalName).concurrencySafe
}

/**
 * Get the lane for a tool.
 */
export function getToolLane(canonicalName: string): string {
  return globalRegistry.get(canonicalName).lane
}

/**
 * Get the kind for a tool.
 */
export function getToolKind(canonicalName: string): string {
  return globalRegistry.get(canonicalName).kind
}

/**
 * Validate that all tool names have registered descriptors.
 * Useful for testing registry completeness.
 */
export function validateToolsHaveDescriptors(toolNames: string[]): {
  valid: boolean
  missing: string[]
  orphans: string[]
} {
  const missing = globalRegistry.validateCompleteness(toolNames)
  const orphans = globalRegistry.findOrphans(toolNames)

  return {
    valid: missing.length === 0,
    missing,
    orphans,
  }
}

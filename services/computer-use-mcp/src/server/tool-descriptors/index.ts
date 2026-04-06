/**
 * Tool Descriptors Module
 *
 * This module provides the unified tool descriptor registry for computer-use-mcp.
 * All public MCP tools should have their metadata defined here as the single
 * source of truth.
 *
 * Usage:
 * ```typescript
 * import { globalRegistry, initializeGlobalRegistry } from './tool-descriptors'
 *
 * // At server startup
 * initializeGlobalRegistry()
 *
 * // Get a descriptor
 * const desc = globalRegistry.get('accessibility_snapshot')
 *
 * // Query tools
 * const readOnlyTools = globalRegistry.query({ readOnlyOnly: true })
 * ```
 */

// All descriptors
export {
  accessibilityDescriptors,
  allDescriptors,
  allDescriptorsIncludingInternal,
  cdpDescriptors,
  codingDescriptors,
  createPopulatedRegistry,
  desktopDescriptors,
  displayDescriptors,
  initializeGlobalRegistry,
  internalDescriptors,
  metaDescriptors,
  ptyDescriptors,
  taskMemoryDescriptors,
  vscodeDescriptors,
} from './all'
// Helpers
export {
  getToolKind,
  getToolLane,
  getToolSummary,
  isToolConcurrencySafe,
  isToolReadOnly,
  registerToolWithDescriptor,
  requireDescriptor,
  toolRequiresApprovalByDefault,
  validateToolsHaveDescriptors,
} from './register-helper'

// Registry
export type { ToolQueryOptions } from './registry'
export { globalRegistry, ToolDescriptorRegistry } from './registry'

// Types
export type { ToolDescriptor, ToolKind, ToolLane } from './types'
export { isToolDescriptor, validateDescriptor } from './types'

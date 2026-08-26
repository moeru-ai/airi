/**
 * Aggregate All Tool Descriptors
 *
 * This module combines all domain-specific descriptor modules
 * and exports a unified registry.
 */

import type { ToolDescriptor } from './types'

import { accessibilityDescriptors } from './accessibility'
import { cdpDescriptors } from './cdp'
import { codingDescriptors } from './coding'
import { desktopDescriptors, internalDescriptors, metaDescriptors } from './desktop'
import { displayDescriptors } from './display'
import { ptyDescriptors } from './pty'
import { globalRegistry, ToolDescriptorRegistry } from './registry'
import { taskMemoryDescriptors } from './task-memory'
import { vscodeDescriptors } from './vscode'

/**
 * All public tool descriptors combined.
 */
export const allDescriptors: ToolDescriptor[] = [
  ...accessibilityDescriptors,
  ...cdpDescriptors,
  ...codingDescriptors,
  ...desktopDescriptors,
  ...displayDescriptors,
  ...ptyDescriptors,
  ...taskMemoryDescriptors,
  ...vscodeDescriptors,
  ...metaDescriptors,
]

/**
 * All descriptors including internal/test tools.
 */
export const allDescriptorsIncludingInternal: ToolDescriptor[] = [
  ...allDescriptors,
  ...internalDescriptors,
]

/**
 * Initialize the global registry with all descriptors.
 * Call this once at server startup.
 */
export function initializeGlobalRegistry(): ToolDescriptorRegistry {
  globalRegistry.clear()
  globalRegistry.registerAll(allDescriptorsIncludingInternal)
  return globalRegistry
}

/**
 * Create a new registry pre-populated with all descriptors.
 * Useful for testing or isolated scenarios.
 */
export function createPopulatedRegistry(): ToolDescriptorRegistry {
  const registry = new ToolDescriptorRegistry()
  registry.registerAll(allDescriptorsIncludingInternal)
  return registry
}

// Re-export domain descriptors for direct access
export {
  accessibilityDescriptors,
  cdpDescriptors,
  codingDescriptors,
  desktopDescriptors,
  displayDescriptors,
  internalDescriptors,
  metaDescriptors,
  ptyDescriptors,
  taskMemoryDescriptors,
  vscodeDescriptors,
}

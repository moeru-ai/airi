/**
 * AIRI Core — Capability Registry
 *
 * Central registry for capabilities and their tools. Enforces uniqueness
 * of both capability IDs and tool IDs across all registered capabilities.
 *
 * Design decisions:
 * - Instance-based (not global) for testability and isolation.
 * - Tool IDs must be unique across all capabilities — registering a tool
 *   with a duplicate ID throws to prevent silent overwrites.
 * - Thread-safe for single-threaded Node.js execution model.
 */

import type {
  CapabilityDescriptor,
  CapabilityId,
  CapabilityInfo,
  CapabilityStatus,
  ToolDescriptor,
  ToolId,
} from './types.js'

/**
 * Central registry for capabilities and their tools.
 *
 * Each instance manages its own set of capabilities. This enables
 * per-executor capability configuration and avoids global state.
 */
export class CapabilityRegistry {
  /** Map of capability ID → capability info. */
  private readonly capabilities = new Map<CapabilityId, CapabilityInfo>()

  /** Map of tool ID → capability ID for fast tool lookup. */
  private readonly toolToCapability = new Map<ToolId, CapabilityId>()

  /**
   * Register a capability.
   *
   * Throws on duplicate capability ID or duplicate tool ID (across
   * all registered capabilities).
   *
   * @param descriptor - The capability descriptor to register.
   * @throws Error if capability ID or any tool ID is already registered.
   */
  register(descriptor: CapabilityDescriptor): void {
    if (this.capabilities.has(descriptor.id)) {
      throw new Error(`Capability already registered: ${descriptor.id}`)
    }

    // Check for tool ID collisions across all capabilities.
    for (const tool of descriptor.tools) {
      const existingCapability = this.toolToCapability.get(tool.id)
      if (existingCapability !== undefined) {
        throw new Error(
          `Tool ID collision: "${tool.id}" is already registered under capability "${existingCapability}"`,
        )
      }
    }

    // Register tool mappings.
    for (const tool of descriptor.tools) {
      this.toolToCapability.set(tool.id, descriptor.id)
    }

    const info: CapabilityInfo = {
      descriptor,
      status: 'registered' as CapabilityStatus,
      registeredAt: Date.now(),
    }
    this.capabilities.set(descriptor.id, info)
  }

  /**
   * Unregister a capability by its ID.
   *
   * Removes the capability and all its tool mappings.
   *
   * @param capabilityId - The capability identifier.
   * @returns true if the capability was removed, false if not found.
   */
  unregister(capabilityId: CapabilityId): boolean {
    const info = this.capabilities.get(capabilityId)
    if (!info)
      return false

    // Remove tool mappings.
    for (const tool of info.descriptor.tools) {
      this.toolToCapability.delete(tool.id)
    }

    this.capabilities.delete(capabilityId)
    return true
  }

  /**
   * Get capability info by ID.
   *
   * @param capabilityId - The capability identifier.
   * @returns The capability info, or undefined if not registered.
   */
  get(capabilityId: CapabilityId): CapabilityInfo | undefined {
    return this.capabilities.get(capabilityId)
  }

  /**
   * List all registered capabilities.
   *
   * @returns Array of all registered capability info objects.
   */
  list(): CapabilityInfo[] {
    return [...this.capabilities.values()]
  }

  /**
   * Find all capabilities owned by a given module.
   *
   * @param moduleId - The module identifier.
   * @returns Array of capability info objects for the module.
   */
  findByModule(moduleId: string): CapabilityInfo[] {
    return this.list().filter(
      info => info.descriptor.moduleId === moduleId,
    )
  }

  /**
   * Find the capability and tool descriptor for a given tool ID.
   *
   * @param toolId - The tool identifier.
   * @returns The capability info and tool descriptor, or undefined if not found.
   */
  findTool(toolId: ToolId): { capability: CapabilityInfo, tool: ToolDescriptor } | undefined {
    const capabilityId = this.toolToCapability.get(toolId)
    if (capabilityId === undefined)
      return undefined

    const capability = this.capabilities.get(capabilityId)
    if (!capability)
      return undefined

    const tool = capability.descriptor.tools.find(t => t.id === toolId)
    if (!tool)
      return undefined

    return { capability, tool }
  }

  /**
   * Check whether a tool is registered.
   *
   * @param toolId - The tool identifier.
   * @returns true if the tool is registered.
   */
  hasTool(toolId: ToolId): boolean {
    return this.toolToCapability.has(toolId)
  }

  /**
   * Remove all registered capabilities and tool mappings.
   *
   * @returns The number of capabilities removed.
   */
  clear(): number {
    const count = this.capabilities.size
    this.capabilities.clear()
    this.toolToCapability.clear()
    return count
  }

  /**
   * Get the number of registered capabilities.
   */
  size(): number {
    return this.capabilities.size
  }
}

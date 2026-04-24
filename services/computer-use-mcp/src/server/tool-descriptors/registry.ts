/**
 * Tool Descriptor Registry
 *
 * Central registry for all tool descriptors. Provides lookup, query,
 * and validation capabilities.
 */

import type { ToolDescriptor, ToolKind, ToolLane } from './types'

import { validateDescriptor } from './types'

/**
 * Filter options for querying tools.
 */
export interface ToolQueryOptions {
  lane?: ToolLane
  kind?: ToolKind
  readOnlyOnly?: boolean
  approvalRequiredOnly?: boolean
  query?: string
}

/**
 * Tool Descriptor Registry manages all tool descriptors and provides
 * lookup, query, and validation capabilities.
 */
export class ToolDescriptorRegistry {
  private readonly descriptors: Map<string, ToolDescriptor> = new Map()

  /**
   * Register a single descriptor. Validates completeness and uniqueness.
   */
  register(descriptor: ToolDescriptor): void {
    validateDescriptor(descriptor)

    if (this.descriptors.has(descriptor.canonicalName)) {
      throw new Error(`Duplicate tool descriptor: ${descriptor.canonicalName}`)
    }

    this.descriptors.set(descriptor.canonicalName, descriptor)
  }

  /**
   * Register multiple descriptors.
   */
  registerAll(descriptors: ToolDescriptor[]): void {
    for (const descriptor of descriptors) {
      this.register(descriptor)
    }
  }

  /**
   * Get a descriptor by canonical name.
   * Throws if not found (fail-closed).
   */
  get(canonicalName: string): ToolDescriptor {
    const descriptor = this.descriptors.get(canonicalName)
    if (!descriptor) {
      throw new Error(`Unknown tool: ${canonicalName}. All tools must have registered descriptors.`)
    }
    return descriptor
  }

  /**
   * Get a descriptor by canonical name, or undefined if not found.
   */
  getOptional(canonicalName: string): ToolDescriptor | undefined {
    return this.descriptors.get(canonicalName)
  }

  /**
   * Check if a tool is registered.
   */
  has(canonicalName: string): boolean {
    return this.descriptors.has(canonicalName)
  }

  /**
   * Get all registered descriptors.
   */
  getAll(): ToolDescriptor[] {
    return Array.from(this.descriptors.values())
  }

  /**
   * Get all public descriptors (tools exposed to MCP clients).
   */
  getPublic(): ToolDescriptor[] {
    return this.getAll().filter(d => d.public)
  }

  /**
   * Get all canonical names.
   */
  getNames(): string[] {
    return Array.from(this.descriptors.keys())
  }

  /**
   * Get the count of registered descriptors.
   */
  get size(): number {
    return this.descriptors.size
  }

  /**
   * Query descriptors with filters.
   */
  query(options: ToolQueryOptions = {}): ToolDescriptor[] {
    let results = this.getPublic()

    if (options.lane) {
      results = results.filter(d => d.lane === options.lane)
    }

    if (options.kind) {
      results = results.filter(d => d.kind === options.kind)
    }

    if (options.readOnlyOnly) {
      results = results.filter(d => d.readOnly)
    }

    if (options.approvalRequiredOnly) {
      results = results.filter(d => d.requiresApprovalByDefault)
    }

    if (options.query) {
      const queryLower = options.query.toLowerCase()
      results = results.filter(d =>
        d.canonicalName.toLowerCase().includes(queryLower)
        || d.displayName.toLowerCase().includes(queryLower)
        || d.summary.toLowerCase().includes(queryLower),
      )
    }

    return results
  }

  /**
   * Get descriptors grouped by lane.
   */
  groupByLane(): Map<ToolLane, ToolDescriptor[]> {
    const groups = new Map<ToolLane, ToolDescriptor[]>()

    for (const descriptor of this.getPublic()) {
      const existing = groups.get(descriptor.lane) || []
      existing.push(descriptor)
      groups.set(descriptor.lane, existing)
    }

    return groups
  }

  /**
   * Get descriptors grouped by kind.
   */
  groupByKind(): Map<ToolKind, ToolDescriptor[]> {
    const groups = new Map<ToolKind, ToolDescriptor[]>()

    for (const descriptor of this.getPublic()) {
      const existing = groups.get(descriptor.kind) || []
      existing.push(descriptor)
      groups.set(descriptor.kind, existing)
    }

    return groups
  }

  /**
   * Validate that all provided tool names have registered descriptors.
   * Returns list of missing tool names.
   */
  validateCompleteness(toolNames: string[]): string[] {
    return toolNames.filter(name => !this.has(name))
  }

  /**
   * Find orphan descriptors (registered but not in provided tool names).
   */
  findOrphans(toolNames: string[]): string[] {
    const toolSet = new Set(toolNames)
    return this.getNames().filter(name => !toolSet.has(name))
  }

  /**
   * Clear all registered descriptors (for testing).
   */
  clear(): void {
    this.descriptors.clear()
  }
}

/**
 * Global registry instance.
 */
export const globalRegistry = new ToolDescriptorRegistry()

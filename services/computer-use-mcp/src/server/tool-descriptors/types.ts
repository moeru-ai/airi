/**
 * Tool Descriptor Registry Types
 *
 * This module defines the canonical types for tool descriptors in the
 * computer-use-mcp package. All public MCP tools must have a descriptor
 * registered with all required fields (fail-closed policy).
 */

/**
 * Tool lanes represent the domain/subsystem a tool belongs to.
 * Each lane groups related tools that operate on the same surface.
 */
export type ToolLane
  = | 'desktop' // Desktop automation (click, type, screenshot, etc.)
    | 'browser_dom' // Browser DOM via extension bridge
    | 'browser_cdp' // Browser via Chrome DevTools Protocol
    | 'coding' // Code analysis and editing
    | 'pty' // PTY/terminal session management
    | 'display' // Display enumeration and identification
    | 'accessibility' // Accessibility tree inspection
    | 'task_memory' // Task execution state management
    | 'vscode' // VS Code CLI automation
    | 'workflow' // Workflow orchestration tools
    | 'internal' // Internal/diagnostic tools

/**
 * Tool kinds represent the nature of a tool's operation.
 */
export type ToolKind
  = | 'read' // Read-only observation (screenshot, status, enumerate)
    | 'write' // State mutation (click, type, patch, create)
    | 'control' // Control flow (wait, reset, connect)
    | 'workflow' // Workflow orchestration (plan, report)
    | 'memory' // State/memory management
    | 'internal' // Internal diagnostics

/**
 * Tool descriptor defines the canonical metadata for a single MCP tool.
 * All fields are required (fail-closed policy). No field may be left undefined.
 */
export interface ToolDescriptor {
  /**
   * Canonical tool name as registered with MCP server.
   * Must match exactly what's passed to `server.tool(name, ...)`.
   * Format: snake_case, e.g., 'accessibility_snapshot'
   */
  canonicalName: string

  /**
   * Human-readable display name.
   * Format: Title Case, e.g., 'Accessibility Snapshot'
   */
  displayName: string

  /**
   * One-sentence description of what the tool does.
   * This is used as the MCP tool description.
   */
  summary: string

  /**
   * The domain/subsystem this tool belongs to.
   */
  lane: ToolLane

  /**
   * The nature of this tool's operation.
   */
  kind: ToolKind

  /**
   * Whether this tool only reads state and never mutates it.
   * True = safe to call without approval for observation.
   */
  readOnly: boolean

  /**
   * Whether this tool can cause irreversible changes.
   * True = extra caution required (e.g., file deletion, code mutation).
   */
  destructive: boolean

  /**
   * Whether this tool is safe to run concurrently with other tools.
   * False = should be serialized in workflow execution.
   */
  concurrencySafe: boolean

  /**
   * Whether this tool requires approval by default.
   * This is the baseline; stricter rules may still apply.
   */
  requiresApprovalByDefault: boolean

  /**
   * Whether this tool is exposed to MCP clients.
   * False = internal tool not registered with MCP server.
   */
  public: boolean
  /**
   * Whether this tool is hidden from the default tool list to reduce context bloat.
   * True = deferred loading (must be explicitly enabled via tool_search).
   */
  defaultDeferred?: boolean
}

/**
 * Type guard to check if an object is a valid ToolDescriptor.
 */
export function isToolDescriptor(obj: unknown): obj is ToolDescriptor {
  if (typeof obj !== 'object' || obj === null) {
    return false
  }

  const record = obj as Record<string, unknown>

  return (
    typeof record.canonicalName === 'string'
    && typeof record.displayName === 'string'
    && typeof record.summary === 'string'
    && typeof record.lane === 'string'
    && typeof record.kind === 'string'
    && typeof record.readOnly === 'boolean'
    && typeof record.destructive === 'boolean'
    && typeof record.concurrencySafe === 'boolean'
    && typeof record.requiresApprovalByDefault === 'boolean'
    && typeof record.public === 'boolean'
  )
}

/**
 * Validates that a descriptor has all required fields.
 * Throws if any field is missing or invalid.
 */
export function validateDescriptor(descriptor: ToolDescriptor): void {
  const requiredFields: (keyof ToolDescriptor)[] = [
    'canonicalName',
    'displayName',
    'summary',
    'lane',
    'kind',
    'readOnly',
    'destructive',
    'concurrencySafe',
    'requiresApprovalByDefault',
    'public',
  ]

  for (const field of requiredFields) {
    if (descriptor[field] === undefined || descriptor[field] === null) {
      throw new Error(`ToolDescriptor "${descriptor.canonicalName || 'unknown'}" is missing required field: ${field}`)
    }
  }

  // Validate lane
  const validLanes: ToolLane[] = [
    'desktop',
    'browser_dom',
    'browser_cdp',
    'coding',
    'pty',
    'display',
    'accessibility',
    'task_memory',
    'vscode',
    'workflow',
    'internal',
  ]
  if (!validLanes.includes(descriptor.lane)) {
    throw new Error(`ToolDescriptor "${descriptor.canonicalName}" has invalid lane: ${descriptor.lane}`)
  }

  // Validate kind
  const validKinds: ToolKind[] = ['read', 'write', 'control', 'workflow', 'memory', 'internal']
  if (!validKinds.includes(descriptor.kind)) {
    throw new Error(`ToolDescriptor "${descriptor.canonicalName}" has invalid kind: ${descriptor.kind}`)
  }
}

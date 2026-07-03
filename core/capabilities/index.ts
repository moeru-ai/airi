/**
 * AIRI Core — Capability Runtime
 *
 * Barrel export for the capability + tool runtime layer.
 *
 * @example
 * ```ts
 * import {
 *   CapabilityRegistry,
 *   createCapabilityId,
 *   createToolId,
 * } from '../core/capabilities/index.js'
 * ```
 */

// ── Registry
export { CapabilityRegistry } from './registry.js'
// ── Types
export type {
  CapabilityDescriptor,
  CapabilityId,
  CapabilityInfo,
  CapabilityStatus,
  ToolDescriptor,
  ToolExecutionContext,
  ToolExecutionResult,
  ToolId,
  WorkspaceContext,
} from './types.js'

export { createCapabilityId, createToolId } from './types.js'
